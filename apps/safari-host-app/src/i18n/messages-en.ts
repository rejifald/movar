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
    audit: string;
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

  /** Audit tab — Movar Audit's app surface (`docs/movar-audit.md`).
   *
   *  Wording rules this copy is bound by, because the report is a document that
   *  names companies: the headline is a count of BROKEN PROMISES, never a
   *  score; `not-collected` is stated, never rolled into a pass; and the
   *  jurisdiction pack is described as a choice the operator makes, not as
   *  something the tool asserts on its own. */
  audit: {
    title: string;
    intro: string;
    placeholder: string;
    run: string;
    running: string;
    /** Shown while the matrix is in flight — it is several real requests. */
    runningNote: string;
    /** The `ua` jurisdiction-pack opt-in and its one-line "why off by default". */
    uaPack: string;
    uaPackHint: string;
    /** The URL box held nothing probe-able. */
    invalidUrl: string;
    /** The run threw — a fact about the audit, not about the site. */
    failed: string;
    /** No native bridge: running outside the app (dev server, preview, tests). */
    noBridge: string;
    /** The headline. A COUNT, never a grade. */
    brokenPromises: (count: number) => string;
    noBrokenPromises: string;
    /** "N of M rules ran · K not collected". */
    coverage: (ran: number, rules: number, notCollected: number) => string;
    /** Why part of the catalogue could not run at this tier. */
    notCollectedNote: string;
    /** Back control on the report screen. */
    back: string;
    /** Re-check this report's target. */
    again: string;
    /** Save/share the self-contained report file. */
    export: string;
    /** Exporting needs the real app — there is no file system in a browser. */
    exportUnavailable: string;
    /** Heading over the list of checks already run this session. */
    previous: string;
    /**
     * The one thing a reader must know about that list: it is not saved.
     *
     * Written as a plain fact plus the way out, not a scare. Mobbin turned up
     * no precedent for "your data will vanish" copy — every comparable app
     * frames local-only storage as reassuring permanence — so this is original
     * wording and deliberately unalarming.
     */
    notStored: string;
    /** Per-finding disclosure holding the reference material. */
    detail: string;
    detailRule: string;
    /** The kernel's own sentence, shown verbatim. */
    detailFinding: string;
    detailBasis: string;
    detailDenominator: string;
    /** "3 of 340 passages" — a denominator, never a bare count. */
    denominator: (matched: number, examined: number) => string;
    /** Eyebrow over the finding list. */
    findings: string;
    /** Eyebrow over the unscored group, and why it is separate. */
    observations: string;
    observationsNote: string;
    /** Rules ran and found nothing to report. */
    nothingToReport: string;
    /** Heading over the full per-rule list. */
    allRules: string;
    /** The filter pill that clears the others. */
    filterAll: string;
    /** Where a finding's language determination came from. */
    grounding: Record<'declared' | 'observed' | 'classified', string>;
    /** One word per rule verdict, for the coverage list. */
    verdicts: Record<'pass' | 'fail' | 'warn' | 'not-applicable' | 'not-collected', string>;
    /** How many findings a rule produced — shown instead of its verdict word. */
    findingCount: (count: number) => string;
    /** The kernel stripped a finding's failing power — said out loud. */
    downgraded: string;
    /** The network-posture promises this tab keeps. */
    privacy: {
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
    /** Accessible name / tooltip for the footer's version stamp, which opens
     *  this build's entry on the public changelog. Takes the stamp exactly as
     *  rendered (`v1.6.2`) and must START with it: the visible text is the whole
     *  label, so WCAG 2.5.3 (label in name) requires the accessible name to
     *  contain it. Same contract and wording as `@movar/i18n`'s `versionLink`,
     *  which labels the extension popup/options stamps. */
    versionLink: (stamp: string) => string;
  };
}

export const messagesEn: HostMessages = {
  tabs: {
    detector: 'Detector',
    audit: 'Audit',
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
      layer1Lead: "Letters one language has and the others don't —",
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
        'It isn\'t AI — a fixed set of checks, not a model that "understands" text.',
        "No server and no full dictionary — it doesn't look words up, and nothing is sent anywhere.",
        'It weighs only the evidence in the text: distinctive letters, common words, and letter patterns.',
        'Short, mixed, or romanized text can come back undetected.',
      ],
    },
  },
  audit: {
    title: 'Audit a site',
    intro:
      'Check how a site handles language: what it declares, what it actually serves, and whether its language switcher works.',
    placeholder: 'example.com',
    run: 'Run audit',
    running: 'Auditing…',
    runningNote: 'Requesting the page a few times, once per language preference…',
    uaPack: 'Also check Ukrainian law',
    uaPackHint:
      'Law 2704-VIII, Art. 27 §6. Off by default — it applies to sites serving Ukraine, and only you know if this is one.',
    invalidUrl: "That doesn't look like a web address.",
    failed: 'The audit could not finish. Nothing was reported about this site.',
    noBridge: 'Auditing only works inside the Movar app.',
    brokenPromises: (count) =>
      count === 1 ? '1 broken promise' : `${String(count)} broken promises`,
    noBrokenPromises: 'No broken promises found',
    coverage: (ran, rules, notCollected) =>
      notCollected > 0
        ? `${String(ran)} of ${String(rules)} checks ran · ${String(notCollected)} needed evidence this run didn't collect`
        : `${String(ran)} of ${String(rules)} checks ran`,
    notCollectedNote:
      "Checks that needed evidence this run didn't collect are marked as such — they are never counted as passing.",
    back: 'Checks',
    again: 'Audit again',
    export: 'Export',
    exportUnavailable: 'Exporting a report only works inside the Movar app.',
    previous: 'Previous checks',
    notStored:
      'These stay for this session only — closing or reinstalling the app clears them. Export a report to keep it.',
    detail: 'Details',
    detailRule: 'Check',
    detailFinding: 'Reported as',
    detailBasis: 'Based on',
    detailDenominator: 'Out of',
    denominator: (matched, examined) => `${String(matched)} of ${String(examined)} passages`,
    findings: 'Findings',
    observations: 'Observations',
    observationsNote:
      'Noted, but not counted as broken promises — these rest on automatic language detection or are context a reader may want, not on something the site declared.',
    nothingToReport: 'Every check that ran found nothing to report.',
    allRules: 'All checks',
    filterAll: 'All',
    findingCount: (count) => (count === 1 ? '1 finding' : `${String(count)} findings`),
    verdicts: {
      pass: 'passed',
      fail: 'failed',
      warn: 'warning',
      'not-applicable': 'not applicable',
      // Deliberately not "skipped": the audit did not decline to check this, it
      // lacked the evidence to. Wording it as a choice would let a reader file
      // it away as unimportant.
      'not-collected': 'not checked',
    },
    grounding: {
      declared: 'Based on what the site declares',
      observed: 'Based on what the site actually served',
      classified: 'Based on automatic language detection — read as a hint, not a verdict',
    },
    downgraded: 'not counted as a broken promise',
    privacy: {
      title: 'How this works',
      items: [
        'Requests go only to the site you name, from this device. There is no Movar server.',
        'Movar identifies itself in every request and never pretends to be a browser.',
        'Each audit runs with no cookies and a fixed request budget.',
        'A site behind a bot challenge is reported as unaudited, never judged on the challenge page.',
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
    versionLink: (stamp) => `${stamp} — what's new`,
  },
};
