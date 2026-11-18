/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, unicorn/prefer-top-level-await, unicorn/no-array-reverse, sonarjs/no-misleading-array-reverse -- orchestration script: prints progress, unwinds cleanups in reverse */
/**
 * Desktop store screenshots from REAL browser windows: the real Movar build on
 * the mock sites, captured with the browser's own toolbar and Movar's icon in
 * it. One run = one browser × one locale, every shot before (Movar not
 * installed / switched off) and after (on, content hiding on):
 *
 *   tsx src/capture/desktop/run.ts --browser chrome|firefox|safari --locale uk|en --out <dir>
 *
 * Writes `<out>/<browser>/<locale>/{<id>.png, <id>-before.png, <id>.json, manifest.json}`;
 * `<id>.json` is `{ "chromeTop": <px of browser chrome above the page> }`, measured
 * per capture. Linux: Chrome for Testing / Firefox under a private Xvfb, started
 * here. macOS: Safari, CI only (it changes the machine; see safari.ts).
 *
 * Local mechanics check on a Mac (no window capture, no machine changes):
 *   tsx src/capture/desktop/run.ts --browser chrome --locale uk --out /tmp/x --viewport-only
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { extensionVersion, gitSha, PACKAGE_ROOT, REPO_ROOT } from '../build';
import { evaluateGates } from '../gates';
import type { ShotRecord } from '../gates';
import { freePort, startMockProxy } from '../mock-proxy';
import type { MockProxy } from '../mock-proxy';
import { createLifecycle } from '../lifecycle';
import { log } from '../sh';
import { pointSystemProxyAt } from '../system-proxy';
import type { Locale } from '../shots';
import { launchChrome } from './chrome';
import {
  afterBrowserVersion,
  expectedSize,
  extensionBuildProblem,
  extensionPath,
  gateFailureMessage,
  launchStep,
  relevantFailures,
  runScale,
  shotSummaries,
  sidecarsOf,
} from './decisions';
import { writeFailureEvidence } from './debug';
import { capturePhase, writeSidecar } from './dom-shots';
import type { DomDriver, PhaseResult, WindowCapturer } from './dom-shots';
import { defaultFirefoxBinary, launchFirefox } from './firefox';
import { WINDOW } from './geometry';
import { DESKTOP_LOCALES, parseLocale } from './locale';
import { DESKTOP_BROWSERS, DESKTOP_SHOTS } from './plan';
import type { DesktopBrowser, DesktopPhase } from './plan';
import { hasRequiredAllUrls } from './profiles';
import {
  buildAxHelper,
  installApp,
  SafariUi,
  setAppleLanguages,
  setDisplayMode,
  trustCa,
} from './safari';
import { ensureDisplay, x11Capturer } from './x11';

const { values } = parseArgs({
  options: {
    browser: { type: 'string' },
    locale: { type: 'string', default: 'uk' },
    out: { type: 'string' },
    extension: { type: 'string' },
    firefox: { type: 'string' },
    chrome: { type: 'string' },
    'safari-app': { type: 'string', default: '/Applications/Movar.app' },
    'viewport-only': { type: 'boolean', default: false },
    'proxy-port': { type: 'string', default: '8877' },
  },
});

const browser = values.browser as DesktopBrowser;
if (!DESKTOP_BROWSERS.includes(browser))
  throw new Error(`--browser must be one of ${DESKTOP_BROWSERS.join('|')}`);
const locale: Locale = parseLocale(values.locale);
const desktopLocale = DESKTOP_LOCALES[locale];
if (values.out === undefined) throw new Error('--out <dir> is required');
const outDir = path.resolve(values.out, browser, locale);
const isCI = process.env['CI'] === 'true';
const viewportOnly = values['viewport-only'];
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const runDir = path.join(PACKAGE_ROOT, '.cache/desktop-captures', runId, browser, locale);
const debugDir = path.join(PACKAGE_ROOT, '.cache/desktop-debug', runId);

const { cleanups, run } = createLifecycle();

/** The step in progress, named in a failure's evidence. */
let currentStep = 'start';
const stepTo = (step: string): void => {
  currentStep = step;
};
let safariUi: SafariUi | null = null;

