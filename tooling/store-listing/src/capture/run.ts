/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path, sonarjs/cognitive-complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, unicorn/prefer-top-level-await, unicorn/no-array-reverse, sonarjs/no-misleading-array-reverse -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
/**
 * Simulator capture for the App Store listing: ONE run builds the app, creates a
 * throwaway simulator, enables the extension with Maestro, captures every shot
 * and gates the result. Usage:
 *
 *   tsx src/capture/run.ts --locale uk --out <dir> [--reuse-build]
 *   tsx src/capture/run.ts --smoke-localhost            # no proxy, no mock sites
 *
 * Never touches a pre-existing simulator, and changes the Mac's proxy ONLY when
 * CI=true (restored in `finally`). See proxy-state.ts.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import {
  build,
  builtAppPath,
  BUNDLE_ID,
  extensionVersion,
  gitSha,
  PACKAGE_ROOT,
  REPO_ROOT,
} from './build';
import { evaluateGates } from './gates';
import type { ShotRecord } from './gates';
import { LABELS } from './labels';
import { runFlow } from './maestro';
import { freePort, startMockProxy } from './mock-proxy';
import type { MockProxy } from './mock-proxy';
import {
  manualProxyInstructions,
  parseProxyGet,
  planProxy,
  serviceForInterface,
} from './proxy-state';
import type { ProxyPlan } from './proxy-state';
import { log, out } from './sh';
import * as sim from './simulator';
import { DEVICE_TYPE_NAME, SCREENSHOT_SIZE, SHOTS } from './shots';
import type { Locale } from './shots';

const { values } = parseArgs({
  options: {
    locale: { type: 'string', default: 'uk' },
    out: { type: 'string' },
    'smoke-localhost': { type: 'boolean', default: false },
    'local-proxy-already-set': { type: 'boolean', default: false },
    'reuse-build': { type: 'boolean', default: false },
    'keep-sim': { type: 'boolean', default: false },
    'proxy-port': { type: 'string', default: '8877' },
  },
});

const locale = values.locale as Locale;
if (locale !== 'uk' && locale !== 'en') throw new Error('--locale must be uk or en');
const smoke = values['smoke-localhost'];
const isCI = process.env['CI'] === 'true';
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const cache = path.join(PACKAGE_ROOT, '.cache');
const derived = path.join(cache, 'derived');
const runDir = path.join(cache, 'captures', runId, locale);
const debugDir = path.join(cache, 'maestro-debug', runId);

const cleanups: (() => Promise<void> | void)[] = [];
let cleaning: Promise<void> | null = null;
async function cleanup(): Promise<void> {
  cleaning ??= (async () => {
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch (error) {
        console.error('cleanup step failed:', error);
      }
    }
  })();
  return cleaning;
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    void cleanup().finally(() => process.exit(130));
  });
}

const networksetup = (args: readonly string[]): string =>
  out('sudo', ['-n', 'networksetup', ...args]);

/** CI only: read the active service's proxy state, apply ours, register the restore. */
function pointSystemProxyAt(port: number): void {
  const iface = /interface:\s*(\S+)/.exec(out('route', ['-n', 'get', 'default']))?.[1];
  const service = iface
    ? serviceForInterface(out('networksetup', ['-listnetworkserviceorder']), iface)
    : null;
  if (!service) throw new Error('cannot find the active network service');
  const plan: ProxyPlan = planProxy(service, '127.0.0.1', port, {
    web: parseProxyGet(out('networksetup', ['-getwebproxy', service])),
    secure: parseProxyGet(out('networksetup', ['-getsecurewebproxy', service])),
  });
  // Register the restore BEFORE applying: a half-applied change still unwinds.
  cleanups.push(() => {
    for (const cmd of plan.restore) networksetup(cmd);
    log(`▸ system proxy restored on "${plan.service}"`);
  });
  for (const cmd of plan.apply) networksetup(cmd);
  log(`▸ system proxy on "${plan.service}" → 127.0.0.1:${port}`);
}

async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(file).metadata();
  return { width: width ?? 0, height: height ?? 0 };
}

