import { describe, expect, it, vi } from 'vitest';
import { attachCurtain } from './curtain';
import type { ActionContext } from './curtain';
import { setBody, getHost, getShadow } from './dom-test-helpers';

// Global setup in test-setup.ts clears body/head/lang before each test and
// invokes detachAllCurtains in afterEach when a [data-movar-curtain] host
// remains — see apps/extension/src/lib/test-setup.ts.

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
