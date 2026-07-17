import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { resetBridgeForTest } from './bridge';
import type { Platform } from './bridge';
import { messagesEn } from './i18n/messages-en';
import { messagesUk } from './i18n/messages-uk';

/** Push a native `show()` the way Swift does, inside act() so the subscribed
 *  `useHostState` re-render is flushed. */
function nativeShow(platform: Platform, enabled?: boolean, useSettings?: boolean): void {
  act(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- installed at module eval
    globalThis.show!(platform, enabled, useSettings);
  });
}

/** The tab-change scroll reset (App's `useScrollTopOnTabChange`) calls
 *  `window.scrollTo`, which jsdom leaves unimplemented (it logs to stderr on
 *  every tab switch). Spy it so the whole suite stays quiet and the scroll-reset
 *  tests below can assert on it. */
let scrollToSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetBridgeForTest();
  document.body.className = '';
  scrollToSpy = vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  document.body.className = '';
  scrollToSpy.mockRestore();
});

describe('App — tab structure', () => {
  it('renders exactly three tabs (Detector / Settings / About) in bar order', () => {
    render(<App messages={messagesEn} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Detector', 'Settings', 'About']);
  });

  it('renders the three tabs before the host reports a platform (pre-show state)', () => {
    render(<App messages={messagesEn} />);
    // The tab bar is platform-independent — present even with state === null.
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('labels the tabs from the resolved locale (uk catalogue)', () => {
    render(<App messages={messagesUk} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      messagesUk.tabs.detector,
      messagesUk.tabs.settings,
      messagesUk.tabs.about,
    ]);
  });

  it('shows the Detector panel first and hides the others', () => {
    render(<App messages={messagesEn} />);
    // Inactive panels carry `hidden`, so they're out of the a11y tree; the one
    // panel `getByRole('tabpanel')` returns (no `hidden` option) is the visible
    // one. Exactly one panel must be exposed, and it's the Detector — keyed off
    // its (now real) card title rather than the old stub marker.
    expect(
      screen.getAllByRole('tabpanel', { hidden: true }).filter((p) => p.hidden === false),
    ).toHaveLength(1);
    expect(within(screen.getByRole('tabpanel')).getByText(messagesEn.detector.title)).toBeTruthy();
  });
});

describe('App — roving tabindex', () => {
  it('keeps exactly the active tab in the tab order (tabIndex 0), the rest at -1', () => {
    render(<App messages={messagesEn} />);
    const [detector, settings, about] = screen.getAllByRole('tab');
    expect(detector!.tabIndex).toBe(0);
    expect(settings!.tabIndex).toBe(-1);
    expect(about!.tabIndex).toBe(-1);
  });

  it('moves the tab order to a clicked tab and reflects aria-selected', () => {
    render(<App messages={messagesEn} />);
    const settings = screen.getByRole('tab', { name: 'Settings' });
    fireEvent.click(settings);
    expect(settings.tabIndex).toBe(0);
    expect(settings.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Detector' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('reveals the clicked tab’s panel and hides the previous one', () => {
    render(<App messages={messagesEn} />);
    fireEvent.click(screen.getByRole('tab', { name: 'About' }));
    expect(
      screen.getAllByRole('tabpanel', { hidden: true }).filter((p) => p.hidden === false),
    ).toHaveLength(1);
    // The About panel always shows the trust row (even pre-`show()`), so its
    // first claim identifies the visible panel.
    expect(within(screen.getByRole('tabpanel')).getByText(messagesEn.trust.free)).toBeTruthy();
  });
});

describe('App — arrow-key navigation (ported from Script.js initTabs)', () => {
  it('ArrowRight selects the next tab, wrapping past the last', () => {
    render(<App messages={messagesEn} />);
    const detector = screen.getByRole('tab', { name: 'Detector' });
    fireEvent.keyDown(detector, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Settings' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'About' }).getAttribute('aria-selected')).toBe('true');

    // Wrap-around: ArrowRight on the last tab returns to the first.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'About' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Detector' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('ArrowLeft selects the previous tab, wrapping past the first', () => {
    render(<App messages={messagesEn} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Detector' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'About' }).getAttribute('aria-selected')).toBe('true');
  });

  it('ArrowDown / ArrowUp behave like Right / Left (vertical fallback)', () => {
    render(<App messages={messagesEn} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Detector' }), { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Settings' }), { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'Detector' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('moves DOM focus to the newly-selected tab (roving tabindex)', () => {
    render(<App messages={messagesEn} />);
    const detector = screen.getByRole('tab', { name: 'Detector' });
    detector.focus();
    fireEvent.keyDown(detector, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Settings' }));
  });
});

describe('App — scroll reset on tab change', () => {
  it('scrolls the viewport back to the top when a click changes the active tab', () => {
    render(<App messages={messagesEn} />);
    // Ignore the initial-mount reset — we only care about the switch.
    scrollToSpy.mockClear();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls back to the top on an arrow-key tab move too', () => {
    render(<App messages={messagesEn} />);
    scrollToSpy.mockClear();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Detector' }), { key: 'ArrowRight' });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('does not scroll when the already-active tab is re-selected (no active change)', () => {
    render(<App messages={messagesEn} />);
    scrollToSpy.mockClear();
    // Detector is active by default; re-clicking it leaves `active` unchanged,
    // so the layout effect must not re-fire.
    fireEvent.click(screen.getByRole('tab', { name: 'Detector' }));
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('App — platform gating', () => {
  it('adds no platform class to <html>/<body> before the host calls show()', () => {
    render(<App messages={messagesEn} />);
    for (const el of [document.documentElement, document.body]) {
      expect(el.classList.contains('platform-ios')).toBe(false);
      expect(el.classList.contains('platform-mac')).toBe(false);
    }
  });

  it('reflects platform-ios on <html> + <body> when the host reports iOS, and all three tabs stay', () => {
    render(<App messages={messagesEn} />);
    nativeShow('ios');
    // <html> carries it too so styles.css can anchor 1rem to iOS Dynamic Type
    // (`html.platform-ios { font: -apple-system-body }`).
    for (const el of [document.documentElement, document.body]) {
      expect(el.classList.contains('platform-ios')).toBe(true);
      expect(el.classList.contains('platform-mac')).toBe(false);
    }
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('reflects platform-mac on <html> + <body> when the host reports macOS', () => {
    render(<App messages={messagesEn} />);
    nativeShow('mac', false, true);
    for (const el of [document.documentElement, document.body]) {
      expect(el.classList.contains('platform-mac')).toBe(true);
      expect(el.classList.contains('platform-ios')).toBe(false);
    }
  });

  it('swaps the <html> + <body> class when a later show() changes platform', () => {
    render(<App messages={messagesEn} />);
    nativeShow('ios');
    nativeShow('mac', true, true);
    for (const el of [document.documentElement, document.body]) {
      expect(el.classList.contains('platform-mac')).toBe(true);
      expect(el.classList.contains('platform-ios')).toBe(false);
    }
  });
});

describe('App — tab content (Phase C)', () => {
  it('renders each tab’s real content (detector card / about trust row)', () => {
    render(<App messages={messagesEn} />);
    // Detector is active by default — its card title is present.
    expect(screen.getByText(messagesEn.detector.title)).toBeTruthy();
    // About shows the trust row even before the host reports a platform.
    fireEvent.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getByText(messagesEn.trust.privacy)).toBeTruthy();
  });
});
