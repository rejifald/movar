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
 * The Settings tab's section copy is NOT here: it comes straight from
 * `@movar/i18n` (`useI18n().t.options.*`, `contentToggle.*`, `concealMode.*`)
 * so the host and the extension can never drift. The two host-only Settings
 * strings — the "Movar enabled" master-switch label + help — live here under
 * `settings.*` (they have no extension equivalent: the master switch is host
 * chrome). The Detector tab's strings (card copy + verdicts) are host-only too
 * and live under `detector.*`.
 *
 * This English catalogue is the canonical shape — the Ukrainian one
 * (`messages-uk.ts`) is typed against `HostMessages` so a missing key fails the
 * build. Strings mirror, 1:1, the copy that previously shipped in the native
 * `Base.lproj/Main.html`, so the migration is a pure re-platforming.
 */
/** The classifier rungs, as `SnippetVerdict.rung` reports them (coerced to
 *  strings): rung 1 distinctive letters → 2a function words → 2b frequent words
 *  → 3 franc letter-patterns. Keys the `matched` / `clueLabels` maps. */
export type RungKey = '1' | '2a' | '2b' | '3';

export interface HostMessages {
  /** Bottom tab-bar labels. Host-only — no equivalent in `@movar/i18n`. */
  tabs: {
    detector: string;
    settings: string;
    about: string;
  };

  /** Detector tab — host-only on-device Cyrillic-language checker copy. Mirrors
   *  the native `Script.js`/`Main.html` detector 1:1: the section heading/intro,
   *  the textarea placeholder + Detect label, the three verdict strings
   *  (`notDetected` / `ambiguous` / `unavailable`), the evidence-report labels
   *  (`evidence` eyebrow, `nativeName`, `matchedBy`, the rung-keyed `matched`
   *  layer names + `clueLabels` row labels, the `closestMatch` franc verdict),
   *  and the "How it works" + "Limitations" explainers. The detected-language
   *  *name* itself comes from `makeLanguageDisplay` (the shared endonym
   *  resolver), not from here. */
  detector: {
    title: string;
    intro: string;
    placeholder: string;
    detect: string;
    /** No Cyrillic language found and no evidence for any candidate. */
    notDetected: string;
    /** Evidence exists but no candidate cleared the lead. */
    ambiguous: string;
    /** The detector itself failed to run. */
    unavailable: string;
    /** "Evidence" eyebrow over the per-language clue report. */
    evidence: string;
    /** The franc (letter-patterns) clue value — a verdict, not a token. */
    closestMatch: string;
    /** Label for the detected language's own-language name. */
    nativeName: string;
    /** "Matched by" prefix for the deciding-rung line. */
    matchedBy: string;
    /** Rung → layer name, used in "Matched by <layer>". */
    matched: Record<RungKey, string>;
    /** Rung → nominative clue-row label in the evidence report. */
    clueLabels: Record<RungKey, string>;
    /** "How it works" explainer — the rung ladder in plain language. */
    howItWorks: {
      title: string;
      intro: string;
      layer1Title: string;
      /** Lead-in before the distinctive-letter samples (`і ї є ґ` … rendered
       *  inline, locale-independent, by the component). */
      layer1Lead: string;
      layer2Title: string;
      layer2Detail: string;
      layer3Title: string;
      layer3Detail: string;
      foot: string;
    };
    /** "Limitations" — what the detector is and isn't. */
    limitations: {
      title: string;
      items: readonly string[];
    };
  };

  /** Settings tab — the two host-only strings the shared `@movar/i18n`
   *  catalogue does not carry: the "Movar enabled" master switch's label and
   *  helper. Everything else on the Settings tab reads from `@movar/i18n`. */
  settings: {
    enabledLabel: string;
    enabledHelp: string;
  };

  /** Brand subtitle under the "Movar" lockup. */
  brandSubtitle: string;

  /** Chip labels for the Safari → Settings → Extensions path. `settings` is
   *  the modern wording; `settingsLegacy` the pre-macOS-13 "Preferences".
   *  `apps` is the iOS-18 "Apps" grouping (Settings ▸ Apps ▸ Safari), shown
   *  only on iOS 18+; `movar` is the extension's own row at the end of the iOS
   *  path (Settings ▸ … ▸ Extensions ▸ Movar). */
  chips: {
    settingsApp: string;
    apps: string;
    safari: string;
    settings: string;
    settingsLegacy: string;
    extensions: string;
    movar: string;
  };

  /** Visually-hidden connector spoken between chips ("Safari then Settings…"). */
  pathThen: string;

