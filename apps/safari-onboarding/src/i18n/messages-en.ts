/**
 * English string catalogue for the Safari wrapper app's onboarding /
 * enablement screen (rendered in the WKWebView hosted by
 * `Shared (App)/ViewController.swift`).
 *
 * This catalogue is the canonical shape — the Ukrainian one (`messages-uk.ts`)
 * is typed against `OnboardingMessages` so a missing key fails the build. The
 * strings here mirror, 1:1, the copy that previously lived in the native
 * `Base.lproj/Main.html`, so the migration is a pure re-platforming with no
 * wording drift.
 *
 * `settingsLegacy` exists because macOS 12 and earlier called the pane
 * "Safari Preferences", not "Settings". The native bridge tells us which
 * wording to use via `show('mac', enabled, useSettings)`; the React layer
 * swaps the label the same way the old `data-legacy` attribute did.
 */
export interface OnboardingMessages {
  /** Brand subtitle under the "Movar" lockup. */
  brandSubtitle: string;

  /** Chip labels for the Safari → Settings → Extensions path. `settings` is
   *  the modern wording; `settingsLegacy` the pre-macOS-13 "Preferences". */
  chips: {
    settingsApp: string;
    safari: string;
    settings: string;
    settingsLegacy: string;
    extensions: string;
  };

  /** Visually-hidden connector spoken between chips ("Safari then Settings…"). */
  pathThen: string;

  /** iOS: enable Movar from the system Settings app. */
  ios: {
    headline: string;
    helper: string;
  };

  /** macOS, fresh install or disabled — same setup instructions either way. */
  macSetup: {
    headline: string;
    helper: string;
  };

  /** macOS, extension enabled — the "all good" state. */
  macOn: {
    headline: string;
    helper: string;
  };

  /** The macOS call-to-action button. `legacy` is the pre-macOS-13 wording. */
  openPreferences: {
    label: string;
    legacy: string;
  };

  /** Feedback button label — opens the support mailto via the native bridge
   *  (the WKWebView's `default-src 'self'` CSP makes a Swift hand-off the
   *  robust path). Mirrors the extension's `feedback` string. */
  feedback: string;

  /** Trust footer — three claims, matching the marketing hero. */
  trust: {
    free: string;
    openSource: string;
    privacy: string;
  };
}

export const messagesEn: OnboardingMessages = {
  brandSubtitle: 'Keep the internet in your language.',
  chips: {
    settingsApp: 'Settings',
    safari: 'Safari',
    settings: 'Settings',
    settingsLegacy: 'Preferences',
    extensions: 'Extensions',
  },
  pathThen: ' then ',
  ios: {
    headline: 'One last step',
    helper: 'Turn on Movar in the Settings app:',
  },
  macSetup: {
    headline: 'One last step',
    helper: 'Turn on Movar in Safari:',
  },
  macOn: {
    headline: 'Movar is on',
    helper: 'Manage it any time in Safari:',
  },
  openPreferences: {
    label: 'Open Safari Settings',
    legacy: 'Open Safari Preferences',
  },
  feedback: 'Send feedback',
  trust: {
    free: 'Free',
    openSource: 'Open source',
    privacy: 'Nothing leaves your browser',
  },
};
