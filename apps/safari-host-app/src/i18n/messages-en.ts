/**
 * English string catalogue for the Safari host app's SHELL — the host-only
 * strings the shared `@movar/i18n` catalogue does not carry.
 *
 * Scope, and why it's separate from `@movar/i18n`:
 *   - The bottom tab-bar labels (Detector / Settings / About) are host chrome
 *     with no equivalent in the extension UI, so they live here.
 *   - The About tab's enablement copy (brand subtitle, the iOS/macOS setup
 *     banners, the Safari → Settings → Extensions chip path, the macOS CTA,
 *     and the trust row) previously lived in the native `Base.lproj/Main.html`
 *     and the #168 onboarding catalogue — host-specific, so it lives here too.
 *
 * The Settings tab's copy is NOT here: it comes straight from `@movar/i18n`
 * (`useI18n().t.options.*`, `contentToggle.*`, `concealMode.*`) so the host and
 * the extension can never drift. The Detector tab's verdict strings are
 * host-only and will be added under `detector.*` when Phase C implements it.
 *
 * This English catalogue is the canonical shape — the Ukrainian one
 * (`messages-uk.ts`) is typed against `HostMessages` so a missing key fails the
 * build. Strings mirror, 1:1, the copy that previously shipped in the native
 * `Base.lproj/Main.html`, so the migration is a pure re-platforming.
 */
export interface HostMessages {
  /** Bottom tab-bar labels. Host-only — no equivalent in `@movar/i18n`. */
  tabs: {
    detector: string;
    settings: string;
    about: string;
  };

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

  /** Trust footer — three claims, matching the marketing hero. */
  trust: {
    free: string;
    openSource: string;
    privacy: string;
  };
}

export const messagesEn: HostMessages = {
  tabs: {
    detector: 'Detector',
    settings: 'Settings',
    about: 'About',
  },
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
  trust: {
    free: 'Free',
    openSource: 'Open source',
    privacy: 'Nothing leaves your browser',
  },
};
