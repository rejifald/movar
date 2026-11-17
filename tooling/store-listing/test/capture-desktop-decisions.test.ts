import { describe, expect, it, vi } from 'vitest';
import {
  afterBrowserVersion,
  chromeArgs,
  clickActions,
  evaluateValue,
  expectedSize,
  extensionBuildProblem,
  extensionPath,
  extensionTarget,
  firefoxArgs,
  firefoxEnv,
  firefoxSeedProblem,
  firstFreeDisplay,
  gateFailureMessage,
  hasDisplay,
  isNavigationAbort,
  needsFit,
  windowFillProblem,
  failureReport,
  failureStem,
  launchStep,
  pickBrowserWindow,
  pollFor,
  relevantFailures,
  runScale,
  settleOf,
  shotSummaries,
  sidecarsOf,
  x11LockPath,
  x11SocketPath,
  xvfbArgs,
} from '../src/capture/desktop/decisions';
import type { TakenShot } from '../src/capture/desktop/decisions';
import { WINDOW } from '../src/capture/desktop/geometry';
import { DESKTOP_LOCALES } from '../src/capture/desktop/locale';

const win = (id: number, width: number, height: number) => ({ id, x: 0, y: 0, width, height });
const yes = (): boolean => true;
const shot = (id: string, width: number, chromeTop: number | null): TakenShot => ({
  id,
  browserVersion: `v-${id}`,
  result: { width, height: 900, chromeTop },
});

describe('pollFor', () => {
  it('returns the first hit without sleeping after it', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let n = 0;
    const found = await pollFor(() => (++n === 3 ? 'hit' : null), 5, 10, sleep);
    expect(found).toBe('hit');
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });
  it('gives null after every attempt missed, sleeping after each', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    expect(await pollFor(async () => null, 4, 1, sleep)).toBeNull();
    expect(sleep).toHaveBeenCalledTimes(4);
  });
});

describe('x11 decisions', () => {
  it('reads an empty DISPLAY as unset', () => {
    expect(hasDisplay({})).toBe(false);
    expect(hasDisplay({ DISPLAY: '' })).toBe(false);
    expect(hasDisplay({ DISPLAY: ':0' })).toBe(true);
  });
  it('skips taken display numbers from 99', () => {
    expect(firstFreeDisplay(() => false)).toBe(99);
    expect(firstFreeDisplay((n) => n < 102)).toBe(102);
    expect(x11SocketPath(99)).toBe('/tmp/.X11-unix/X99');
    expect(x11LockPath(99)).toBe('/tmp/.X99-lock');
  });
  it('starts Xvfb with no tcp listener at the screen size', () => {
    expect(xvfbArgs(100)).toEqual([
      ':100',
      '-screen',
      '0',
      '1440x900x24',
      '-nolisten',
      'tcp',
      '-dpi',
      '96',
    ]);
  });
  it('picks the largest window that is big enough, or none', () => {
    expect(pickBrowserWindow([])).toBeNull();
    expect(pickBrowserWindow([win(1, 400, 900), win(2, 1000, 300)])).toBeNull();
    expect(pickBrowserWindow([win(1, 500, 400), win(2, 1440, 900), win(3, 10, 10)])?.id).toBe(2);
  });
  it('names launches and failure files after the step', () => {
    expect(launchStep('chrome', true)).toBe('launch chrome with Movar');
    expect(launchStep('firefox', false)).toBe('launch firefox without Movar');
    expect(failureStem('shot site-menu-before')).toBe('failure-shot_site-menu-before');
    expect(failureStem('safari: Movar on')).toBe('failure-safari_Movar_on');
  });
  it('names the failed step and the error in the failure report', () => {
    expect(failureReport('shot search', new Error('boom'))).toMatch(
      /^step: shot search\n\nError: boom/,
    );
    expect(failureReport('start', 'plain')).toBe('step: start\n\nplain\n');
  });
  it('keeps a screen grab only when the browser fills the screen at (0,0)', () => {
    expect(windowFillProblem([1440, 900, 0, 0])).toBeNull();
    expect(windowFillProblem([1600, 1000, 0, 0])).toMatch(/1600x1000 at \(0,0\)/);
    expect(windowFillProblem([1440, 900, 0, 24])).not.toBeNull();
    expect(windowFillProblem([])).not.toBeNull();
  });
  it('fits a window only when it is off position or size', () => {
    const at = { x: 0, y: 0, ...WINDOW };
    expect(needsFit(at)).toBe(false);
    expect(needsFit({ ...at, x: 1 })).toBe(true);
    expect(needsFit({ ...at, y: 1 })).toBe(true);
    expect(needsFit({ ...at, width: 1000 })).toBe(true);
    expect(needsFit({ ...at, height: 800 })).toBe(true);
  });
});

describe('extension build', () => {
  it('names the build per browser and honours an override', () => {
    expect(extensionTarget('firefox')).toBe('firefox-mv3');
    expect(extensionTarget('chrome')).toBe('chrome-mv3');
    expect(extensionPath('firefox', undefined, '/repo')).toBe(
      '/repo/apps/extension/.output/firefox-mv3',
    );
    expect(extensionPath('chrome', '/x/y', '/repo')).toBe('/x/y');
  });
  it('explains a missing or non-e2e build, and passes a good one', () => {
    expect(extensionBuildProblem('/d', 'firefox', null, yes)).toContain('wxt build -b firefox');
    expect(extensionBuildProblem('/d', 'chrome', null, yes)).not.toContain('-b firefox');
    expect(extensionBuildProblem('/d', 'chrome', {}, () => false)).toContain('MOVAR_E2E=1 build');
    expect(extensionBuildProblem('/d', 'chrome', {}, yes)).toBeNull();
  });
});

