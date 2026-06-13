import { describe, expect, it } from 'vitest';
import { attachCurtain } from './curtain';
import { setBody, getHost } from './dom-test-helpers';

// Global setup in test-setup.ts clears body/head/lang before each test and
// invokes detachAllCurtains in afterEach when a [data-movar-curtain] host
// remains — see apps/extension/src/lib/test-setup.ts.

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
    // No filter, no overflow forcing.
    expect(c.style.getPropertyValue('filter')).toBe('');
    expect(target.style.getPropertyValue('overflow')).toBe('');
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

  it('clips blur bleed by forcing overflow:hidden on the target', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('overflow')).toBe('hidden');
  });

  it('restores prior inline overflow on detach (had none)', () => {
    setBody('<div id="t"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    handle.detach();
    expect(target.style.getPropertyValue('overflow')).toBe('');
  });

  it('restores prior inline overflow on detach (had one)', () => {
    setBody('<div id="t" style="overflow: scroll"><span>a</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });
    expect(target.style.getPropertyValue('overflow')).toBe('hidden');

    handle.detach();
    expect(target.style.getPropertyValue('overflow')).toBe('scroll');
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
