import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachTooltip,
  detachAllTooltips,
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
} from './tooltip';

function getHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-movar-tooltip]')];
}

function getShadow(host: HTMLElement): ShadowRoot {
  if (!host.shadowRoot) throw new Error('host has no shadow root');
  return host.shadowRoot;
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function flushTimers(ms: number): void {
  vi.advanceTimersByTime(ms);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  detachAllTooltips();
  vi.useRealTimers();
});

describe('attachTooltip — lifecycle', () => {
  it('throws when the anchor is not connected to the DOM', () => {
    const orphan = document.createElement('span');
    expect(() => attachTooltip(orphan, { title: 'x' })).toThrow();
  });

  it('appends a shadow-rooted host to document.body', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'Movar', body: 'hidden' });

    const hosts = getHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0]!.parentElement).toBe(document.body);
    expect(hosts[0]!.shadowRoot).not.toBeNull();
  });

  it('renders title, body, and action button inside the shadow root', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, {
      title: 'Some options hidden',
      body: 'Movar hid Russian.',
      action: { label: 'Show', onClick: () => {} },
    });

    const shadow = getShadow(getHosts()[0]!);
    expect(shadow.querySelector('.title')?.textContent).toBe('Some options hidden');
    expect(shadow.querySelector('.body')?.textContent).toBe('Movar hid Russian.');
    expect(shadow.querySelector<HTMLButtonElement>('.action')?.textContent).toBe('Show');
  });

  it('skips title and body nodes when not provided', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#anchor')!, {
      action: { label: 'OK', onClick: () => {} },
    });
    const shadow = getShadow(getHosts()[0]!);
    expect(shadow.querySelector('.title')).toBeNull();
    expect(shadow.querySelector('.body')).toBeNull();
    expect(shadow.querySelector('.action')).not.toBeNull();
  });

  it('starts closed (data-state unset, opacity 0 via host attribute)', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#anchor')!, { title: 'x' });
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();
  });
});

describe('attachTooltip — hover behaviour', () => {
  it('opens after the full dwell on mouseenter, not before', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x' });

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(HOVER_OPEN_DELAY_MS - 1);
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();
    flushTimers(2);
    expect(getHosts()[0]!.dataset['state']).toBe('open');
  });

  it('cancels the open timer when mouseleave fires before dwell completes', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x' });

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(Math.floor(HOVER_OPEN_DELAY_MS / 2));
    anchor.dispatchEvent(new MouseEvent('mouseleave'));
    flushTimers(HOVER_OPEN_DELAY_MS + HOVER_CLOSE_DELAY_MS + 100);
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();
  });

  it('stays open until the full close-delay elapses after mouseleave', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x' });

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(HOVER_OPEN_DELAY_MS);
    expect(getHosts()[0]!.dataset['state']).toBe('open');
    anchor.dispatchEvent(new MouseEvent('mouseleave'));
    flushTimers(HOVER_CLOSE_DELAY_MS - 1);
    expect(getHosts()[0]!.dataset['state']).toBe('open');
    flushTimers(2);
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();
  });

  it('keeps the tooltip open when the cursor moves from anchor onto the tooltip surface', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x' });

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(HOVER_OPEN_DELAY_MS);
    anchor.dispatchEvent(new MouseEvent('mouseleave'));
    // Before the close-delay elapses, the user mouses onto the tooltip.
    getHosts()[0]!.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(HOVER_OPEN_DELAY_MS + HOVER_CLOSE_DELAY_MS + 100);
    expect(getHosts()[0]!.dataset['state']).toBe('open');
  });
});