/** Where the extension build is, checked to be the e2e variant (host access held at install). */
function extensionDir(): string {
  const dir = extensionPath(browser, values.extension, REPO_ROOT);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>)
    : null;
  const problem = extensionBuildProblem(dir, browser, manifest, hasRequiredAllUrls);
  if (problem !== null) throw new Error(problem);
  return dir;
}

interface Taken {
  readonly id: string;
  readonly file: string;
  readonly result: PhaseResult;
  readonly browserVersion: string;
}

async function startProxy(): Promise<MockProxy> {
  // Safari uses the system proxy, so its port is fixed; the Linux browsers take any free port.
  const port = browser === 'safari' ? Number.parseInt(values['proxy-port'], 10) : await freePort();
  const proxy = await startMockProxy(port, path.join(runDir, 'proxy.log'));
  cleanups.push(async () => proxy.stop());
  log(`▸ mock proxy on 127.0.0.1:${proxy.port}`);
  return proxy;
}

// ── Firefox / Chrome ────────────────────────────────────────────────────────

async function launchDom(proxy: MockProxy, extension: string | null): Promise<DomDriver> {
  const common = {
    locale: desktopLocale,
    proxyPort: proxy.port,
    caCertPath: proxy.caCertPath,
    extension,
  };
  return browser === 'firefox'
    ? launchFirefox({ ...common, binary: values.firefox ?? defaultFirefoxBinary() })
    : launchChrome({
        ...common,
        ...(values.chrome === undefined ? {} : { executable: values.chrome }),
      });
}

async function shootAll(
  driver: DomDriver,
  pick: (shot: (typeof DESKTOP_SHOTS)[number]) => DesktopPhase,
  suffix: string,
): Promise<Taken[]> {
  const capturer: WindowCapturer | null = viewportOnly ? null : x11Capturer();
  const taken: Taken[] = [];
  for (const shot of DESKTOP_SHOTS) {
    const id = `${shot.id}${suffix}`;
    log(`▸ shot ${id}`);
    stepTo(`shot ${id}`);
    const file = path.join(runDir, `${id}.png`);
    const phase = pick(shot);
    const result = await capturePhase({ driver, capturer, phase, file, what: `shot "${id}"` });
    taken.push({ id, file, result, browserVersion: driver.version });
  }
  return taken;
}

async function domPass(
  proxy: MockProxy,
  extension: string | null,
  pick: (shot: (typeof DESKTOP_SHOTS)[number]) => DesktopPhase,
  suffix: string,
): Promise<Taken[]> {
  stepTo(launchStep(browser, extension !== null));
  const driver = await launchDom(proxy, extension);
  try {
    return await shootAll(driver, pick, suffix);
  } catch (error) {
    // While the browser is still up: what was on screen when it failed.
    writeFailureEvidence(debugDir, currentStep, error);
    throw error;
  } finally {
    await driver.close();
  }
}

async function captureDom(proxy: MockProxy): Promise<Taken[]> {
  if (process.platform === 'linux' && !viewportOnly) cleanups.push(await ensureDisplay());
  else if (!viewportOnly) {
    throw new Error(
      'window capture of Chrome/Firefox runs on Linux (Xvfb); on this machine pass --viewport-only for a mechanics check',
    );
  }
  const extension = extensionDir();
  const before = await domPass(proxy, null, (s) => s.before, '-before');
  const after = await domPass(proxy, extension, (s) => s.after, '');
  return [...before, ...after];
}

// ── Safari ──────────────────────────────────────────────────────────────────

