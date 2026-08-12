import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the bridge actions so the About tab's link/CTA wiring is asserted without
// a real WKWebView. The tab imports every footer/CTA action it fires:
// openFeedback + openSourceCode + openChangelog (the footer links) and
// openSafariPreferences (the macOS CTA).
const openFeedback = vi.fn<() => void>();
const openSafariPreferences = vi.fn<() => void>();
const openSourceCode = vi.fn<() => void>();
const openChangelog = vi.fn<(locale: string, version: string) => void>();
vi.mock('../bridge', () => ({
  openFeedback: (): void => {
    openFeedback();
  },
  openSafariPreferences: (): void => {
    openSafariPreferences();
  },
  openSourceCode: (): void => {
    openSourceCode();
  },
  openChangelog: (locale: string, version: string): void => {
    openChangelog(locale, version);
  },
}));

import { AboutTab } from './AboutTab';
import type { HostState } from '../bridge';
import { messagesEn } from '../i18n/messages-en';
import { messagesUk } from '../i18n/messages-uk';
import { APP_VERSION } from '../version';

afterEach(() => {
  cleanup();
  openFeedback.mockReset();
  openSafariPreferences.mockReset();
  openSourceCode.mockReset();
  openChangelog.mockReset();
});

// iOS 18+ (the "Apps" section exists) vs iOS ≤17 (Safari at the Settings root).
const ios: HostState = {
  platform: 'ios',
  enabled: undefined,
  useSettings: undefined,
  iosMajor: 18,
};
const iosLegacy: HostState = {
  platform: 'ios',
  enabled: undefined,
  useSettings: undefined,
  iosMajor: 17,
};
const macSetup: HostState = {
  platform: 'mac',
  enabled: false,
  useSettings: true,
  iosMajor: undefined,
};
const macOn: HostState = { platform: 'mac', enabled: true, useSettings: true, iosMajor: undefined };
const macLegacy: HostState = {
  platform: 'mac',
  enabled: false,
  useSettings: false,
  iosMajor: undefined,
};

describe('AboutTab — static content (independent of host state)', () => {
  it('renders the lede, product summary, and the "What Movar does" features', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={null} />);
    expect(screen.getByText(messagesEn.about.lede)).toBeTruthy();
    expect(screen.getByText(messagesEn.about.summary)).toBeTruthy();
    expect(screen.getByRole('heading', { name: messagesEn.about.whatTitle })).toBeTruthy();
    for (const feature of messagesEn.about.features) {
      expect(screen.getByText(feature.title)).toBeTruthy();
      expect(screen.getByText(feature.desc)).toBeTruthy();
    }
  });

  it('renders the three trust claims', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={null} />);
    expect(screen.getByText(messagesEn.trust.free)).toBeTruthy();
    expect(screen.getByText(messagesEn.trust.openSource)).toBeTruthy();
    expect(screen.getByText(messagesEn.trust.privacy)).toBeTruthy();
  });

  it('stamps the app version (`v<version>`) in the footer', () => {
    // `APP_VERSION` is the build-injected extension version in the bundle and the
    // `dev` fallback here (vitest applies no `define`); assert against the symbol
    // so a version bump never breaks the test.
    render(<AboutTab messages={messagesEn} locale="en" state={null} />);
    expect(screen.getByText(`v${APP_VERSION}`)).toBeTruthy();
  });

  it('makes the version stamp a changelog button, labelled so the visible `v…` is spoken', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={null} />);
    // WCAG 2.5.3 — the accessible name has to contain the visible text, so the
    // label composes the copy with the same `v<version>` string on screen.
    const button = screen.getByRole('button', {
      name: messagesEn.about.versionLink(`v${APP_VERSION}`),
    });
    expect(button.textContent).toBe(`v${APP_VERSION}`);
    // Skinned by `.version` but reset/focus-ringed by `.link`, like its siblings.
    expect(button.className).toBe('link version');
    button.click();
    expect(openChangelog).toHaveBeenCalledWith('en', APP_VERSION);
  });

  it('passes the rendered locale through, so the link opens the matching-language page', () => {
    render(<AboutTab messages={messagesUk} locale="uk" state={null} />);
    screen.getByRole('button', { name: messagesUk.about.versionLink(`v${APP_VERSION}`) }).click();
    expect(openChangelog).toHaveBeenCalledWith('uk', APP_VERSION);
  });

  it('renders the feedback + source-code footer links on every platform, wired to the bridge', () => {
    for (const state of [null, ios, macSetup, macOn]) {
      const view = render(<AboutTab messages={messagesEn} locale="en" state={state} />);
      screen.getByRole('button', { name: messagesEn.feedback }).click();
      screen.getByRole('button', { name: messagesEn.about.sourceCode }).click();
      view.unmount();
    }
    expect(openFeedback).toHaveBeenCalledTimes(4);
    expect(openSourceCode).toHaveBeenCalledTimes(4);
  });
});

