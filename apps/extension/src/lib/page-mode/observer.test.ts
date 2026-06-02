import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPageMode } from './observer';
import type { PageMode } from './types';

/**
 * Build a controllable `(prefers-color-scheme: dark)` match list. The
 * returned object lets the test flip `matches` and fire the registered
 * change listener at will.
 */
interface ControllableMql {
  list: MediaQueryList;
  fireChange(next: boolean): void;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeControllableMql(initial: boolean): ControllableMql {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn((type: string, l: (e: MediaQueryListEvent) => void) => {
    if (type === 'change') listeners.add(l);
  });
  const removeEventListener = vi.fn((type: string, l: (e: MediaQueryListEvent) => void) => {
    if (type === 'change') listeners.delete(l);
  });
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  return {
    list: mql,
    fireChange(next: boolean): void {
      (mql as unknown as { matches: boolean }).matches = next;
      const event = { matches: next, media: mql.media } as MediaQueryListEvent;
      for (const l of listeners) l(event);
    },
    addEventListener,
    removeEventListener,
  };
}

function fakeWinWithMql(mql: MediaQueryList): Window {
  return {
    matchMedia: () => mql,
    getComputedStyle: (el: Element) => globalThis.getComputedStyle(el),
  } as unknown as Window;
}

/** Flush the MutationObserver microtask queue. */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('dark');
  document.documentElement.removeAttribute('style');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('watchPageMode', () => {
  it('does NOT fire the callback synchronously on attach', async () => {
    const onChange = vi.fn();
    const mode: PageMode = 'light';
    const stop = watchPageMode(
      () => mode,
      onChange,
      document,
      fakeWinWithMql(makeControllableMql(false).list),
    );
    // Even after a microtask flush, no spurious emit happens before a real
    // change — the initial value is the baseline, not a transition.
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('fires onChange when an <html> attribute change flips the detected mode', async () => {
    const onChange = vi.fn();
    let mode: PageMode = 'light';
    const detect = (): PageMode => mode;
    const stop = watchPageMode(
      detect,
      onChange,
      document,
      fakeWinWithMql(makeControllableMql(false).list),
    );

    // Simulate the site's switch wiring up its dark theme. Update both the
    // attribute (what the observer watches) and our test's "current mode"
    // (what the detector closure returns).
    mode = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');

    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
    stop();
  });

  it('does NOT fire when an unrelated attribute changes that does not flip mode', async () => {
    const onChange = vi.fn();
    const stop = watchPageMode(
      () => 'light',
      onChange,
      document,
      fakeWinWithMql(makeControllableMql(false).list),
    );

    // The class attr is watched, but the detector still says "light".
    document.documentElement.className = 'unrelated-class';
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('does NOT emit when the same attribute value is written back', async () => {
    const onChange = vi.fn();
    let mode: PageMode = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    const stop = watchPageMode(
      () => mode,
      onChange,
      document,
      fakeWinWithMql(makeControllableMql(false).list),
    );

    // Re-write the same value. MutationObserver fires (one record), but our
    // detector returns the same mode and the callback should NOT fire.
    document.documentElement.setAttribute('data-theme', 'dark');
    await flush();
    expect(onChange).not.toHaveBeenCalled();

    // Now actually flip; the callback should fire exactly once.
    mode = 'light';
    document.documentElement.setAttribute('data-theme', 'light');
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('light');
    stop();
  });

  it('coalesces rapid attribute writes that net to the same final mode', async () => {
    const onChange = vi.fn();
    let mode: PageMode = 'light';
    const stop = watchPageMode(
      () => mode,
      onChange,
      document,
      fakeWinWithMql(makeControllableMql(false).list),
    );

    // Three writes in one synchronous burst — MutationObserver delivers one
    // tick with all three records, our detector runs once, sees "dark", and
    // emits exactly once.
    mode = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.className = 'page-loaded';
    document.documentElement.setAttribute('data-bs-theme', 'dark');

    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
    stop();
  });

  it('also watches <body> attribute changes', async () => {
    const onChange = vi.fn();
    let mode: PageMode = 'light';
    const stop = watchPageMode(
      () => mode,
      onChange,
      document,
      fakeWinWithMql(makeControllableMql(false).list),
    );

    mode = 'dark';
    document.body.setAttribute('data-theme', 'dark');
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
    stop();
  });

  it('emits when the OS prefers-color-scheme media query flips', async () => {
    const ctl = makeControllableMql(false);
    const onChange = vi.fn();
    let prefersDark = false;
    const stop = watchPageMode(
      () => (prefersDark ? 'dark' : 'light'),
      onChange,
      document,
      fakeWinWithMql(ctl.list),
    );

    prefersDark = true;
    ctl.fireChange(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
    stop();
  });

  it('the stop function disconnects both the observer and the media listener', async () => {
    const ctl = makeControllableMql(false);
    const onChange = vi.fn();
    let mode: PageMode = 'light';
    const stop = watchPageMode(() => mode, onChange, document, fakeWinWithMql(ctl.list));

    stop();

    // Attribute mutations after stop must not fire the callback.
    mode = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    await flush();
    expect(onChange).not.toHaveBeenCalled();

    // Neither should a media query change.
    ctl.fireChange(true);
    expect(onChange).not.toHaveBeenCalled();

    // The mql removeEventListener was called as part of stop().
    expect(ctl.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('the stop function is idempotent', () => {
    const ctl = makeControllableMql(false);
    const stop = watchPageMode(
      () => 'light',
      () => {},
      document,
      fakeWinWithMql(ctl.list),
    );
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
  });

  it('survives a missing matchMedia (no OS listener, attribute watching still works)', async () => {
    const winNoMql = {
      matchMedia: undefined,
      getComputedStyle: (el: Element) => globalThis.getComputedStyle(el),
    } as unknown as Window;

    const onChange = vi.fn();
    let mode: PageMode = 'light';
    const stop = watchPageMode(() => mode, onChange, document, winNoMql);

    mode = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
