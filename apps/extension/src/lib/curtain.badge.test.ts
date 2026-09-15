/**
 * Badge mode — the floating mark beside a control Movar cannot reach inside.
 *
 * jsdom has no layout, so every rect is 0x0 and `positionBadge` would always
 * take its "no box" branch. These tests stub `getBoundingClientRect` to drive
 * the live path, which is also the only way to exercise the eviction that keeps
 * an SPA from leaking a pinned host and a detached control per navigation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCurtain } from './curtain';
import { setBody, getHost } from './dom-test-helpers';

/** Give `el` a fixed viewport rect, the way a laid-out browser would. */
function stubRect(el: Element, rect: Partial<DOMRect>): void {
  const full = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect };
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...full, toJSON: () => full });
}

function attachBadge(target: HTMLElement): { detach(): void } {
  return attachCurtain(target, {
    mode: 'badge',
    skin: 'chip',
    icon: '⚑',
    title: 'Movar: hidden',
    actions: [],
  });
}

/** Run whatever `requestAnimationFrame` callbacks the module has queued. */
function flushFrames(): void {
  vi.advanceTimersByTime(32);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('curtain badge — placement', () => {
  it('pins beside the control in VIEWPORT coordinates', () => {
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, { top: 100, right: 300, width: 120, height: 20 });

    attachBadge(target);
    const host = getHost()!;

    // Page coordinates on a position:absolute host resolved against a
    // positioned body; fixed + viewport coordinates is what keeps the badge
    // beside its control on a centred-column shell.
    // Just past the trailing edge (right 300 + the 6px gap)...
    expect(host.style.left).toBe('306px');
    // ...and vertically centred on it. jsdom gives the host no height, so the
    // centre of a 20px-tall control at top 100 is 110.
    expect(host.style.top).toBe('110px');
    expect(host.style.visibility).toBe('');
  });

  it('clamps to the viewport instead of pushing past the edge', () => {
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    // A right-aligned language control — the usual placement.
    stubRect(target, { top: 0, right: window.innerWidth, width: 100, height: 20 });

    attachBadge(target);

    expect(Number.parseInt(getHost()!.style.left, 10)).toBeLessThan(window.innerWidth);
  });

  it('hides rather than parking at 0,0 when the control has no box', () => {
    // A control inside a collapsed hamburger or an inactive tab panel.
    setBody('<header><select id="c"></select></header>');
    attachBadge(document.querySelector<HTMLElement>('#c')!);

    expect(getHost()!.style.visibility).toBe('hidden');
  });

  it('is appended to the body, never into the site tree', () => {
    setBody('<header id="bar"><select id="c"></select><button id="after">x</button></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    attachBadge(target);

    expect(getHost()!.parentElement).toBe(document.body);
    expect(target.nextElementSibling).toBe(document.querySelector('#after'));
  });
});

describe('curtain badge — it never outlives its control', () => {
  it('evicts and removes an orphan when the site drops the control', () => {
    // The badge lives on document.body, outside the site's subtree, so a site
    // that re-renders its control cannot take the badge with it. Nothing else
    // would ever detach it: the Map would pin both dead nodes and keep forcing
    // layout on them on every scroll, for the life of the page.
    vi.useFakeTimers();
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, { top: 10, right: 50, width: 40, height: 20 });
    attachBadge(target);
    const host = getHost()!;
    expect(host.isConnected).toBe(true);

    target.remove();
    globalThis.dispatchEvent(new Event('scroll'));
    flushFrames();

    expect(host.isConnected).toBe(false);
  });

  it('stops listening once the last badge is gone', () => {
    vi.useFakeTimers();
    const remove = vi.spyOn(globalThis, 'removeEventListener');
    setBody('<header><select id="c"></select></header>');
    const badge = attachBadge(document.querySelector<HTMLElement>('#c')!);

    badge.detach();

    // "Turn Movar off" has to be able to remove every global the module
    // installed; the first cut latched its install flag and never uninstalled.
    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['scroll', 'resize']),
    );
  });

  it('coalesces a burst of scroll events into one reposition', () => {
    vi.useFakeTimers();
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    const rect = vi.spyOn(target, 'getBoundingClientRect');
    attachBadge(target);
    const afterMount = rect.mock.calls.length;

    for (let i = 0; i < 10; i++) globalThis.dispatchEvent(new Event('scroll'));
    flushFrames();

    // One frame's work, not ten events' worth of forced layout.
    expect(rect.mock.calls.length - afterMount).toBeLessThanOrEqual(2);
  });
});

describe('curtain badge — a control whose box arrives late', () => {
  /** jsdom ships no ResizeObserver, so the badge's observer is never built
   *  unless one is installed. This is the fake that makes the path reachable —
   *  and it records what got observed, which is the behaviour under test. */
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly observed: Element[] = [];
    disconnected = false;
    constructor(readonly cb: () => void) {
      FakeResizeObserver.instances.push(this);
    }
    observe(el: Element): void {
      this.observed.push(el);
    }
    unobserve(el: Element): void {
      this.observed.splice(this.observed.indexOf(el), 1);
    }
    disconnect(): void {
      this.disconnected = true;
    }
  }

  function installFakeObserver(): typeof FakeResizeObserver {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    return FakeResizeObserver;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('watches the control for a box that appears later', () => {
    // Scroll and resize both miss a menu opening, which is the case that left a
    // filtered picker permanently unmarked.
    const Fake = installFakeObserver();
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;

    attachBadge(target);

    expect(Fake.instances).toHaveLength(1);
    expect(Fake.instances[0]!.observed).toEqual([target]);
  });

  it('stops watching, and disconnects, once the badge is gone', () => {
    const Fake = installFakeObserver();
    setBody('<header><select id="c"></select></header>');
    const badge = attachBadge(document.querySelector<HTMLElement>('#c')!);

    badge.detach();

    expect(Fake.instances[0]!.observed).toEqual([]);
    expect(Fake.instances[0]!.disconnected).toBe(true);
  });

  it('cancels a pending frame on teardown', () => {
    // Otherwise a reposition scheduled just before "turn Movar off" runs after
    // it, against a Map the teardown has already emptied.
    vi.useFakeTimers();
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    setBody('<header><select id="c"></select></header>');
    const badge = attachBadge(document.querySelector<HTMLElement>('#c')!);

    globalThis.dispatchEvent(new Event('scroll'));
    badge.detach();

    expect(cancel).toHaveBeenCalled();
  });
});
