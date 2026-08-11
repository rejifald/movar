import { describe, expect, it } from 'vitest';
import { containerBand } from '@movar/theme';
import { attachCurtain } from './curtain';
import { setBody, getHost } from './dom-test-helpers';

// Global setup in test-setup.ts clears body/head/lang before each test and
// invokes detachAllCurtains in afterEach when a [data-movar-curtain] host
// remains — see apps/extension/src/lib/test-setup.ts.

// MutationObserver callbacks are delivered on a microtask; a macrotask turn
// (setTimeout 0) lets them flush before we assert.
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('attachCurtain — cover mode', () => {
  it('appends host as a child of target and sets position:relative when static', () => {
    setBody('<div id="t" style="width: 100px; height: 100px"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const host = getHost();
    expect(host).not.toBeNull();
    expect(host!.parentElement).toBe(target);
    expect(target.style.position).toBe('relative');
  });

  it('does NOT change position when target is already positioned', () => {
    setBody('<div id="t" style="position: absolute; top: 0; left: 0"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(target.style.position).toBe('absolute');
  });

  it('detach restores static position (removes the inline relative we added)', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.position).toBe('relative');

    handle.detach();
    expect(target.style.getPropertyValue('position')).toBe('');
  });

  it('detach does NOT touch position we did not set', () => {
    setBody('<div id="t" style="position: relative"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    handle.detach();

    expect(target.style.position).toBe('relative');
  });

  it('marks existing children aria-hidden and restores on detach', () => {
    setBody(`
      <div id="t">
        <span id="c1">a</span>
        <span id="c2" aria-hidden="false">b</span>
      </div>
    `);
    const target = document.querySelector<HTMLElement>('#t')!;
    const c1 = document.querySelector('#c1')!;
    const c2 = document.querySelector('#c2')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(c1.getAttribute('aria-hidden')).toBe('true');
    expect(c2.getAttribute('aria-hidden')).toBe('true');

    handle.detach();
    expect(c1.hasAttribute('aria-hidden')).toBe(false);
    expect(c2.getAttribute('aria-hidden')).toBe('false');
  });

  // Direct children of a cover target aren't always HTMLElements — an inline
  // SVG icon (e.g. a rating star or a play glyph on a card) is an Element but
  // not an HTMLElement, since SVGElement and HTMLElement are sibling
  // interfaces rather than parent/child. containCoverChild's callers guard on
  // `instanceof HTMLElement` (it calls .style / setAttribute APIs that assume
  // an HTML element), so such children must be left completely untouched
  // rather than throwing or being silently mis-contained.
  it('skips a non-HTMLElement child (e.g. an inline SVG icon) in the initial contain pass', () => {
    setBody('<div id="t"><span id="c">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    target.append(svg);

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    // The HTMLElement sibling is contained as normal...
    expect(document.querySelector('#c')!.getAttribute('aria-hidden')).toBe('true');
    // ...but the SVG is skipped entirely — no aria-hidden, no inert.
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
    expect(svg.hasAttribute('inert')).toBe(false);
  });

  it('does not aria-hide the host itself (only pre-existing children)', () => {
    setBody('<div id="t"><span id="c">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(getHost()!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('makes existing children inert so focus cannot land on concealed content, and restores on detach', () => {
    setBody(`
      <div id="t">
        <a id="c1" href="#">focusable</a>
        <button id="c2">also focusable</button>
      </div>
    `);
    const target = document.querySelector<HTMLElement>('#t')!;
    const c1 = document.querySelector('#c1')!;
    const c2 = document.querySelector('#c2')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(c1.hasAttribute('inert')).toBe(true);
    expect(c2.hasAttribute('inert')).toBe(true);

    handle.detach();
    expect(c1.hasAttribute('inert')).toBe(false);
    expect(c2.hasAttribute('inert')).toBe(false);
  });

  it('does not make the host itself inert (the Show action stays reachable)', () => {
    setBody('<div id="t"><span id="c">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(getHost()!.hasAttribute('inert')).toBe(false);
  });

  it('preserves a pre-existing inert attribute across detach', () => {
    setBody('<div id="t"><span id="c" inert>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const c = document.querySelector('#c')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(c.hasAttribute('inert')).toBe(true);

    handle.detach();
    // The site already had it inert — we must not strip what we didn't add.
    expect(c.hasAttribute('inert')).toBe(true);
  });

  it('sets pointer-events:none on target so underlying content cannot be clicked through', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.pointerEvents).toBe('none');

    handle.detach();
    expect(target.style.getPropertyValue('pointer-events')).toBe('');
  });

  it('does NOT override pointer-events when target already has an inline value', () => {
    setBody('<div id="t" style="pointer-events: auto"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(target.style.pointerEvents).toBe('auto');
  });

  it('detach does NOT touch pointer-events we did not set', () => {
    setBody('<div id="t" style="pointer-events: auto"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    handle.detach();

    // The site already had it explicit — we must not strip what we didn't add.
    expect(target.style.pointerEvents).toBe('auto');
  });

  it('exposes data-peek="true" on the host by default', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(getHost()!.dataset['peek']).toBe('true');
  });

  it('exposes data-peek="false" when peek is disabled', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', peek: false, actions: [] });
    expect(getHost()!.dataset['peek']).toBe('false');
  });

  it('applies a blur filter (via CSS variable) to every pre-existing child', () => {
    setBody(`
      <div id="t">
        <span id="c1">a</span>
        <span id="c2">b</span>
      </div>
    `);
    const target = document.querySelector<HTMLElement>('#t')!;
    const c1 = document.querySelector<HTMLElement>('#c1')!;
    const c2 = document.querySelector<HTMLElement>('#c2')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    // The blur lives on the children via var(--movar-curtain-filter, …) so the
    // hover handler can swap the value in one write. We set !important on the
    // production code path to defeat site stylesheets, but jsdom 29 strips
    // !important from values that contain var() (cssstyle parser quirk), so
    // we only assert the value shape here.
    expect(c1.style.getPropertyValue('filter')).toContain('var(--movar-curtain-filter');
    expect(c2.style.getPropertyValue('filter')).toContain('var(--movar-curtain-filter');
  });

  it('does not filter the host itself (only pre-existing children)', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(getHost()!.style.getPropertyValue('filter')).toBe('');
  });

  it('restores the prior inline filter on detach (had none)', () => {
    setBody('<div id="t"><span id="c">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const c = document.querySelector<HTMLElement>('#c')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    handle.detach();

    expect(c.style.getPropertyValue('filter')).toBe('');
  });

  it('restores the prior inline filter on detach (had one)', () => {
    setBody('<div id="t"><span id="c" style="filter: grayscale(1)">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const c = document.querySelector<HTMLElement>('#c')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(c.style.getPropertyValue('filter')).toContain('var(--movar-curtain-filter');

    handle.detach();
    expect(c.style.getPropertyValue('filter')).toBe('grayscale(1)');
  });

  it('uses a custom childFilter when provided', () => {
    setBody('<div id="t"><span id="c">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const c = document.querySelector<HTMLElement>('#c')!;

    attachCurtain(target, {
      mode: 'cover',
      title: 'x',
      actions: [],
      childFilter: 'grayscale(1) brightness(0.5)',
    });

    expect(c.style.getPropertyValue('filter')).toContain('grayscale(1) brightness(0.5)');
  });

  it('skips filter+overflow when childFilter is the empty string', () => {
    setBody('<div id="t"><span id="c">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const c = document.querySelector<HTMLElement>('#c')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [], childFilter: '' });

    // Aria-hidden still applies (a11y is independent of visual obscure).
    expect(c.getAttribute('aria-hidden')).toBe('true');
    // No filter, no overflow forcing (neither longhand nor the shorthand).
    expect(c.style.getPropertyValue('filter')).toBe('');
    expect(target.style.getPropertyValue('overflow')).toBe('');
    expect(target.style.getPropertyValue('overflow-x')).toBe('');
    expect(target.style.getPropertyValue('overflow-y')).toBe('');
  });

  it('skips hover-peek wiring when childFilter is empty', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [], childFilter: '' });
    getHost()!.dispatchEvent(new MouseEvent('mouseenter'));

    expect(target.style.getPropertyValue('--movar-curtain-filter')).toBe('');
  });

  it('restoring after empty childFilter does not strip a pre-existing inline overflow', () => {
    setBody('<div id="t" style="overflow: scroll"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, {
      mode: 'cover',
      title: 'x',
      actions: [],
      childFilter: '',
    });
    // Never modified — should still be the site value.
    expect(target.style.getPropertyValue('overflow')).toBe('scroll');

    handle.detach();
    // And still not modified after detach.
    expect(target.style.getPropertyValue('overflow')).toBe('scroll');
  });

  it('hover-peek writes the configured peekFilter to the CSS variable', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'cover',
      title: 'x',
      actions: [],
      peekFilter: 'grayscale(0.2)',
    });

    getHost()!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(target.style.getPropertyValue('--movar-curtain-filter')).toBe('grayscale(0.2)');
  });

  it('hover-peek swaps the --movar-curtain-filter variable on the target', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('--movar-curtain-filter')).toBe('');

    const host = getHost()!;
    host.dispatchEvent(new MouseEvent('mouseenter'));
    expect(target.style.getPropertyValue('--movar-curtain-filter')).toContain('blur(');

    host.dispatchEvent(new MouseEvent('mouseleave'));
    expect(target.style.getPropertyValue('--movar-curtain-filter')).toBe('');
  });

  it('hover-peek is not wired when peek is disabled', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', peek: false, actions: [] });
    getHost()!.dispatchEvent(new MouseEvent('mouseenter'));

    expect(target.style.getPropertyValue('--movar-curtain-filter')).toBe('');
  });

  it('clips blur bleed by forcing overflow:hidden on the target (both longhands)', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    // Set as the individual longhands, not the `overflow` shorthand — see
    // applyCoverSideEffects's comment for why (jsdom doesn't expand the
    // shorthand, so asserting it here would test nothing meaningful; a real
    // browser's CSSOM would still serialize `overflow` back as 'hidden').
    expect(target.style.getPropertyValue('overflow-x')).toBe('hidden');
    expect(target.style.getPropertyValue('overflow-y')).toBe('hidden');
  });

  it('restores prior inline overflow-x/overflow-y on detach (had none)', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    handle.detach();
    expect(target.style.getPropertyValue('overflow-x')).toBe('');
    expect(target.style.getPropertyValue('overflow-y')).toBe('');
  });

  it('restores prior inline overflow-x/overflow-y on detach (had both)', () => {
    setBody('<div id="t" style="overflow-x: scroll; overflow-y: scroll"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('overflow-x')).toBe('hidden');
    expect(target.style.getPropertyValue('overflow-y')).toBe('hidden');

    handle.detach();
    expect(target.style.getPropertyValue('overflow-x')).toBe('scroll');
    expect(target.style.getPropertyValue('overflow-y')).toBe('scroll');
  });

  // Regression test for #302: jsdom does NOT model shorthand<->longhand
  // expansion (confirmed empirically — setting the `overflow` shorthand only
  // ever populates jsdom's independent 'overflow' slot, never 'overflow-x'/
  // 'overflow-y', and vice versa), so the original bug — `getPropertyValue
  // ('overflow')` returning '' when only one longhand was inlined, causing an
  // empty snapshot and a revert that wiped BOTH longhands — cannot be
  // reproduced here; a naive "fails without the fix" test would falsely pass.
  // This instead verifies the NEW longhand-based snapshot/restore contract
  // directly: a single inline longhand must round-trip verbatim (value +
  // priority), independent of the other axis.
  it('round-trips a single inline overflow-y longhand untouched by overflow-x', () => {
    setBody('<div id="t" style="overflow-y: auto"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    // While curtained, both axes are forced hidden (halo clipping needs both).
    expect(target.style.getPropertyValue('overflow-x')).toBe('hidden');
    expect(target.style.getPropertyValue('overflow-y')).toBe('hidden');

    handle.detach();
    // The site's own overflow-y comes back verbatim; overflow-x — which the
    // site never set — is fully removed, not left as an empty-string 'hidden'
    // leftover from our forcing pass.
    expect(target.style.getPropertyValue('overflow-y')).toBe('auto');
    expect(target.style.getPropertyValue('overflow-x')).toBe('');
  });

  it('round-trips a single inline overflow-x longhand with !important priority', () => {
    // `clip` (distinct from the 'hidden' we force during cover) so the
    // assertions actually distinguish "forced by us" from "the site's value
    // happened to already be hidden" — and prove the priority snapshot isn't
    // just coincidentally matching our own !important.
    setBody('<div id="t" style="overflow-x: clip !important"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('overflow-x')).toBe('hidden');
    expect(target.style.getPropertyPriority('overflow-x')).toBe('important');

    handle.detach();
    expect(target.style.getPropertyValue('overflow-x')).toBe('clip');
    expect(target.style.getPropertyPriority('overflow-x')).toBe('important');
    expect(target.style.getPropertyValue('overflow-y')).toBe('');
  });

  it('detach clears any active hover peek variable', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    getHost()!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(target.style.getPropertyValue('--movar-curtain-filter')).toContain('blur(');

    handle.detach();
    expect(target.style.getPropertyValue('--movar-curtain-filter')).toBe('');
  });
});

