import { describe, expect, it, vi } from 'vitest';
import { attachCurtain, defaultHiddenIcon, detachAllCurtains } from './curtain';
import { setBody, getHost, getShadow } from './dom-test-helpers';

// Global setup in test-setup.ts clears body/head/lang before each test and
// invokes detachAllCurtains in afterEach when a [data-movar-curtain] host
// remains — see apps/extension/src/lib/test-setup.ts.

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