describe('AboutTab — enablement banner (host-state driven)', () => {
  it('renders no banner card before the host reports (state === null)', () => {
    const { container } = render(<AboutTab messages={messagesEn} locale="en" state={null} />);
    // StatusBanner renders nothing pre-`show()`, so there is no `.status` card
    // and no "Open Safari Settings" CTA — only the static content above.
    expect(container.querySelector('.status')).toBeNull();
    expect(screen.queryByRole('button', { name: messagesEn.openPreferences.label })).toBeNull();
  });

  it('iOS 18+ — Settings→Apps→Safari→Extensions→Movar chips + Private-Browsing action, no CTA', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={ios} />);
    expect(screen.getByRole('heading', { name: messagesEn.ios.headline })).toBeTruthy();
    expect(screen.getByText(messagesEn.ios.helper)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.settingsApp)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.apps)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.safari)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.extensions)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.movar)).toBeTruthy();
    // The follow-up action (turn it on, allow in Private Browsing).
    expect(screen.getByText(messagesEn.ios.action)).toBeTruthy();
    // iOS has no "Open Safari Settings" CTA (the host can't deep-link there).
    expect(screen.queryByRole('button', { name: messagesEn.openPreferences.label })).toBeNull();
  });

  it('iOS ≤17 — drops the "Apps" hop but keeps the Movar chip + the action', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={iosLegacy} />);
    expect(screen.getByText(messagesEn.chips.settingsApp)).toBeTruthy();
    // Pre-iOS-18 Settings has no "Apps" grouping — Safari sits at the root.
    expect(screen.queryByText(messagesEn.chips.apps)).toBeNull();
    expect(screen.getByText(messagesEn.chips.safari)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.extensions)).toBeTruthy();
    expect(screen.getByText(messagesEn.chips.movar)).toBeTruthy();
    expect(screen.getByText(messagesEn.ios.action)).toBeTruthy();
  });

  it('macOS setup — renders the banner + the "Open Safari Settings" CTA wired to the bridge', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={macSetup} />);
    expect(screen.getByRole('heading', { name: messagesEn.macSetup.headline })).toBeTruthy();
    expect(screen.getByText(messagesEn.macSetup.helper)).toBeTruthy();
    screen.getByRole('button', { name: messagesEn.openPreferences.label }).click();
    expect(openSafariPreferences).toHaveBeenCalledTimes(1);
  });

  it('macOS on — renders the "Movar is on" banner with a status dot + the CTA', () => {
    const { container } = render(<AboutTab messages={messagesEn} locale="en" state={macOn} />);
    const headline = screen.getByRole('heading', { name: messagesEn.macOn.headline });
    // The green "on" status dot is rendered inside the headline.
    expect(headline.querySelector('.dot')).toBeTruthy();
    expect(container.querySelector('.headline .dot')).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.openPreferences.label })).toBeTruthy();
  });

  it('macOS ≤ 12 — swaps the CTA + chip to the "Preferences" wording', () => {
    render(<AboutTab messages={messagesEn} locale="en" state={macLegacy} />);
    expect(screen.getByRole('button', { name: messagesEn.openPreferences.legacy })).toBeTruthy();
    expect(screen.queryByRole('button', { name: messagesEn.openPreferences.label })).toBeNull();
    expect(screen.getByText(messagesEn.chips.settingsLegacy)).toBeTruthy();
  });
});
