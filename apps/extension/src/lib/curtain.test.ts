import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ActionContext, attachCurtain, defaultHiddenIcon, detachAllCurtains } from './curtain';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function getHost(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-movar-curtain]');
}

function getShadow(host: HTMLElement): ShadowRoot {
  if (!host.shadowRoot) throw new Error('host has no shadow root');
  return host.shadowRoot;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('attachCurtain — replace mode', () => {
  it('hides the target via display:none and inserts host as sibling-before', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const parent = document.querySelector('#parent')!;

    attachCurtain(target, { mode: 'replace', title: 'Hidden', actions: [] });

    expect(target.style.display).toBe('none');
    expect(target.style.getPropertyPriority('display')).toBe('important');
    const host = getHost();
    expect(host).not.toBeNull();
    expect(host!.parentElement).toBe(parent);
    // Host is inserted BEFORE the target.
    expect(host!.nextElementSibling).toBe(target);
  });

  it('detach restores prior inline display when site had one', () => {
    setBody('<div id="parent"><span id="t" style="display: inline-block">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'replace', title: 'x', actions: [] });
    handle.detach();

    expect(target.style.display).toBe('inline-block');
    expect(getHost()).toBeNull();
  });

  it('detach removes inline display when site had none', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const handle = attachCurtain(target, { mode: 'replace', title: 'x', actions: [] });
    handle.detach();

    expect(target.style.getPropertyValue('display')).toBe('');
    expect(getHost()).toBeNull();
  });

  it('throws when target has no parent', () => {
    const orphan = document.createElement('div');
    expect(() => attachCurtain(orphan, { mode: 'replace', title: 'x', actions: [] })).toThrow();
  });

  it('renders title, description, and icon', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      icon: '⚑',
      title: 'Hidden by Movar',
      description: '3 languages filtered',
      actions: [],
    });

    const shadow = getShadow(getHost()!);
    expect(shadow.querySelector('.pill__title')?.textContent).toBe('Hidden by Movar');
    expect(shadow.querySelector('.pill__description')?.textContent).toBe('3 languages filtered');
    expect(shadow.querySelector('.pill__icon')?.textContent).toBe('⚑');
  });

  it('stacks header, description, and actions vertically', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      icon: '⚑',
      title: 'Hidden',
      description: 'Reason',
      actions: [{ label: 'Show', onClick: () => {} }],
    });

    const pill = getShadow(getHost()!).querySelector('.pill')!;
    const kids = [...pill.children].map((c) => c.className);
    // Header (icon + title) → description → actions, in that order. The
    // vertical card design depends on this DOM ordering plus the CSS
    // `flex-direction: column` on `.pill`.
    expect(kids).toEqual(['pill__header', 'pill__description', 'pill__actions']);

    const header = pill.querySelector('.pill__header')!;
    expect(header.querySelector('.pill__icon')).not.toBeNull();
    expect(header.querySelector('.pill__title')).not.toBeNull();
  });

  it('accepts an SVG Node icon and appends verbatim', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset['testid'] = 'icon';

    attachCurtain(target, {
      mode: 'replace',
      icon: svg,
      title: 'x',
      actions: [],
    });

    const shadow = getShadow(getHost()!);
    expect(shadow.querySelector('[data-testid="icon"]')).toBe(svg);
  });

  it('skips description and icon when not provided', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'replace', title: 'just-title', actions: [] });

    const shadow = getShadow(getHost()!);
    expect(shadow.querySelector('.pill__description')).toBeNull();
    expect(shadow.querySelector('.pill__icon')).toBeNull();
  });

  it('defaultHiddenIcon returns a fresh inline SVG node for caller use', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const icon = defaultHiddenIcon();
    expect(icon).not.toBeNull();
    expect(icon.tagName.toLowerCase()).toBe('svg');

    attachCurtain(target, {
      mode: 'replace',
      icon,
      title: 'x',
      actions: [],
    });

    const iconWrap = getShadow(getHost()!).querySelector('.pill__icon')!;
    expect(iconWrap.querySelector('svg')).not.toBeNull();
  });
});

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

