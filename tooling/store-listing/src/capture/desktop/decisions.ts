/**
 * The decisions inside the desktop capture's I/O shells, as pure functions:
 * which arguments a browser is launched with, which paths and sizes are
 * expected, how a reply or a measurement is judged. The shells (run.ts,
 * chrome.ts, firefox.ts, x11.ts) only sequence calls and feed these.
 */
import path from 'node:path';
import type { DesktopLocale } from './locale';
import type { DesktopBrowser } from './plan';
import { largestWindow, LINUX_SCALE, nearestScale, WINDOW, XVFB_SCREEN } from './geometry';
import type { Rect } from './geometry';

// ── polling ─────────────────────────────────────────────────────────────────

/** Call `probe` up to `attempts` times, sleeping `intervalMs` after each miss; null when it never hit. */
export async function pollFor<T>(
  probe: () => T | null | Promise<T | null>,
  attempts: number,
  intervalMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<T | null> {
  for (let i = 0; i < attempts; i += 1) {
    const found = await probe();
    if (found !== null) return found;
    await sleep(intervalMs);
  }
  return null;
}

// ── X display ───────────────────────────────────────────────────────────────

/** Whether the environment already names a display (so none is started). */
export function hasDisplay(env: NodeJS.ProcessEnv): boolean {
  const display = env['DISPLAY'];
  return display !== undefined && display !== '';
}

/** First display number from 99 up for which `isTaken` is false. */
export function firstFreeDisplay(isTaken: (display: number) => boolean, start = 99): number {
  let display = start;
  while (isTaken(display)) display += 1;
  return display;
}

export const x11SocketPath = (display: number): string => `/tmp/.X11-unix/X${display}`;
export const x11LockPath = (display: number): string => `/tmp/.X${display}-lock`;

export function xvfbArgs(display: number): string[] {
  const { width, height, depth } = XVFB_SCREEN;
  return [
    `:${display}`,
    '-screen',
    '0',
    `${width}x${height}x${depth}`,
    '-nolisten',
    'tcp',
    '-dpi',
    '96',
  ];
}

const MIN_BROWSER_WINDOW = { width: 400, height: 300 } as const;

/** The browser's main window among the visible ones: the largest that is big enough to be it. */
export function pickBrowserWindow<T extends Rect>(windows: readonly T[]): T | null {
  const big = windows.filter(
    (w) => w.width > MIN_BROWSER_WINDOW.width && w.height > MIN_BROWSER_WINDOW.height,
  );
  return big.length > 0 ? largestWindow(big) : null;
}

/** The browser window as its page sees it: `[outerWidth, outerHeight, screenX, screenY]`. */
export const OUTER_GEOMETRY_JS =
  '[window.outerWidth, window.outerHeight, window.screenX, window.screenY]';

/**
 * Why a root-window grab would not be the browser window alone: the browser
 * must sit at (0,0) and fill the WINDOW-sized screen exactly. Null when it does.
 */
export function windowFillProblem(outer: readonly number[]): string | null {
  const [width, height, x, y] = outer;
  return width === WINDOW.width && height === WINDOW.height && x === 0 && y === 0
    ? null
    : `browser window is ${String(width)}x${String(height)} at (${String(x)},${String(y)}), not ${WINDOW.width}x${WINDOW.height} at (0,0): the screen grab would not be the window`;
}

/** The step name of a browser launch, as a failure report names it. */
export function launchStep(browser: DesktopBrowser, withMovar: boolean): string {
  return `launch ${browser} ${withMovar ? 'with' : 'without'} Movar`;
}

/** File stem of a failure's evidence: `failure-<step>`, safe as a file name. */
export function failureStem(step: string): string {
  return `failure-${step.replaceAll(/[^\w.-]+/g, '_')}`;
}

/** The text of a failed run's `failure-<step>.txt`. */
export function failureReport(step: string, error: unknown): string {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return `step: ${step}\n\n${detail}\n`;
}

/** Whether the X window (device px) is not already at (0,0) filling the screen. */
export function needsFit(window: Rect): boolean {
  return (
    window.width !== XVFB_SCREEN.width ||
    window.height !== XVFB_SCREEN.height ||
    window.x !== 0 ||
    window.y !== 0
  );
}

// ── extension build ─────────────────────────────────────────────────────────

export function extensionTarget(browser: DesktopBrowser): string {
  return browser === 'firefox' ? 'firefox-mv3' : 'chrome-mv3';
}

/** The extension directory: the override if given, else the browser's `.output` build. */
export function extensionPath(
  browser: DesktopBrowser,
  override: string | undefined,
  repoRoot: string,
): string {
  return path.resolve(
    override ?? path.join(repoRoot, 'apps/extension/.output', extensionTarget(browser)),
  );
}

/** Why `dir` is not a usable e2e build, or null when it is. `manifest` is null when there is none. */
export function extensionBuildProblem(
  dir: string,
  browser: DesktopBrowser,
  manifest: Record<string, unknown> | null,
  hasAllUrls: (manifest: Record<string, unknown>) => boolean,
): string | null {
  if (manifest === null) {
    return `no extension build at ${dir}; build it: cd apps/extension && MOVAR_E2E=1 pnpm exec wxt build${browser === 'firefox' ? ' -b firefox' : ''}`;
  }
  if (!hasAllUrls(manifest)) {
    return `${dir} is not the MOVAR_E2E=1 build (<all_urls> must be a required host permission, or no page is touched)`;
  }
  return null;
}

// ── run output ──────────────────────────────────────────────────────────────

export interface TakenShot {
  readonly id: string;
  readonly browserVersion: string;
  readonly result: {
    readonly width: number;
    readonly height: number;
    readonly chromeTop: number | null;
  };
}

/** Capture px per window px from the first shot (1 when there is none). */
export function runScale(taken: readonly TakenShot[]): number {
  const first = taken[0];
  return first === undefined ? 1 : (nearestScale(first.result.width / WINDOW.width) ?? 1);
}

/** The size every capture must have: the first one's own for a viewport-only run, else the scaled window. */
export function expectedSize(
  viewportOnly: boolean,
  records: readonly { width: number; height: number }[],
  scale: number,
): { width: number; height: number } {
  return viewportOnly
    ? { width: records[0]?.width ?? 0, height: records[0]?.height ?? 0 }
    : { width: WINDOW.width * scale, height: WINDOW.height * scale };
}

/** `<id>.json` sidecars to write: none for viewport-only, none for a capture without a measured chrome. */
export function sidecarsOf(
  taken: readonly TakenShot[],
  viewportOnly: boolean,
): { id: string; chromeTop: number }[] {
  if (viewportOnly) return [];
  return taken.flatMap((t) =>
    t.result.chromeTop === null ? [] : [{ id: t.id, chromeTop: t.result.chromeTop }],
  );
}

/** Gate messages that count: before/after are two launches of one browser, so their versions may differ. */
export function relevantFailures(failures: readonly string[]): string[] {
  return failures.filter((f) => !f.startsWith('app version/build differs'));
}

/** The browser version of the "after" captures. */
export function afterBrowserVersion(taken: readonly TakenShot[]): string | undefined {
  return taken.find((t) => !t.id.endsWith('-before'))?.browserVersion;
}

export function shotSummaries(taken: readonly TakenShot[]): {
  id: string;
  width: number;
  height: number;
  chromeTop: number | null;
}[] {
  return taken.map((t) => ({
    id: t.id,
    width: t.result.width,
    height: t.result.height,
    chromeTop: t.result.chromeTop,
  }));
}

export function gateFailureMessage(failures: readonly string[]): string {
  return `gates failed, no outputs kept:\n  - ${failures.join('\n  - ')}`;
}

// ── Chrome ──────────────────────────────────────────────────────────────────

export function chromeArgs(
  locale: DesktopLocale,
  proxyPort: number,
  extension: string | null,
): string[] {
  return [
    `--window-size=${WINDOW.width},${WINDOW.height}`,
    '--window-position=0,0',
    `--lang=${locale.chromeLang}`,
    `--accept-lang=${locale.acceptLanguages}`,
    `--proxy-server=http://127.0.0.1:${proxyPort}`,
    '--test-type',
    '--disable-features=Translate,TranslateUI,MediaRouter,OptimizationHints,PrivacySandboxSettings4',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    `--force-device-scale-factor=${LINUX_SCALE}`,
    ...(extension === null
      ? []
      : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]),
  ];
}