  /** iOS: enable Movar from the system Settings app. `helper` leads into the
   *  Settings ▸ … ▸ Movar chip path; `action` is the follow-up once you reach
   *  Movar's row — turn it on and (encouraged, not required) allow it in Private
   *  Browsing, reassured by the open-source + nothing-leaves-your-browser
   *  guarantees so the private-tab ask doesn't read as a privacy risk. */
  ios: {
    headline: string;
    helper: string;
    action: string;
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

  /** "Send feedback" — the label of the feedback link in the About tab's footer
   *  (all platforms). Posts `'feedback'` to the native bridge. Mirrors the
   *  extension's `feedback` string. */
  feedback: string;

  /** About tab — the tagline + product summary, the "What Movar does"
   *  capability list, and the footer's "Source code" link label. The enablement
   *  + trust copy live in their own keys above. */
  about: {
    /** The tagline at the top of the About tab (gracious-bassi's `.lede`). */
    lede: string;
    /** The product summary under the tagline. */
    summary: string;
    /** "What Movar does" section heading. */
    whatTitle: string;
    /** The three capability rows (globe / switch / eye-off). */
    features: readonly { title: string; desc: string }[];
    /** Footer "Source code" link label (opens the public repo via the bridge). */
    sourceCode: string;
  };
}

export const messagesEn: HostMessages = {
  tabs: {
    detector: 'Detector',
    settings: 'Settings',
    about: 'About',
  },
  detector: {
    title: 'Language detector',
    intro:
      'Paste any text — Movar detects the language on your device, with nothing sent anywhere.',
    placeholder: 'Paste text here…',
    detect: 'Detect',
    notDetected: 'No Cyrillic language detected',
    ambiguous: 'Mixed signals — no clear language',
    unavailable: 'Language detection is unavailable.',
    evidence: 'Evidence',
    closestMatch: 'closest match',
    nativeName: 'Native name',
    matchedBy: 'Matched by',
    matched: {
      '1': 'distinctive letters',
      '2a': 'function words',
      '2b': 'common words',
      '3': 'letter patterns',
    },
    clueLabels: {
      '1': 'Distinctive letters',
      '2a': 'Function words',
      '2b': 'Common words',
      '3': 'Letter patterns',
    },
    howItWorks: {
      title: 'How it works',
      intro:
        'Movar identifies the language on your device, working through layers until one is confident — the result shows which one decided.',
      layer1Title: 'Distinctive letters',
      layer1Lead: 'Letters one language has and the others don’t —',
      layer2Title: 'Function & frequent words',
      layer2Detail:
        'The short, ultra-common words each language leans on, then its frequent vocabulary.',
      layer3Title: 'Letter patterns',
      layer3Detail:
        'The combinations of letters each language tends to use, for the hardest snippets.',
      foot: 'Latin and other scripts read as undetected. Nothing is sent anywhere.',
    },
    limitations: {
      title: 'Limitations',
      items: [
        'It isn’t AI — a fixed set of checks, not a model that “understands” text.',
        'No server and no full dictionary — it doesn’t look words up, and nothing is sent anywhere.',
        'It weighs only the evidence in the text: distinctive letters, common words, and letter patterns.',
        'Short, mixed, or romanized text can come back undetected.',
      ],
    },
  },
  settings: {
    enabledLabel: 'Movar enabled',
    enabledHelp: 'Master switch for all language steering.',
  },
  brandSubtitle: 'Keep the internet in your language.',
  chips: {
    settingsApp: 'Settings',
    apps: 'Apps',
    safari: 'Safari',
    settings: 'Settings',
    settingsLegacy: 'Preferences',
    extensions: 'Extensions',
    movar: 'Movar',
  },
  pathThen: ' then ',
  ios: {
    headline: 'One last step',
    helper: 'Open Movar in the Settings app:',
    action:
      'Turn it on, and allow it in Private Browsing too — Movar is open source and nothing leaves your browser, so your private tabs stay private.',
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
  feedback: 'Send feedback',
  about: {
    lede: 'Keep the internet in your language.',
    summary:
      'Movar defaults sites to Ukrainian, switches multilingual pages away from Russian, and can strip unwanted languages from on-page content — automatically.',
    whatTitle: 'What Movar does',
    features: [
      {
        title: 'Defaults sites to your language',
        desc: 'Requests Ukrainian first, English as fallback.',
      },
      {
        title: 'Switches away from Russian',
        desc: 'When a multilingual page serves a blocked language, Movar steers it to your preferred one.',
      },
      {
        title: 'Filters content — optional',
        desc: 'Hide blocked-language entries in language pickers and feeds. Off by default.',
      },
    ],
    sourceCode: 'Source code',
  },
};