describe('actions', () => {
  it('invokes onClick with a context that can detach the curtain', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const onClick = vi.fn((ctx) => ctx.detach());
    const handle = attachCurtain(target, {
      mode: 'replace',
      title: 'x',
      actions: [{ label: 'Restore', onClick }],
    });
    const hostAtAttach = handle.host;

    const button = getShadow(hostAtAttach).querySelector('button')!;
    button.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    const ctx = onClick.mock.calls[0]![0];
    expect(typeof ctx.detach).toBe('function');
    expect(ctx.host).toBe(hostAtAttach);
    // detach() ran inside onClick, so the host is gone from the document.
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('renders multiple actions with the right variant classes', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      title: 'x',
      actions: [
        { label: 'Restore', variant: 'primary', onClick: vi.fn() },
        { label: 'Settings', variant: 'ghost', onClick: vi.fn() },
        { label: 'NoVariant', onClick: vi.fn() },
      ],
    });

    const buttons = [...getShadow(getHost()!).querySelectorAll('button')];
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.className).toContain('pill__action--primary');
    expect(buttons[1]!.className).toContain('pill__action--ghost');
    // Default variant is ghost.
    expect(buttons[2]!.className).toContain('pill__action--ghost');
  });

  it('stops click event propagation so site delegates do not fire', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const parent = document.querySelector<HTMLElement>('#parent')!;
    const parentHandler = vi.fn();
    parent.addEventListener('click', parentHandler);

    attachCurtain(target, {
      mode: 'replace',
      title: 'x',
      actions: [{ label: 'Restore', onClick: vi.fn() }],
    });
    const button = getShadow(getHost()!).querySelector('button')!;
    button.click();

    expect(parentHandler).not.toHaveBeenCalled();
  });
});

describe('aria-label', () => {
  it('defaults the curtain aria-label to the title', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'replace', title: 'Default Label', actions: [] });

    expect(getShadow(getHost()!).querySelector('.pill')?.getAttribute('aria-label')).toBe(
      'Default Label',
    );
  });

  it('respects an explicit ariaLabel override', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, {
      mode: 'replace',
      title: 'shown',
      ariaLabel: 'screen-reader only',
      actions: [],
    });

    expect(getShadow(getHost()!).querySelector('.pill')?.getAttribute('aria-label')).toBe(
      'screen-reader only',
    );
  });
});

describe('detach', () => {
  it('is idempotent', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const handle = attachCurtain(target, { mode: 'replace', title: 'x', actions: [] });

    handle.detach();
    expect(() => {
      handle.detach();
    }).not.toThrow();
    expect(getHost()).toBeNull();
  });
});

describe('detachAllCurtains', () => {
  it('detaches every curtain under root', () => {
    setBody(`
      <div id="parent">
        <span id="a">a</span>
        <span id="b">b</span>
        <div id="c" style="width: 50px; height: 50px"></div>
      </div>
    `);
    const a = document.querySelector<HTMLElement>('#a')!;
    const b = document.querySelector<HTMLElement>('#b')!;
    const c = document.querySelector<HTMLElement>('#c')!;

    attachCurtain(a, { mode: 'replace', title: 'A', actions: [] });
    attachCurtain(b, { mode: 'replace', title: 'B', actions: [] });
    attachCurtain(c, { mode: 'cover', title: 'C', actions: [] });

    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(3);
    detachAllCurtains();
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);

    // Side effects reverted: replace-mode targets visible again, cover-mode position cleared.
    expect(a.style.getPropertyValue('display')).toBe('');
    expect(b.style.getPropertyValue('display')).toBe('');
    expect(c.style.position).toBe('');
  });

  it('scopes to the root subtree when provided', () => {
    setBody(`
      <div id="region1"><span id="t1">a</span></div>
      <div id="region2"><span id="t2">b</span></div>
    `);
    const t1 = document.querySelector<HTMLElement>('#t1')!;
    const t2 = document.querySelector<HTMLElement>('#t2')!;

    attachCurtain(t1, { mode: 'replace', title: 'A', actions: [] });
    attachCurtain(t2, { mode: 'replace', title: 'B', actions: [] });

    const region1 = document.querySelector<HTMLElement>('#region1')!;
    detachAllCurtains(region1);

    expect(region1.querySelector('[data-movar-curtain]')).toBeNull();
    expect(
      document.querySelector('#region2')?.querySelector('[data-movar-curtain]'),
    ).not.toBeNull();
  });
});

