/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path, sonarjs/cognitive-complexity, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, unicorn/prefer-top-level-await, unicorn/no-array-reverse, sonarjs/no-misleading-array-reverse -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
/**
 * Simulator capture for the App Store listing: ONE run builds the app, creates a
 * throwaway simulator, enables the extension with Maestro, captures every shot
 * and gates the result. Usage:
 *
 *   tsx src/capture/run.ts --locale uk [--device iphone|ipad] --out <dir> [--reuse-build]
 *
 * Shots land in `<out>/<device>/<locale>/`.
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
import { evaluateGates, hostSettingsSummary } from './gates';
import type { ShotRecord } from './gates';
import { LABELS } from './labels';
import { runFlow } from './maestro';
import { sleepSync } from './retry';
import { freePort, startMockProxy } from './mock-proxy';
import type { MockProxy } from './mock-proxy';
import { createLifecycle } from './lifecycle';
import { manualProxyInstructions } from './proxy-state';
import { log } from './sh';
import { pointSystemProxyAt } from './system-proxy';
import * as sim from './simulator';
import { beforePlan, CAPTURE_DEVICES, listingPlan, smokePlan } from './shots';
import type { CaptureDevice, Locale, PlannedShot } from './shots';

const { values } = parseArgs({
  options: {
    locale: { type: 'string', default: 'uk' },
    device: { type: 'string', default: 'iphone' },
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
const deviceName = values.device as CaptureDevice;
if (deviceName !== 'iphone' && deviceName !== 'ipad')
  throw new Error('--device must be iphone or ipad');
const profile = CAPTURE_DEVICES[deviceName];
const smoke = values['smoke-localhost'];
const isCI = process.env['CI'] === 'true';
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const cache = path.join(PACKAGE_ROOT, '.cache');
const derived = path.join(cache, 'derived');
const runDir = path.join(cache, 'captures', runId, deviceName, locale);
const debugDir = path.join(cache, 'maestro-debug', runId);

const { cleanups, run } = createLifecycle();

async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(file).metadata();
  return { width: width ?? 0, height: height ?? 0 };
}

/** Proxy policy first, so a local run fails fast before the long build. */
function assertProxyPolicy(port: number): void {
  if (!smoke && !isCI && !values['local-proxy-already-set']) {
    console.error(manualProxyInstructions('Wi-Fi', '127.0.0.1', port));
    throw new Error('refusing to change network settings outside CI');
  }
}

function buildApp(): string {
  return values['reuse-build'] && existsSync(builtAppPath(derived))
    ? builtAppPath(derived)
    : build(derived);
}

/**
 * A localhost fixture served by a CHILD process, not an in-process server: every
 * step of this script is a synchronous exec (maestro, xcrun), which would freeze
 * our own event loop and leave Safari staring at a server that never answers.
 */
async function startSmokeServer(): Promise<string> {
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
  return `http://localhost:${smokePort}/`;
}

async function startProxy(port: number): Promise<MockProxy> {
  const proxy = await startMockProxy(
    await freePort().then((free) => (isCI ? port : free)),
    path.join(runDir, 'proxy.log'),
  );
  cleanups.push(async () => proxy.stop());
  if (isCI) cleanups.push(pointSystemProxyAt(proxy.port));
  else log(`▸ expecting the system proxy to already point at the mock proxy (${proxy.port})`);
  return proxy;
}

/** Throwaway simulator (deleted in cleanup, whatever happens next), ready with the app installed. */
function prepareSimulator(app: string, proxy: MockProxy | null): sim.ThrowawaySim {
  const device = sim.createThrowaway(profile.typeName, runId);
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
  return device;
}

function runSetupFlow(device: sim.ThrowawaySim, flow: string): void {
  if (!runFlow(device.udid, flow, { ...LABELS[locale], ...profile.env }, debugDir)) {
    throw new Error(`setup flow ${flow} failed`);
  }
}

/** How long Safari gets to run the extension's first-run setup before the host app changes a setting. */
const FIRST_RUN_SETTLE_MS = 20_000;

/**
 * Enable the extension, let it finish its first run in Safari, THEN change the
 * setting in the host app. On the extension's very first launch, its install
 * initialiser can race the adoption of a host-app change and write the defaults
 * over it (content hiding silently off); a host-app change made after the first
 * run is adopted cleanly. `warmupUrl` is a page this run serves anyway.
 */
function runSetupFlows(device: sim.ThrowawaySim, warmupUrl: string): void {
  runSetupFlow(device, '00-enable-extension');
  log('▸ warm-up: Safari first run for the extension');
  sim.openUrl(device, warmupUrl);
  sleepSync(FIRST_RUN_SETTLE_MS);
  sim.terminate(device, 'com.apple.mobilesafari');
  runSetupFlow(device, '01-host-app-hide-content');
  sim.terminate(device, BUNDLE_ID);
}

interface Captured {
  readonly record: ShotRecord;
  readonly file: string;
  readonly capturedAt: string;
}

/** A dead mock proxy makes every later page blank: name it, don't report a "wrong state". */
function assertProxyAlive(proxy: MockProxy | null, when: string): void {
  const exit = proxy?.exited() ?? null;
  if (exit !== null) throw new Error(`mock proxy died (${exit}) ${when}; see its stderr above`);
}

