import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the bridge actions so the About tab's CTA / feedback wiring is asserted
// without a real WKWebView. The tab imports `openFeedback` + `openSafariPreferences`.
const openFeedback = vi.fn<() => void>();
const openSafariPreferences = vi.fn<() => void>();
vi.mock('../bridge', () => ({
  openFeedback: (): void => {
    openFeedback();
  },
  openSafariPreferences: (): void => {
    openSafariPreferences();
  },
}));

import { AboutTab } from './AboutTab';
import type { HostState } from '../bridge';
import { messagesEn } from '../i18n/messages-en';

afterEach(() => {
  cleanup();
  openFeedback.mockReset();
  openSafariPreferences.mockReset();
});

const ios: HostState = { platform: 'ios', enabled: undefined, useSettings: undefined };
const macSetup: HostState = { platform: 'mac', enabled: false, useSettings: true };
const macOn: HostState = { platform: 'mac', enabled: true, useSettings: true };
const macLegacy: HostState = { platform: 'mac', enabled: false, useSettings: false };

describe('AboutTab — the trust row (always present)', () => {
  it('renders the three trust claims regardless of state', () => {
    render(<AboutTab messages={messagesEn} state={null} />);
    expect(screen.getByText(messagesEn.trust.free)).toBeTruthy();
    expect(screen.getByText(messagesEn.trust.openSource)).toBeTruthy();
    expect(screen.getByText(messagesEn.trust.privacy)).toBeTruthy();
  });

  it('has NO brand lockup (per the spec — that was #168 only)', () => {
    render(<AboutTab messages={messagesEn} state={macOn} />);
    // The standalone onboarding screen's "Movar" <h1> + subtitle are dropped.
    expect(screen.queryByText(messagesEn.brandSubtitle)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Movar' })).toBeNull();
  });
});

describe('AboutTab — pre-show() window (state === null)', () => {
  it('shows only the trust row — no enablement banner, no CTA, no feedback', () => {
    render(<AboutTab messages={messagesEn} state={null} />);
    // No headline (the banner is hidden until the host reports a platform).
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('AboutTab — iOS', () => {
  it('renders the iOS setup banner + the Settings→Safari→Extensions chips', () => {
    render(<AboutTab messages={messagesEn} state={ios} />);
    expect(screen.getByRole('heading', { name: messagesEn.ios.headline })).toBeTruthy();
    expect(screen.getByText(messagesEn.ios.helper)).toBeTruthy();
    // The chip path lists the three steps.
    expect(screen.getByText(messagesEn.chips.settingsApp)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.safari)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.extensions)).toBeTruthy();
  });

  it('renders the feedback BUTTON (iOS only) and wires it to openFeedback', () => {
    render(<AboutTab messages={messagesEn} state={ios} />);
    const feedback = screen.getByRole('button', { name: messagesEn.feedback });
    feedback.click();
    expect(openFeedback).toHaveBeenCalledTimes(1);
  });

  it('shows NO macOS "Open Safari Settings" CTA on iOS', () => {
    render(<AboutTab messages={messagesEn} state={ios} />);
    expect(screen.queryByRole('button', { name: messagesEn.openPreferences.label })).toBeNull();
    expect(screen.queryByRole('button', { name: messagesEn.openPreferences.legacy })).toBeNull();
  });
});

describe('AboutTab — macOS, not enabled (setup)', () => {
  it('renders the setup banner + the "Open Safari Settings" CTA', () => {
    render(<AboutTab messages={messagesEn} state={macSetup} />);
    expect(screen.getByRole('heading', { name: messagesEn.macSetup.headline })).toBeTruthy();
    expect(screen.getByText(messagesEn.macSetup.helper)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.openPreferences.label })).toBeTruthy();
  });

  it('wires the CTA to openSafariPreferences', () => {
    render(<AboutTab messages={messagesEn} state={macSetup} />);
    screen.getByRole('button', { name: messagesEn.openPreferences.label }).click();
    expect(openSafariPreferences).toHaveBeenCalledTimes(1);
  });

  it('has NO feedback button on macOS', () => {
    render(<AboutTab messages={messagesEn} state={macSetup} />);
    expect(screen.queryByRole('button', { name: messagesEn.feedback })).toBeNull();
  });
});

describe('AboutTab — macOS, enabled (on)', () => {
  it('renders the "Movar is on" banner with a status dot + the CTA', () => {
    const { container } = render(<AboutTab messages={messagesEn} state={macOn} />);
    const headline = screen.getByRole('heading', { name: messagesEn.macOn.headline });
    expect(headline).toBeTruthy();
    // The green "on" status dot is rendered inside the headline.
    expect(headline.querySelector('.dot')).toBeTruthy();
    expect(container.querySelector('.headline .dot')).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.openPreferences.label })).toBeTruthy();
  });

  it('has NO feedback button on macOS (on state either)', () => {
    render(<AboutTab messages={messagesEn} state={macOn} />);
    expect(screen.queryByRole('button', { name: messagesEn.feedback })).toBeNull();
  });
});

describe('AboutTab — macOS ≤ 12 legacy wording (useSettings === false)', () => {
  it('swaps the CTA + chip to the "Preferences" wording', () => {
    render(<AboutTab messages={messagesEn} state={macLegacy} />);
    // CTA uses the legacy label.
    expect(screen.getByRole('button', { name: messagesEn.openPreferences.legacy })).toBeTruthy();
    expect(screen.queryByRole('button', { name: messagesEn.openPreferences.label })).toBeNull();
    // The Settings chip becomes "Preferences".
    expect(screen.getByText(messagesEn.chips.settingsLegacy)).toBeTruthy();
  });
});
