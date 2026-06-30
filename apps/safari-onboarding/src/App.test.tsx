import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import type { OnboardingState } from './bridge';
import { messagesEn } from './i18n/messages-en';
import { messagesUk } from './i18n/messages-uk';

/** Render the screen to static HTML for a given locale + bridge state. Good
 *  enough to assert the state→copy mapping and i18n without a DOM testing lib;
 *  click behaviour lives in `bridge.test.ts` (openSafariPreferences). */
function render(messages: typeof messagesEn, state: OnboardingState | null): string {
  return renderToStaticMarkup(<App messages={messages} state={state} />);
}

describe('App — pre-state (before the host calls show())', () => {
  it('renders brand + trust chrome but no status block', () => {
    const html = render(messagesEn, null);
    expect(html).toContain(messagesEn.brandSubtitle);
    expect(html).toContain(messagesEn.trust.free);
    expect(html).toContain(messagesEn.trust.openSource);
    expect(html).toContain(messagesEn.trust.privacy);
    // The feedback link lives in the (locale-independent) trust footer, so
    // it's present even before the host reports a platform.
    expect(html).toContain(messagesEn.feedback);
    // No status headline and no macOS CTA until a platform is known.
    expect(html).not.toContain(messagesEn.ios.headline);
    expect(html).not.toContain(messagesEn.openPreferences.label);
  });
});

describe('App — feedback link', () => {
  // The click handler (posting 'feedback' to the native bridge) is covered in
  // bridge.test.ts; here we assert the feedback control renders, in every
  // platform state and both locales, since it lives in the always-present trust
  // footer. It's now a subtle text link rather than a @movar/ui Button, but
  // stays a real, activatable <button> with its label as the accessible name.
  it.each([
    ['pre-state', null],
    ['iOS', { platform: 'ios', enabled: undefined, useSettings: undefined }],
    ['macOS setup', { platform: 'mac', enabled: false, useSettings: true }],
    ['macOS on', { platform: 'mac', enabled: true, useSettings: true }],
  ] as const)('renders the feedback link in the %s state', (_label, state) => {
    const html = render(messagesEn, state);
    expect(html).toContain(messagesEn.feedback); // "Send feedback"
  });

  it('keeps the feedback control a real <button> with subtle link styling (not a heavy CTA)', () => {
    const html = render(messagesEn, { platform: 'mac', enabled: false, useSettings: true });
    // Isolate the feedback control's own <button>…</button> markup so the
    // styling assertions can't be satisfied (or broken) by unrelated elements
    // like the Chip path, which also uses surface tokens.
    const buttonPattern = new RegExp(
      String.raw`<button\b[^>]*>(?:(?!</button>).)*${messagesEn.feedback}(?:(?!</button>).)*</button>`,
      's',
    );
    const match = buttonPattern.exec(html);
    // It stays a native <button> carrying the feedback label as its accessible
    // name — keyboard/AT activatable, unchanged mechanism.
    expect(match).not.toBeNull();
    const feedbackButton = match![0];
    // The muted ink tone + hover are what make it read as a quiet, tertiary
    // link rather than competing with the macOS "Open Safari Settings" primary
    // CTA. We don't lock every utility class (those are free to evolve), only
    // the faint base tone and the hover lift.
    expect(feedbackButton).toContain('text-ink-faint');
    expect(feedbackButton).toContain('hover:text-ink-strong');
    // And it must NOT carry the secondary @movar/ui Button surface fill it used
    // to render with — the whole point of making it a subtle link.
    expect(feedbackButton).not.toContain('bg-surface-2');
  });

  it('renders the Ukrainian feedback label from the uk catalogue', () => {
    const html = render(messagesUk, {
      platform: 'ios',
      enabled: undefined,
      useSettings: undefined,
    });
    expect(html).toContain(messagesUk.feedback); // "Надіслати відгук"
  });
});

describe('App — iOS', () => {
  it('shows the Settings-app setup copy and no CTA button', () => {
    const html = render(messagesEn, {
      platform: 'ios',
      enabled: undefined,
      useSettings: undefined,
    });
    expect(html).toContain(messagesEn.ios.headline);
    expect(html).toContain(messagesEn.ios.helper);
    expect(html).toContain(messagesEn.chips.settingsApp);
    // iOS has no "Open Safari Settings" button (the macOS-only CTA).
    expect(html).not.toContain(messagesEn.openPreferences.label);
  });
});

describe('App — macOS setup (not yet enabled)', () => {
  it('shows setup copy + the CTA, modern "Settings" wording', () => {
    const html = render(messagesEn, { platform: 'mac', enabled: false, useSettings: true });
    expect(html).toContain(messagesEn.macSetup.headline);
    expect(html).toContain(messagesEn.macSetup.helper);
    expect(html).toContain(messagesEn.openPreferences.label);
    expect(html).not.toContain(messagesEn.macOn.helper);
  });

  it('uses the legacy "Preferences" wording when useSettings is false (macOS ≤ 12)', () => {
    const html = render(messagesEn, { platform: 'mac', enabled: false, useSettings: false });
    expect(html).toContain(messagesEn.openPreferences.legacy);
    expect(html).toContain(messagesEn.chips.settingsLegacy);
    expect(html).not.toContain(messagesEn.openPreferences.label);
  });
});

describe('App — macOS enabled', () => {
  it('shows the "Movar is on" state and still offers the manage CTA', () => {
    const html = render(messagesEn, { platform: 'mac', enabled: true, useSettings: true });
    expect(html).toContain(messagesEn.macOn.headline);
    expect(html).toContain(messagesEn.macOn.helper);
    expect(html).toContain(messagesEn.openPreferences.label);
    expect(html).not.toContain(messagesEn.macSetup.helper);
  });
});

describe('App — localization', () => {
  it('renders Ukrainian copy from the uk catalogue', () => {
    const html = render(messagesUk, { platform: 'mac', enabled: true, useSettings: true });
    expect(html).toContain(messagesUk.macOn.headline); // "Movar увімкнено"
    expect(html).toContain(messagesUk.trust.privacy); // "Нічого не покидає браузер"
    expect(html).toContain(messagesUk.openPreferences.label);
  });
});