describe('attachCurtain — chip skin', () => {
  it('renders icon + label inside a button when actions are provided', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'Українська',
      description: 'Movar — Українська. Click to show.',
      actions: [{ label: 'Show', onClick: () => {} }],
    });

    const host = getHost()!;
    expect(host.dataset['skin']).toBe('chip');
    const shadow = getShadow(host);
    const chip = shadow.querySelector<HTMLButtonElement>('button.chip')!;
    expect(chip).not.toBeNull();
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.type).toBe('button');
    expect(shadow.querySelector('.chip__icon')?.textContent).toBe('⚑');
    expect(shadow.querySelector('.chip__label')?.textContent).toBe('Українська');
    // Pill-skin nodes don't exist for a chip.
    expect(shadow.querySelector('.pill')).toBeNull();
  });

  it('omits the label node when title is empty (sigil-only)', () => {
    // Sigil-only is the zero-survivor degradation — the chip stays an icon,
    // the aria-label still carries the explanation.
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: '',
      description: 'Movar hid this picker.',
      actions: [{ label: 'Show', onClick: () => {} }],
    });

    const shadow = getShadow(getHost()!);
    expect(shadow.querySelector('.chip__label')).toBeNull();
    expect(shadow.querySelector('.chip__icon')).not.toBeNull();
    expect(shadow.querySelector('.chip')?.getAttribute('aria-label')).toBe(
      'Movar hid this picker.',
    );
  });

  it('clicking the chip invokes the first action with a detach-capable context', () => {
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    const onClick = vi.fn((ctx: ActionContext) => ctx.detach());
    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'EN',
      description: 'desc',
      actions: [{ label: 'Show', onClick }],
    });

    const chip = getShadow(getHost()!).querySelector<HTMLButtonElement>('button.chip')!;
    chip.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('degrades to a non-interactive <span> when no actions are provided', () => {
    // A chip without restore behaviour is a marker, not a button. Render
    // semantically rather than ship a button that does nothing.
    setBody('<div id="parent"><span id="t">orig</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'EN',
      description: 'marker',
      actions: [],
    });

    const shadow = getShadow(getHost()!);
    expect(shadow.querySelector('button.chip')).toBeNull();
    expect(shadow.querySelector('span.chip')).not.toBeNull();
  });

  it('stops click propagation so site delegates do not fire', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    const parent = document.querySelector<HTMLElement>('#parent')!;
    const parentHandler = vi.fn();
    parent.addEventListener('click', parentHandler);

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'EN',
      description: 'desc',
      actions: [{ label: 'Show', onClick: vi.fn() }],
    });
    const chip = getShadow(getHost()!).querySelector<HTMLButtonElement>('button.chip')!;
    chip.click();

    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('mirrors the description as the host `title` attribute for sighted hover', () => {
    // Native browser tooltip on the host node, not buried inside the
    // shadow root — keeps discoverability at hover-delay friction level.
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'EN',
      description: 'Hover explanation',
      actions: [{ label: 'Show', onClick: () => {} }],
    });

    expect(getHost()!.title).toBe('Hover explanation');
  });

  it('falls back to title for the host title when no description is provided', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'EN',
      actions: [{ label: 'Show', onClick: () => {} }],
    });

    expect(getHost()!.title).toBe('EN');
  });

  it('respects an explicit ariaLabel override on the chip', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      skin: 'chip',
      icon: '⚑',
      title: 'EN',
      description: 'desc',
      ariaLabel: 'screen reader copy',
      actions: [{ label: 'Show', onClick: () => {} }],
    });

    expect(getShadow(getHost()!).querySelector('.chip')?.getAttribute('aria-label')).toBe(
      'screen reader copy',
    );
  });
});

describe('host marker attribute', () => {
  it('marks the host with data-movar-curtain for discovery', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'replace', title: 'x', actions: [] });

    const found = document.querySelector('[data-movar-curtain]');
    expect(found).not.toBeNull();
  });
});

describe('entrance state', () => {
  it('sets data-state="ready" after attach so the opacity transition fires', () => {
    setBody('<div id="parent"><span id="t">x</span></div>');
    const target = document.querySelector<HTMLElement>('#t')!;
    attachCurtain(target, { mode: 'replace', title: 'x', actions: [] });

    expect(getHost()!.dataset['state']).toBe('ready');
  });
});
