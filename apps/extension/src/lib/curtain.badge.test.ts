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

function attachBadge(target: HTMLElement, onDetach?: () => void): { detach(): void } {
  return attachCurtain(target, {
    mode: 'badge',
    skin: 'chip',
    icon: '⚑',
    title: 'Movar: hidden',
    actions: [],
    ...(onDetach ? { onDetach } : {}),
  });
}

/** Run whatever `requestAnimationFrame` callbacks the module has queued. */
function flushFrames(): void {
  vi.advanceTimersByTime(32);
}

/** A right-aligned control in a narrow window, which is where every placement
 *  defect lives: the control ends 8px from the viewport edge, so the badge's
 *  resting mark (24px) and its hovered form (~98px) both have to go somewhere
 *  other than "after the control". The numbers are the ones Chromium produces
 *  on the picker-badge-edge-ru e2e fixture. */
const NARROW_VIEWPORT = 600;
const EDGE_CONTROL = { top: 0, left: 503, right: 592, width: 89, height: 20 };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    // ...anchored from that edge alone, so the label grows into the free space
    // the side was chosen for...
    expect(host.style.right).toBe('');
    // ...and vertically centred on it. jsdom gives the host no height, so the
    // centre of a 20px-tall control at top 100 is 110.
    expect(host.style.top).toBe('110px');
    expect(host.style.visibility).toBe('');
  });

  it('flips to the leading side rather than sitting on the control', () => {
    // A right-aligned language control — the usual placement. Clamping the
    // badge into the viewport put it at left=572 over a control ending at 592,
    // covering its last 20px: the <select>'s own dropdown arrow.
    vi.stubGlobal('innerWidth', NARROW_VIEWPORT);
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, EDGE_CONTROL);

    attachBadge(target);
    const host = getHost()!;

    // Anchored by its RIGHT edge, 6px before the control's left edge, so it
    // grows leftwards into the 503px of room on that side and never crosses
    // the control however wide its label gets.
    expect(host.style.right).toBe(`${String(NARROW_VIEWPORT - EDGE_CONTROL.left + 6)}px`);
    expect(host.style.left).toBe('');
  });

  it('places from the control alone, not from its own current width', () => {
    // The badge is two sizes: a 24px mark at rest, ~98px while the control is
    // hovered. A reposition landing in the middle of that (a resize, a scroll)
    // used to capture the wide measurement, and the collapse repositions
    // nothing — leaving a 24px badge at left=498, floating over a control
    // spanning 503-592.
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', NARROW_VIEWPORT);
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, EDGE_CONTROL);
    attachBadge(target);
    const host = getHost()!;
    const atRest = { left: host.style.left, right: host.style.right };

    // Same control, same viewport — only the badge is expanded now.
    stubRect(host, { top: 0, left: 399, right: 497, width: 98, height: 20 });
    globalThis.dispatchEvent(new Event('scroll'));
    flushFrames();

    expect({ left: host.style.left, right: host.style.right }).toEqual(atRest);
  });

  it('hugs the roomier viewport edge when neither side fits', () => {
    // A control nearly as wide as the viewport — a full-bleed <select> on a
    // narrow window. There is no "beside" left, so the badge takes the side
    // with more room and pins to the viewport edge, growing inwards. Covering
    // part of the control is the least-bad answer only once both sides are out.
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', NARROW_VIEWPORT);
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, { top: 0, left: 125, right: 485, width: 360, height: 20 });
    attachBadge(target);
    const host = getHost()!;

    // 115px before the control against 105px after it: the leading side wins.
    expect({ left: host.style.left, right: host.style.right }).toEqual({ left: '4px', right: '' });

    stubRect(target, { top: 0, left: 115, right: 475, width: 360, height: 20 });
    globalThis.dispatchEvent(new Event('scroll'));
    flushFrames();

    // Mirrored, the winner swaps — and the anchor swaps with it instead of
    // leaving both edges set, which would stretch the badge across the gap.
    expect({ left: host.style.left, right: host.style.right }).toEqual({ left: '', right: '4px' });
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

  it('evicts through the curtain’s own detach, so onDetach runs', () => {
    // The badge is half a surface: its `onDetach` is what releases the control
    // listeners and the PAIRED tooltip host, a second element on document.body
    // that nothing else owns. Evicting by removing the node tore down only the
    // half the eviction could see — measured over five re-renders of one
    // control, badge hosts stayed at 1 and tooltip hosts went 1 → 6.
    vi.useFakeTimers();
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, { top: 10, right: 50, width: 40, height: 20 });
    const onDetach = vi.fn();
    attachBadge(target, onDetach);

    target.remove();
    globalThis.dispatchEvent(new Event('scroll'));
    flushFrames();

    expect(onDetach).toHaveBeenCalledTimes(1);
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
   *  and it records what got observed, which is the behaviour under test.
   *
   *  `observe` de-duplicates and `disconnect` drops everything, both to match
   *  the real observer: the badge re-observes the document element on every
   *  mount, so a fake that appended blindly would report page-per-badge
   *  observations the browser never makes. */
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly observed: Element[] = [];
    disconnected = false;
    constructor(readonly cb: () => void) {
      FakeResizeObserver.instances.push(this);
    }
    observe(el: Element): void {
      if (!this.observed.includes(el)) this.observed.push(el);
    }
    unobserve(el: Element): void {
      this.observed.splice(this.observed.indexOf(el), 1);
    }
    disconnect(): void {
      this.disconnected = true;
      this.observed.length = 0;
    }
  }

  function installFakeObserver(): typeof FakeResizeObserver {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    return FakeResizeObserver;
  }

  it('watches the control for a box that appears later, and the page for a move', () => {
    // Scroll and resize both miss a menu opening, which is the case that left a
    // filtered picker permanently unmarked. They miss a control that only
    // MOVES too, and so does watching the control — hence the second target.
    const Fake = installFakeObserver();
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;

    attachBadge(target);

    expect(Fake.instances).toHaveLength(1);
    expect(Fake.instances[0]!.observed).toEqual([document.documentElement, target]);
  });

  it('repins a control that a growing page pushed down', () => {
    // The measured case: a banner slot filling in above the control moved it
    // 120px down, its own box unchanged. No scroll, no resize, nothing for an
    // observer of the control to see — the badge sat 120px high of its control
    // until the visitor's next scroll. What did change is the page's height.
    vi.useFakeTimers();
    const Fake = installFakeObserver();
    setBody('<header><select id="c"></select></header>');
    const target = document.querySelector<HTMLElement>('#c')!;
    stubRect(target, { top: 40, right: 300, width: 100, height: 20 });
    attachBadge(target);
    const host = getHost()!;
    expect(host.style.top).toBe('50px');

    stubRect(target, { top: 160, right: 300, width: 100, height: 20 });
    Fake.instances[0]!.cb();
    flushFrames();

    expect(host.style.top).toBe('170px');
  });

  it('stops watching, and disconnects, once the LAST badge is gone', () => {
    const Fake = installFakeObserver();
    setBody('<header><select id="a"></select><select id="b"></select></header>');
    const a = document.querySelector<HTMLElement>('#a')!;
    const b = document.querySelector<HTMLElement>('#b')!;
    const first = attachBadge(a);
    const second = attachBadge(b);

    first.detach();

    // One badge down, one still pinned: its control keeps its observation, and
    // the page observation the survivor also depends on stays up with it.
    expect(Fake.instances[0]!.observed).toEqual([document.documentElement, b]);
    expect(Fake.instances[0]!.disconnected).toBe(false);

    second.detach();

    expect(Fake.instances[0]!.disconnected).toBe(true);
    expect(Fake.instances[0]!.observed).toEqual([]);
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