async function main(): Promise<void> {
  const started = new Date().toISOString();
  mkdirSync(runDir, { recursive: true });
  mkdirSync(debugDir, { recursive: true });

  // 0. Proxy policy first, so a local run fails fast before the long build.
  const port = Number.parseInt(values['proxy-port'], 10);
  if (!smoke && !isCI && !values['local-proxy-already-set']) {
    console.error(manualProxyInstructions('Wi-Fi', '127.0.0.1', port));
    throw new Error('refusing to change network settings outside CI');
  }

  // 1. Build.
  const app =
    values['reuse-build'] && existsSync(builtAppPath(derived))
      ? builtAppPath(derived)
      : build(derived);
  const sha = gitSha();

  // 2. Servers: mock proxy (real run) or a localhost fixture (smoke).
  let proxy: MockProxy | null = null;
  let smokeUrl = '';
  if (smoke) {
    // A CHILD process, not an in-process server: every step of this script is a
    // synchronous exec (maestro, xcrun), which would freeze our own event loop
    // and leave Safari staring at a server that never answers.
    const fixture = path.join(REPO_ROOT, 'apps/e2e/src/fixtures/html/picker-listbox-ru.html');
    const smokePort = await freePort();
    const server = spawn(
      process.execPath,
      [
        '-e',
        `const fs=require('fs');require('http').createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(fs.readFileSync(process.argv[1]))}).listen(Number(process.argv[2]))`,
        fixture,
        String(smokePort),
      ],
      { stdio: 'ignore' },
    );
    cleanups.push(() => {
      server.kill('SIGTERM');
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    smokeUrl = `http://localhost:${smokePort}/`;
  } else {
    proxy = await startMockProxy(
      await freePort().then((free) => (isCI ? port : free)),
      path.join(runDir, 'proxy.log'),
    );
    cleanups.push(async () => proxy?.stop());
    if (isCI) pointSystemProxyAt(proxy.port);
    else log(`▸ expecting the system proxy to already point at the mock proxy (${proxy.port})`);
  }

  // 3. Throwaway simulator (deleted in cleanup, whatever happens next).
  const device = sim.createThrowaway(DEVICE_TYPE_NAME, runId);
  cleanups.push(() => {
    if (values['keep-sim']) {
      log(`▸ --keep-sim: leaving ${device.name} (${device.udid}); delete it yourself`);
      return;
    }
    sim.destroy(device);
    log(`▸ deleted simulator ${device.name}`);
  });
  log(`▸ simulator ${device.name} ${device.udid} (${device.runtimeName})`);
  sim.presetLocale(device, locale);
  sim.boot(device);
  sim.polish(device);
  if (proxy) sim.installRootCert(device, proxy.caCertPath);
  sim.installApp(device, app);

  // 4. Setup flows.
  const labels = LABELS[locale];
  for (const flow of ['00-enable-extension', '01-host-app-hide-content']) {
    if (!runFlow(device.udid, flow, labels, debugDir)) throw new Error(`setup flow ${flow} failed`);
  }
  sim.terminate(device, BUNDLE_ID);

  // 5. Shots.
  const records: ShotRecord[] = [];
  const files: { id: string; file: string; capturedAt: string }[] = [];
  const plan = smoke
    ? [{ id: 'smoke', url: smokeUrl, flow: 'shot-smoke', env: {} as Record<string, string> }]
    : SHOTS.map((shot) => ({
        id: shot.id,
        url: shot.url,
        flow: shot.flow,
        env: { V: shot.expect[locale].visible, A: shot.expect[locale].absent },
      }));
  for (const shot of plan) {
    log(`▸ shot ${shot.id}`);
    sim.terminate(device, 'com.apple.mobilesafari');
    sim.openUrl(device, shot.url);
    if (!runFlow(device.udid, shot.flow, shot.env, debugDir)) {
      throw new Error(`shot "${shot.id}": expected state not reached (wrong state)`);
    }
    const file = path.join(runDir, `${shot.id}.png`);
    sim.screenshot(device, file);
    const version = sim.installedVersion(device, BUNDLE_ID);
    records.push({
      id: shot.id,
      ...(await pngSize(file)),
      appVersion: version.version,
      appBuild: version.build,
    });
    files.push({ id: shot.id, file, capturedAt: new Date().toISOString() });
  }

  // 6. Gates.
  const summary = proxy?.summary() ?? null;
  const failures = evaluateGates({
    proxy: summary,
    shots: records,
    expectedIds: plan.map((shot) => shot.id),
    size: SCREENSHOT_SIZE,
  });
  const manifest = {
    runId,
    locale,
    smoke,
    version: extensionVersion(),
    appVersion: records[0]?.appVersion,
    appBuild: records[0]?.appBuild,
    sha,
    simulator: { device: DEVICE_TYPE_NAME, runtime: device.runtimeName, runtimeId: device.runtime },
    startedAt: started,
    finishedAt: new Date().toISOString(),
    proxy: summary,
    shots: records.map((record) => ({
      ...record,
      capturedAt: files.find((f) => f.id === record.id)?.capturedAt,
    })),
    failures,
  };
  writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (failures.length > 0) {
    rmSync(runDir, { recursive: true, force: true });
    throw new Error(`gates failed, no outputs kept:\n  - ${failures.join('\n  - ')}`);
  }

  // 7. Success: copy out.
  if (values.out) {
    const dest = path.resolve(values.out, locale);
    mkdirSync(dest, { recursive: true });
    for (const { file } of files) copyFileSync(file, path.join(dest, path.basename(file)));
    cpSync(path.join(runDir, 'manifest.json'), path.join(dest, 'manifest.json'));
    log(`✓ ${files.length} shot(s) → ${dest}`);
  }
  log(`✓ run ${runId} passed; captures in ${runDir}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => cleanup());