// ── Firefox ─────────────────────────────────────────────────────────────────

export function firefoxArgs(port: number, profile: string): string[] {
  return [
    '--remote-debugging-port',
    String(port),
    '--profile',
    profile,
    '--no-remote',
    '--new-instance',
    '--width',
    String(WINDOW.width),
    '--height',
    String(WINDOW.height),
    'about:blank',
  ];
}

export const firefoxEnv = (base: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...base,
  MOZ_CRASHREPORTER_DISABLE: '1',
  MOZ_ENABLE_WAYLAND: '0',
  // BiDi may not navigate to moz-extension://; the options tab is opened from
  // the browser (chrome) realm instead, which needs system access.
  MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
});

/** Movar redirecting mid-load aborts the original navigation: that one is not an error. */
export function isNavigationAbort(error: unknown): boolean {
  return /abort|cancel/i.test(error instanceof Error ? error.message : '');
}

/** The BiDi actions for one left click at (x, y). */
export function clickActions(x: number, y: number): unknown[] {
  return [
    {
      type: 'pointer',
      id: 'mouse',
      parameters: { pointerType: 'mouse' },
      actions: [
        { type: 'pointerMove', x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ];
}

export interface BidiReply {
  id?: number;
  type?: 'success' | 'error' | 'event';
  result?: unknown;
  error?: string;
  message?: string;
}

/** What a BiDi message settles: nothing (no id), a value, or an error. */
export function settleOf(
  message: BidiReply,
): { id: number; ok: true; value: unknown } | { id: number; ok: false; error: Error } | null {
  if (message.id === undefined) return null;
  if (message.type === 'error') {
    return {
      id: message.id,
      ok: false,
      error: new Error(`${message.error ?? 'error'}: ${message.message ?? ''}`),
    };
  }
  return { id: message.id, ok: true, value: message.result };
}

/** The value of a `script.evaluate` reply (a JSON string, parsed), or a throw for an exception. */
export function evaluateValue(reply: {
  type: 'success' | 'exception';
  result?: { value?: unknown };
  exceptionDetails?: { text?: string };
}): unknown {
  if (reply.type === 'exception') {
    throw new Error(`page script threw: ${reply.exceptionDetails?.text ?? '?'}`);
  }
  const raw = reply.result?.value;
  return typeof raw === 'string' ? JSON.parse(raw) : undefined;
}

/** Why the options-page seeding failed, or null when settings and host access both held. */
export function firefoxSeedProblem(seeded: { hosts: boolean; saved: boolean }): string | null {
  if (!seeded.hosts) return 'firefox: Movar was installed without its <all_urls> host permission';
  if (!seeded.saved) return 'firefox: Movar settings did not persist';
  return null;
}