async function captureSafari(proxy: MockProxy): Promise<Taken[]> {
  if (process.platform !== 'darwin') throw new Error('Safari capture runs on macOS');
  if (!isCI) {
    throw new Error(
      'Safari capture changes the display, System keychain, system proxy and AppleLanguages: it runs only with CI=true on an ephemeral runner',
    );
  }
  setDisplayMode();
  // Each restore is registered as soon as its change is applied, in order.
  const register = (restore: () => void): void => {
    cleanups.push(restore);
  };
  register(trustCa(proxy.caCertPath));
  register(pointSystemProxyAt(proxy.port));
  register(setAppleLanguages(desktopLocale));
  const app = installApp(values['safari-app']);
  const ui = new SafariUi(buildAxHelper(), debugDir);
  safariUi = ui;
  cleanups.push(() => {
    ui.quitSafari();
  });
  const english = ['en'];
  const version = `safari (${app})`;

  const pass = (
    pick: (s: (typeof DESKTOP_SHOTS)[number]) => DesktopPhase,
    suffix: string,
  ): Taken[] => {
    // Each phase launches Safari fresh at its own URL (safari.ts openAt).
    return DESKTOP_SHOTS.map((shot) => {
      const id = `${shot.id}${suffix}`;
      log(`▸ shot ${id}`);
      stepTo(`shot ${id}`);
      const file = path.join(runDir, `${id}.png`);
      return {
        id,
        file,
        result: ui.capturePhase(pick(shot), locale, file, `shot "${id}"`),
        browserVersion: version,
      };
    });
  };

  // Before: Movar installed but switched off (idempotent: a second locale's run finds it on).
  stepTo('safari: Movar off');
  ui.launchSafari(english);
  ui.setExtensionEnabled(false);
  const before = pass((s) => s.before, '-before');

  stepTo('safari: Movar on');
  ui.launchSafari(english);
  ui.setExtensionEnabled(true);
  // Let the extension finish its first run in Safari BEFORE the host app changes a
  // setting: its install initialiser can otherwise write the defaults over it (AGENTS.md).
  ui.openAt(DESKTOP_SHOTS[0]?.after.url ?? 'about:blank');
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  ui.quitSafari();
  stepTo('host app: content hiding');
  ui.enableContentHiding(app);
  const after = pass((s) => s.after, '');
  return [...before, ...after];
}

// ── gates + output ──────────────────────────────────────────────────────────

function finish(taken: readonly Taken[], proxy: MockProxy, started: string): void {
  const scale = runScale(taken);
  const records: ShotRecord[] = taken.map((t) => ({
    id: t.id,
    width: t.result.width,
    height: t.result.height,
    appVersion: extensionVersion(),
    appBuild: t.browserVersion,
  }));
  const failures = relevantFailures(
    evaluateGates({
      proxy: proxy.summary(),
      shots: records,
      expectedIds: DESKTOP_SHOTS.flatMap((s) => [s.id, `${s.id}-before`]),
      // A viewport-only check has no window to hold to WINDOW.
      size: expectedSize(viewportOnly, records, scale),
    }),
  );
  // Every capture gets its own measured chrome height: `<id>.json` and `<id>-before.json`.
  const sidecars = sidecarsOf(taken, viewportOnly);
  const manifest = {
    runId,
    browser,
    locale,
    viewportOnly,
    version: extensionVersion(),
    browserVersion: afterBrowserVersion(taken),
    sha: gitSha(),
    window: WINDOW,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    proxy: proxy.summary(),
    shots: shotSummaries(taken),
    failures,
  };
  writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (failures.length > 0) {
    rmSync(runDir, { recursive: true, force: true });
    throw new Error(gateFailureMessage(failures));
  }
  mkdirSync(outDir, { recursive: true });
  for (const t of taken) copyFileSync(t.file, path.join(outDir, `${t.id}.png`));
  for (const s of sidecars) writeSidecar(path.join(outDir, `${s.id}.json`), s.chromeTop);
  copyFileSync(path.join(runDir, 'manifest.json'), path.join(outDir, 'manifest.json'));
  log(`✓ ${taken.length} capture(s) → ${outDir}`);
}

async function main(): Promise<void> {
  const started = new Date().toISOString();
  mkdirSync(runDir, { recursive: true });
  const proxy = await startProxy();
  const taken = browser === 'safari' ? await captureSafari(proxy) : await captureDom(proxy);
  finish(taken, proxy, started);
}

run(async () => {
  try {
    await main();
  } catch (error) {
    writeFailureEvidence(debugDir, currentStep, error);
    safariUi?.evidence('failure');
    throw error;
  }
});