describe('attachTooltip — focus behaviour', () => {
  it('opens immediately on focus (no dwell)', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x' });

    anchor.dispatchEvent(new FocusEvent('focus'));
    expect(getHosts()[0]!.dataset['state']).toBe('open');
  });

  it('closes on ESC when focused on the anchor (focus stays on anchor)', () => {
    // ESC + focus assertions are synchronous (keydown listener runs in the
    // same tick); fake timers would still work, but jumping back to real
    // timers here documents that the assertions don't depend on any timer
    // advance and lets a future change to the ESC path surface as a real
    // failure rather than a hung test.
    vi.useRealTimers();
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    const focusSpy = vi.spyOn(anchor, 'focus');
    attachTooltip(anchor, { title: 'x' });

    anchor.dispatchEvent(new FocusEvent('focus'));
    expect(getHosts()[0]!.dataset['state']).toBe('open');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();
    // Focus is already on the anchor — no need to re-focus. Re-focusing
    // would re-fire onFocus and reopen the tooltip we just closed.
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('closes on ESC when focus is inside the tooltip and returns focus to the anchor', () => {
    // Same rationale as the anchor-focus ESC test above — synchronous
    // assertions, no timer dependency.
    vi.useRealTimers();
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    const focusSpy = vi.spyOn(anchor, 'focus');
    attachTooltip(anchor, {
      title: 'x',
      action: { label: 'Show', onClick: () => {} },
    });

    anchor.dispatchEvent(new FocusEvent('focus'));
    // Move focus onto the action button inside the shadow root.
    const button = getShadow(getHosts()[0]!).querySelector<HTMLButtonElement>('.action')!;
    button.focus();
    expect(getHosts()[0]!.dataset['state']).toBe('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();
    expect(focusSpy).toHaveBeenCalled();
  });
});

describe('attachTooltip — action button', () => {
  it('fires onClick with a context that can close OR detach', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    const onClick = vi.fn();
    attachTooltip(anchor, { title: 'x', action: { label: 'Show', onClick } });

    anchor.dispatchEvent(new FocusEvent('focus'));
    const button = getShadow(getHosts()[0]!).querySelector<HTMLButtonElement>('.action')!;
    button.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    const ctx = onClick.mock.calls[0]![0];
    expect(typeof ctx.close).toBe('function');
    expect(typeof ctx.detach).toBe('function');
  });

  it('detach() removes the host entirely', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, {
      title: 'x',
      action: {
        label: 'Show',
        onClick: (ctx) => {
          ctx.detach();
        },
      },
    });

    anchor.dispatchEvent(new FocusEvent('focus'));
    getShadow(getHosts()[0]!).querySelector<HTMLButtonElement>('.action')!.click();
    expect(getHosts()).toHaveLength(0);
  });

  it('close() leaves the tooltip attached but invisible (re-opens on next hover)', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, {
      title: 'x',
      action: {
        label: 'OK',
        onClick: (ctx) => {
          ctx.close();
        },
      },
    });

    anchor.dispatchEvent(new FocusEvent('focus'));
    getShadow(getHosts()[0]!).querySelector<HTMLButtonElement>('.action')!.click();
    expect(getHosts()).toHaveLength(1);
    expect(getHosts()[0]!.dataset['state']).toBeUndefined();

    // Hover again — the same instance opens.
    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(HOVER_OPEN_DELAY_MS);
    expect(getHosts()[0]!.dataset['state']).toBe('open');
  });

  it('stops click propagation so site delegates do not fire', () => {
    setBody('<div id="parent"><a id="anchor" href="#">UA</a></div>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    const parent = document.querySelector<HTMLElement>('#parent')!;
    const parentHandler = vi.fn();
    parent.addEventListener('click', parentHandler);
    attachTooltip(anchor, { title: 'x', action: { label: 'Show', onClick: () => {} } });

    anchor.dispatchEvent(new FocusEvent('focus'));
    getShadow(getHosts()[0]!).querySelector<HTMLButtonElement>('.action')!.click();
    expect(parentHandler).not.toHaveBeenCalled();
  });
});

describe('attachTooltip — detach', () => {
  it('detach() is idempotent', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    const handle = attachTooltip(anchor, { title: 'x' });

    handle.detach();
    expect(() => {
      handle.detach();
    }).not.toThrow();
    expect(getHosts()).toHaveLength(0);
  });

  it('detach() removes anchor listeners — subsequent mouseenter has no effect', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    const handle = attachTooltip(anchor, { title: 'x' });
    handle.detach();

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    flushTimers(HOVER_OPEN_DELAY_MS + HOVER_CLOSE_DELAY_MS + 100);
    expect(getHosts()).toHaveLength(0);
  });
});

describe('detachAllTooltips', () => {
  it('detaches every tooltip on the page', () => {
    setBody('<a id="a1" href="#">UA</a><a id="a2" href="#">EN</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#a1')!, { title: 'one' });
    attachTooltip(document.querySelector<HTMLAnchorElement>('#a2')!, { title: 'two' });
    expect(getHosts()).toHaveLength(2);

    detachAllTooltips();
    expect(getHosts()).toHaveLength(0);
  });
});

describe('attachTooltip — placement metadata', () => {
  it('exposes data-placement="top" by default', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#anchor')!, { title: 'x' });
    expect(getHosts()[0]!.dataset['placement']).toBe('top');
  });

  it('respects an explicit placement="bottom"', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#anchor')!, {
      title: 'x',
      placement: 'bottom',
    });
    expect(getHosts()[0]!.dataset['placement']).toBe('bottom');
  });
});

describe('attachTooltip — tone', () => {
  it('defaults to neutral', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#anchor')!, { title: 'x' });
    expect(getHosts()[0]!.dataset['tone']).toBe('neutral');
  });

  it('accepts the accent tone', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    attachTooltip(document.querySelector<HTMLAnchorElement>('#anchor')!, {
      title: 'x',
      tone: 'accent',
    });
    expect(getHosts()[0]!.dataset['tone']).toBe('accent');
  });
});