describe('run output', () => {
  it('derives the scale from the first shot, defaulting to 1', () => {
    expect(runScale([])).toBe(1);
    expect(runScale([shot('a', WINDOW.width * 2, 100)])).toBe(2);
    expect(runScale([shot('a', 10, 100)])).toBe(1);
  });
  it('expects the first shot size for viewport-only, else the scaled window', () => {
    expect(expectedSize(true, [{ width: 5, height: 6 }], 2)).toEqual({ width: 5, height: 6 });
    expect(expectedSize(true, [], 2)).toEqual({ width: 0, height: 0 });
    expect(expectedSize(false, [], 2)).toEqual({
      width: WINDOW.width * 2,
      height: WINDOW.height * 2,
    });
  });
  it('writes sidecars only for measured, non-viewport captures', () => {
    const taken = [shot('a', 1, 90), shot('a-before', 1, null)];
    expect(sidecarsOf(taken, false)).toEqual([{ id: 'a', chromeTop: 90 }]);
    expect(sidecarsOf(taken, true)).toEqual([]);
  });
  it('summarises shots and the after version', () => {
    const taken = [shot('a-before', 1, 90), shot('a', 2, 91)];
    expect(afterBrowserVersion(taken)).toBe('v-a');
    expect(afterBrowserVersion([])).toBeUndefined();
    expect(shotSummaries(taken)[1]).toEqual({ id: 'a', width: 2, height: 900, chromeTop: 91 });
  });
  it('ignores the version-differs gate and formats the rest', () => {
    expect(relevantFailures(['app version/build differs: x', 'other'])).toEqual(['other']);
    expect(gateFailureMessage(['a', 'b'])).toBe('gates failed, no outputs kept:\n  - a\n  - b');
  });
});

describe('browser launch arguments', () => {
  it('builds the Chrome flags, loading the extension only when given', () => {
    const without = chromeArgs(DESKTOP_LOCALES.uk, 8877, null);
    expect(without).toContain(`--window-size=${WINDOW.width},${WINDOW.height}`);
    expect(without).toContain('--proxy-server=http://127.0.0.1:8877');
    expect(without.some((a) => a.startsWith('--load-extension'))).toBe(false);
    const withExt = chromeArgs(DESKTOP_LOCALES.uk, 8877, '/ext');
    expect(withExt.slice(-2)).toEqual([
      '--disable-extensions-except=/ext',
      '--load-extension=/ext',
    ]);
  });
  it('builds the Firefox command line and environment', () => {
    expect(firefoxArgs(1234, '/p')).toEqual([
      '--remote-debugging-port',
      '1234',
      '--profile',
      '/p',
      '--no-remote',
      '--new-instance',
      '--width',
      String(WINDOW.width),
      '--height',
      String(WINDOW.height),
      'about:blank',
    ]);
    const env = firefoxEnv({ KEEP: '1' });
    expect(env['KEEP']).toBe('1');
    expect(env['MOZ_REMOTE_ALLOW_SYSTEM_ACCESS']).toBe('1');
  });
});

describe('BiDi decisions', () => {
  it('settles a reply by its id, as a value or an error', () => {
    expect(settleOf({ type: 'event' })).toBeNull();
    expect(settleOf({ id: 1, type: 'success', result: 5 })).toEqual({ id: 1, ok: true, value: 5 });
    const failed = settleOf({ id: 2, type: 'error', error: 'boom', message: 'why' });
    expect(failed?.ok === false && failed.error.message).toBe('boom: why');
    const bare = settleOf({ id: 3, type: 'error' });
    expect(bare?.ok === false && bare.error.message).toBe('error: ');
  });
  it('unwraps an evaluate reply', () => {
    expect(evaluateValue({ type: 'success', result: { value: '7' } })).toBe(7);
    expect(evaluateValue({ type: 'success', result: { value: 7 } })).toBeUndefined();
    expect(evaluateValue({ type: 'success' })).toBeUndefined();
    expect(() => evaluateValue({ type: 'exception', exceptionDetails: { text: 'bad' } })).toThrow(
      'page script threw: bad',
    );
    expect(() => evaluateValue({ type: 'exception' })).toThrow('?');
  });
  it('tells a mid-load abort from a real failure', () => {
    expect(isNavigationAbort(new Error('NS_BINDING_ABORTED'))).toBe(true);
    expect(isNavigationAbort(new Error('Request cancelled'))).toBe(true);
    expect(isNavigationAbort(new Error('timeout'))).toBe(false);
    expect(isNavigationAbort('abort')).toBe(false);
  });
  it('builds one mouse click', () => {
    expect(JSON.stringify(clickActions(3, 4))).toContain('"pointerMove","x":3,"y":4');
  });
  it('judges the options-page seeding', () => {
    expect(firefoxSeedProblem({ hosts: true, saved: true })).toBeNull();
    expect(firefoxSeedProblem({ hosts: false, saved: true })).toContain('host permission');
    expect(firefoxSeedProblem({ hosts: true, saved: false })).toContain('did not persist');
  });
});