const APP_GROUP = 'group.fyi.movar.safari';

/** Diagnostic only: what the host app last wrote for the extension to adopt. */
function logHostSettings(device: sim.ThrowawaySim, when: string): void {
  log(
    `▸ host settings ${when}: ${hostSettingsSummary(sim.readAppGroupDefaults(device, BUNDLE_ID, APP_GROUP))}`,
  );
}

async function captureShot(
  device: sim.ThrowawaySim,
  shot: PlannedShot,
  proxy: MockProxy | null,
): Promise<Captured> {
  log(`▸ shot ${shot.id}`);
  assertProxyAlive(proxy, `before shot "${shot.id}"`);
  sim.terminate(device, 'com.apple.mobilesafari');
  sim.closeSafariTabs(device);
  sim.openUrl(device, shot.url);
  const reached = runFlow(device.udid, shot.flow, shot.env, debugDir);
  assertProxyAlive(proxy, `during shot "${shot.id}"`);
  if (!reached) {
    logHostSettings(device, `at the failed shot "${shot.id}"`);
    throw new Error(`shot "${shot.id}": expected state not reached (wrong state)`);
  }
  const file = path.join(runDir, `${shot.id}.png`);
  sim.screenshot(device, file);
  const version = sim.installedVersion(device, BUNDLE_ID);
  const record: ShotRecord = {
    id: shot.id,
    ...(await pngSize(file)),
    appVersion: version.version,
    appBuild: version.build,
  };
  return { record, file, capturedAt: new Date().toISOString() };
}

async function captureAll(
  device: sim.ThrowawaySim,
  plan: readonly PlannedShot[],
  proxy: MockProxy | null,
): Promise<Captured[]> {
  const captured: Captured[] = [];
  for (const shot of plan) captured.push(await captureShot(device, shot, proxy));
  return captured;
}

function writeManifest(
  captured: readonly Captured[],
  device: sim.ThrowawaySim,
  summary: ReturnType<MockProxy['summary']> | null,
  failures: readonly string[],
  times: { started: string; sha: string },
): void {
  const first = captured[0]?.record;
  const manifest = {
    runId,
    locale,
    smoke,
    version: extensionVersion(),
    appVersion: first?.appVersion,
    appBuild: first?.appBuild,
    sha: times.sha,
    device: deviceName,
    simulator: { device: profile.typeName, runtime: device.runtimeName, runtimeId: device.runtime },
    startedAt: times.started,
    finishedAt: new Date().toISOString(),
    proxy: summary,
    shots: captured.map(({ record, capturedAt }) => ({ ...record, capturedAt })),
    failures,
  };
  writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function copyOut(captured: readonly Captured[], outDir: string): void {
  const dest = path.resolve(outDir, deviceName, locale);
  mkdirSync(dest, { recursive: true });
  for (const { file } of captured) copyFileSync(file, path.join(dest, path.basename(file)));
  cpSync(path.join(runDir, 'manifest.json'), path.join(dest, 'manifest.json'));
  log(`✓ ${captured.length} shot(s) → ${dest}`);
}

/** Servers: the mock proxy (real run) or a localhost fixture (smoke), with the shots to take. */
async function startServers(
  port: number,
): Promise<{ proxy: MockProxy | null; before: PlannedShot[]; plan: PlannedShot[] }> {
  if (smoke) return { proxy: null, before: [], plan: smokePlan(await startSmokeServer()) };
  return { proxy: await startProxy(port), before: beforePlan(locale), plan: listingPlan(locale) };
}

/** Gate the run, write the manifest, and either keep the outputs or throw. */
function finish(
  captured: readonly Captured[],
  device: sim.ThrowawaySim,
  proxy: MockProxy | null,
  plan: readonly PlannedShot[],
  times: { started: string; sha: string },
): void {
  const summary = proxy?.summary() ?? null;
  const failures = evaluateGates({
    proxy: summary,
    shots: captured.map((c) => c.record),
    expectedIds: plan.map((shot) => shot.id),
    size: profile.size,
  });
  writeManifest(captured, device, summary, failures, times);
  if (failures.length > 0) {
    rmSync(runDir, { recursive: true, force: true });
    throw new Error(`gates failed, no outputs kept:\n  - ${failures.join('\n  - ')}`);
  }
  if (values.out) copyOut(captured, values.out);
}

async function main(): Promise<void> {
  const started = new Date().toISOString();
  mkdirSync(runDir, { recursive: true });
  mkdirSync(debugDir, { recursive: true });

  const port = Number.parseInt(values['proxy-port'], 10);
  assertProxyPolicy(port);
  const app = buildApp();
  const sha = gitSha();
  const { proxy, before, plan } = await startServers(port);

  const device = prepareSimulator(app, proxy);
  const warmup = plan[0]?.url;
  if (warmup === undefined) throw new Error('empty shot plan');
  // Before pass first: the extension is still off, so this is plain Safari.
  const captured = await captureAll(device, before, proxy);
  runSetupFlows(device, warmup);
  logHostSettings(device, 'after setup');
  captured.push(...(await captureAll(device, plan, proxy)));
  finish(captured, device, proxy, [...before, ...plan], { started, sha });
  log(`✓ run ${runId} passed; captures in ${runDir}`);
}

run(main);