// A bare inline target gives an abspos overlay a 0-width containing block and
// ignores overflow, so the pill escapes and overlaps its neighbours. Cover mode
// promotes such a target to inline-block first — a real box the overlay can fill
// and clip — while leaving the host a child of the target (so the page-wide
// reveal/hide sweeps, which scope to the target, still find it).
describe('attachCurtain — cover mode, inline targets', () => {
  it('promotes a bare inline target to inline-block so the overlay can fill it', () => {
    setBody('<span id="t">a</span>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(target.style.getPropertyValue('display')).toBe('inline-block');
  });

  it('leaves a block target undisturbed (no display promotion)', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(target.style.getPropertyValue('display')).toBe('');
  });

  it('keeps the overlay host inside the inline target (not a sibling)', () => {
    setBody('<span id="t">a</span>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    expect(getHost()!.parentElement).toBe(target);
  });

  it('restores display on detach when the inline target had no inline display', () => {
    setBody('<span id="t">a</span>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('display')).toBe('inline-block');

    handle.detach();
    expect(target.style.getPropertyValue('display')).toBe('');
  });

  it('restores the prior inline display on detach when the target had one', () => {
    setBody('<span id="t" style="display: inline">a</span>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('display')).toBe('inline-block');

    handle.detach();
    expect(target.style.getPropertyValue('display')).toBe('inline');
  });
});

// A cover target's content can arrive AFTER attach — Google's AI Overview
// declares its block early (so we conceal before the answer's language is even
// visible), then streams in the header, "show more" and the ⋮ overflow menu as
// the answer generates. A one-shot snapshot of the children present at attach
// would leave those late nodes un-blurred, focusable, and painting on top of the
// curtain — occluding its own "Show" button. A MutationObserver contains them.
describe('attachCurtain — cover mode, children streamed in after attach', () => {
  it('contains a child added after attach (aria-hidden + inert)', async () => {
    setBody('<div id="t"><span id="c0">a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const late = document.createElement('div');
    late.id = 'late';
    late.textContent = 'streamed';
    target.append(late);
    await flush();

    expect(late.getAttribute('aria-hidden')).toBe('true');
    expect(late.hasAttribute('inert')).toBe(true);
  });

  it('blurs a child added after attach', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const late = document.createElement('div');
    target.append(late);
    await flush();

    expect(late.style.getPropertyValue('filter')).toContain('var(--movar-curtain-filter');
  });

  it('inerts but does not blur a late child when childFilter is empty', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [], childFilter: '' });

    const late = document.createElement('div');
    target.append(late);
    await flush();

    expect(late.getAttribute('aria-hidden')).toBe('true');
    expect(late.hasAttribute('inert')).toBe(true);
    expect(late.style.getPropertyValue('filter')).toBe('');
  });

  it('leaves the curtain host interactive after later mutations (never inert/blurred)', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    target.append(document.createElement('div'));
    await flush();

    const host = getHost()!;
    expect(host.hasAttribute('inert')).toBe(false);
    expect(host.getAttribute('aria-hidden')).not.toBe('true');
    expect(host.style.getPropertyValue('filter')).toBe('');
  });

  it('ignores a non-element node streamed in after attach', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    target.append(document.createTextNode('  streamed text  '));

    await expect(flush()).resolves.toBeUndefined();
  });

  // containCoverChild's prior-state-marker guard (see its doc comment) exists
  // because the SAME node can arrive in the observer's addedNodes more than
  // once — e.g. a site reordering its own children removes then re-inserts a
  // node, which fires a second childList mutation for it. Without the guard,
  // the second pass would re-snapshot the child's filter — but by then it
  // already reads the curtain's OWN blur value rather than the site's
  // original — and that (wrong) snapshot would win on detach, leaving the
  // child permanently blurred instead of restored.
  it('does not re-contain a child that is delivered twice (repeat observer callback)', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const late = document.createElement('div');
    target.append(late);
    await flush();
    expect(late.style.getPropertyValue('filter')).toContain('var(--movar-curtain-filter');

    // Re-append the same node — still the only child, but this removes then
    // re-inserts it, delivering `late` in addedNodes a second time. It still
    // carries the prior-state marker from the first pass, so the guard must
    // skip it this time instead of double-registering it.
    target.append(late);
    await flush();

    handle.detach();
    expect(late.style.getPropertyValue('filter')).toBe('');
    expect(late.hasAttribute('aria-hidden')).toBe(false);
    expect(late.hasAttribute('inert')).toBe(false);
  });

  it('restores a child added after attach on detach', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const late = document.createElement('div');
    target.append(late);
    await flush();
    expect(late.hasAttribute('inert')).toBe(true);

    handle.detach();
    expect(late.hasAttribute('aria-hidden')).toBe(false);
    expect(late.hasAttribute('inert')).toBe(false);
    expect(late.style.getPropertyValue('filter')).toBe('');
  });

  // jsdom does no layout, so the collapse itself can't be asserted here — the
  // pixel behaviour is pinned by the curtain-tiers visual baselines. What IS
  // worth guarding is that no threshold drifts back to a hand-measured magic
  // number: every movar-cover breakpoint must be a containerBand rung, so a
  // future tweak has to move a whole step along the ladder (and update the
  // baselines) rather than nudging a card silently onto a different tier.
  it('keys every movar-cover breakpoint on the containerBand ladder', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const css = getHost()!.shadowRoot!.querySelector('style')!.textContent;
    const rungs = new Set<number>(Object.values(containerBand));
    // Match the whole query prelude up to the block's `{`, not just the first
    // parenthesised condition — the narrow rules read `(max-height: …) and
    // (max-width: …)`, and stopping at the first `)` would silently skip every
    // width rung and leave this guard passing on anything.
    const thresholds = [...css.matchAll(/@container movar-cover ([^{]*)\{/g)]
      .flatMap((m) => [...(m[1] ?? '').matchAll(/(\d+)px/g)])
      .map((m) => Number(m[1]));

    // 8 = the tall-block min-height, the fold's max-height, and two conditions
    // each for the three narrowing rules. Pinned so a rule deleted wholesale
    // can't shrink this into a guard that passes by checking nothing.
    expect(thresholds.length).toBe(8);
    expect(thresholds.filter((px) => !rungs.has(px))).toEqual([]);
  });

  it('stops containing new children after detach (observer disconnected)', async () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    handle.detach();

    const late = document.createElement('div');
    target.append(late);
    await flush();

    expect(late.hasAttribute('inert')).toBe(false);
    expect(late.getAttribute('aria-hidden')).not.toBe('true');
  });
});
