import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

beforeEach(() => {
  resetBridgeForTest();
  document.body.className = '';
});

afterEach(() => {
  cleanup();
  document.body.className = '';
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
    // one. Exactly one panel must be exposed, and it's the Detector.
    expect(
      screen.getAllByRole('tabpanel', { hidden: true }).filter((p) => p.hidden === false),
    ).toHaveLength(1);
    expect(within(screen.getByRole('tabpanel')).getByText('Detector')).toBeTruthy();
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
    expect(within(screen.getByRole('tabpanel')).getByText('About')).toBeTruthy();
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

describe('App — platform gating', () => {
  it('adds no platform class to <body> before the host calls show()', () => {
    render(<App messages={messagesEn} />);
    expect(document.body.classList.contains('platform-ios')).toBe(false);
    expect(document.body.classList.contains('platform-mac')).toBe(false);
  });

  it('reflects platform-ios on <body> when the host reports iOS, and all three tabs stay', () => {
    render(<App messages={messagesEn} />);
    nativeShow('ios');
    expect(document.body.classList.contains('platform-ios')).toBe(true);
    expect(document.body.classList.contains('platform-mac')).toBe(false);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('reflects platform-mac on <body> when the host reports macOS', () => {
    render(<App messages={messagesEn} />);
    nativeShow('mac', false, true);
    expect(document.body.classList.contains('platform-mac')).toBe(true);
    expect(document.body.classList.contains('platform-ios')).toBe(false);
  });

  it('swaps the body class when a later show() changes platform', () => {
    render(<App messages={messagesEn} />);
    nativeShow('ios');
    nativeShow('mac', true, true);
    expect(document.body.classList.contains('platform-mac')).toBe(true);
    expect(document.body.classList.contains('platform-ios')).toBe(false);
  });
});

describe('App — tab content stubs (Phase C seams)', () => {
  it('renders each tab’s stubbed TODO marker', () => {
    render(<App messages={messagesEn} />);
    // Detector is active by default.
    expect(screen.getByText(/src\/tabs\/DetectorTab\.tsx/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByText(/src\/tabs\/SettingsTab\.tsx/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getByText(/src\/tabs\/AboutTab\.tsx/)).toBeTruthy();
  });
});
