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

// Typed against the kernel's own union so a capability added to `@movar/audit`
// fails this catalogue's build rather than rendering as a blank why-line.
import type { Capability } from '@movar/audit';

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
    /** "Request 2 of 5" — the matrix leg a run is on. */
    progress: (done: number, total: number) => string;
    /**
     * The `ua` jurisdiction-pack opt-in and its one-line "why off by default".
     *
     * The label NAMES the pack; it does not describe an act. "Also audit
     * against Ukrainian law" made a checkbox announce a legal proceeding, which
     * is a lot to put on a control most people should leave alone — and it
     * over-promised, since the pack adds six rules rather than adjudicating a
     * statute. The hint carries the weight: which law, who it applies to, and
     * that switching it on is the operator's call.
     */
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
    /**
     * The report's colophon: which build of the audit engine reached these
     * verdicts.
     *
     * A report exists to be re-adjudicated — that is the whole claim — and
     * "run this evidence again" is unanswerable without the build that judged
     * it the first time. Takes the whole stamp as one string
     * (`movar-audit-engine 1.4.0`), the way the exported artifact renders the
     * collector and the ruleset.
     */
    engine: (build: string) => string;
    /**
     * What stands in when the report carries no engine stamp.
     *
     * It has to be a word, not a version: substituting the app's own build
     * would mint a build identity nobody shipped, inside the one field whose
     * job is to say which code to go back to.
     */
    engineUnknown: string;
    /** Back control on the report screen — names what it returns TO. */
    back: string;
    /** Audit this report's target again. */
    again: string;
    /** Save/share the self-contained report file. */
    export: string;
    /** Exporting needs the real app — there is no file system in a browser. */
    exportUnavailable: string;
    /** Heading over the list of audits already run this session. */
    previous: string;
    /**
     * Accessible name for a row's remove control. Takes the target, because the
     * list is several rows of near-identical chrome and "Remove" alone would
     * read the same on every one of them.
     */
    removeRun: (target: string) => string;
    /**
     * The removal confirmation, asked in the row itself.
     *
     * Removal IS destructive despite nothing being on disk: the run cannot be
     * restored without re-probing the site, which costs another set of real
     * requests to somebody's server. The confirmation is inline rather than a
     * dialog — the row is the thing being destroyed, so the question belongs in
     * it, and a modal for a list entry is heavier than the act.
     */
    removeConfirm: {
      question: string;
      confirm: string;
      cancel: string;
    };
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
    /**
     * Labels the rule ID a card came from (`core/serving-default-language`).
     *
     * Says "rule", because that is literally what the value under it is — the
     * kernel's permanent public identifier for one catalogue entry. Labelling
     * it "check" made a reader look for a check they had chosen to run.
     */
    detailRule: string;
    /** Names which page a sentence is about, inside a multi-page card. */
    detailPage: string;
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
    /**
     * Heading over the full per-rule list.
     *
     * Deliberately not "All rules": the first control under it is an "All"
     * filter pill, and a heading that repeats the active filter's name reads as
     * if the two are the same control. This names the CONTENT (every rule and
     * how it went); the pills name the filter. Naming the outcome as well as
     * the rules is also the more honest heading — the list includes rules that
     * never ran, which "what was checked" quietly excluded.
     */
    allRules: string;
    /** The filter pill that clears the others. */
    filterAll: string;
    /** Where a finding's language determination came from. */
    grounding: Record<'declared' | 'observed' | 'classified', string>;
    /** One word per rule verdict, for the coverage list. */
    verdicts: Record<'pass' | 'fail' | 'warn' | 'not-applicable' | 'not-collected', string>;
    /**
     * One word per FINDING verdict, for the chip a card leads with.
     *
     * Separate from {@link verdicts} because the two vocabularies are not the
     * same: a rule can be "not checked", a finding never is, and a finding can
     * be an observation, which is not a verdict a rule can hold.
     */
    findingVerdicts: Record<'fail' | 'warn' | 'observation' | 'info', string>;
    /** "on 2 pages" — only shown when a rule reported on more than one. */
    pageCount: (count: number) => string;
    /** How many findings a rule produced — shown instead of its verdict word. */
    findingCount: (count: number) => string;
    /**
     * Why a rule landed where it did — the half of the coverage list that used
     * to be computed and thrown away.
     *
     * `evaluate()` already records, per rule, exactly which evidence the
     * collector failed to produce (`missingCapabilities`) and why a rule did not
     * apply (`notApplicableReason`); the report simply never rendered either, so
     * a row could say "not checked" with no way to learn what was missing.
     */
    whyNotCollected: (missing: string) => string;
    whyNotApplicable: (reason: string) => string;
    whyPassed: string;
    /** Joins the last two items of the missing-evidence list. */
    listAnd: string;
    /** Opens the rule's finding card from its coverage row. */
    goToFindings: string;
    /**
     * What each collector capability IS, in a reader's words.
     *
     * Phrased to complete "this run did not collect …", which is the only
     * sentence they appear in — so they read as noun phrases, and in Ukrainian
     * they are in the genitive that verb takes.
     */
    capabilities: Record<Capability, string>;
    /** The kernel stripped a finding's failing power — said out loud. */
    downgraded: string;
    /**
     * The outbound-request acknowledgement, shown before the FIRST audit of a
     * session.
     *
     * Movar's whole promise elsewhere is that nothing leaves the browser, and
     * this one feature is the exception: it reaches a third-party server the
     * person named. Stating the four facts that matter — who is contacted, what
     * is not in the request, that the site's owner will see it, and that no
     * Movar server is involved — and making them press through it is the only
     * honest way to run it. Session-scoped, like the run history: asked once,
     * not on every audit, and never remembered to disk.
     */
    confirm: {
      title: string;
      /** Names the host actually about to be contacted. */
      body: (host: string) => string;
      points: readonly string[];
      /** Says the asking is once per session, so pressing it is not a habit. */
      once: string;
      cancel: string;
      proceed: string;
    };
    /**
     * The response matrix, rendered.
     *
     * The collector records every leg — its header, status, redirect chain and
     * the language that came back — and the report showed none of it. That is
     * the closest thing to "how the site behaved during this audit" that an
     * audit which never renders a page can honestly offer.
     */
    matrix: {
      title: string;
      intro: string;
      /**
       * The two column headings.
       *
       * A real `<table>` needs them, and the table needed to become real: the
       * legs used to be a list of per-row grids, so every row sized its own
       * columns and "no preference" shoved that row's language out of line with
       * the four under it — tabular data laid out as if it were not, which is
       * exactly what a broken table looks like.
       *
       * There is no third column, and the rows carry no mechanism: **no status
       * codes, no redirect chain, no path segments.** Those answer "how did it
       * get here", and the table answers "what do I get if I ask in this
       * language". A bounce or an error that MATTERS is a finding with a
       * sentence; the chain itself stays in the evidence bundle and the
       * exported artifact, where a site owner disputing a finding will look.
       * For the same reason the asked-for column is a language NAME: the column
       * beside it says "Ukrainian", and a `uk` next to it made one table speak
       * two vocabularies.
       */
      colAsked: string;
      colServed: string;
      /** The leg sent with no `Accept-Language` at all. */
      noPreference: string;
      /** The site did not answer this leg (blocked, or an error). */
      noAnswer: string;
      /**
       * The site answered, with an error page.
       *
       * Named rather than numbered, and it must exist: a 404 page declaring
       * `lang="uk"` would otherwise be reported as the site serving Ukrainian
       * to that preference — a false statement about a named company, which is
       * the one failure mode that ends this product.
       */
      errored: string;
      /** The page came back declaring no language of its own. */
      undeclared: string;
      /**
       * Opens the audited site.
       *
       * Names no browser. The bridge hands the URL to `UIApplication.open` /
       * `NSWorkspace.open`, which is the person's DEFAULT browser — so "Open in
       * Safari" was wrong for anyone who has chosen otherwise, and Movar of all
       * products should not assume what someone browses with.
       */
      openSite: string;
    };
    /**
     * What Movar Audit IS — the explainer a first-time reader needs before the
     * word "audit" means anything specific.
     *
     * The tab shipped straight into a URL box, which asked someone to point a
     * tool at a site without ever saying what the tool would then assert.
     *
     * **Written for someone auditing their OWN site**, and true for someone who
     * is not. Nothing here can establish who opened the tab, so copy that picks
     * a side is wrong on its face — an earlier draft closed on "a document you
     * can hand to the people who build it", which tells the site's own
     * developer the tool is not for them. The claim itself was always neutral;
     * only the report's DISPOSAL assumed a stranger. So the reader is addressed
     * as the person who can fix what it finds, "yours or anyone's" keeps the
     * advocate's case open, and the shareable artifact stays a clause rather
     * than the point. (`docs/movar-audit.md` §10 still sequences advocacy
     * first — that is about who gets recruited, not about who the tab talks to.)
     *
     * Three things have to land, and they are the three the exported artifact's
     * "What this proves — and what it does not" section already makes, said
     * shorter and up front rather than after the fact:
     *
     * - It reports on a site from the OUTSIDE. It is the other half of the
     *   extension, which fixes one page for one person and tells nobody.
     * - It never prescribes which languages to offer. It reports that one was
     *   declared and not delivered — a defect with a repro, which is the
     *   difference between a report a developer acts on and one they file under
     *   activism. For an owner that is also the reassurance that it will not
     *   nag them to translate anything.
     * - The verdicts are a fixed catalogue's, not this app's — the CLI's
     *   catalogue, which is the sentence that tells an owner this belongs in
     *   their build — and the report carries its own evidence, so anyone can
     *   re-run it. That is what makes a finding falsifiable rather than a smear.
     */
    about: {
      title: string;
      body: string;
      points: readonly string[];
    };
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
    title: 'Which language is this?',
    intro:
      'Paste any text — Movar works out the language on your device, with nothing sent anywhere.',
    placeholder: 'Paste text here…',
    detect: 'Detect',
    notDetected: 'No Cyrillic language found here',
    ambiguous: 'Mixed signals — no clear language',
    unavailable: 'Language detection is unavailable.',
    evidence: 'What gave it away',
    closestMatch: 'closest match',
    nativeName: 'Native name',
    matchedBy: 'Recognised by',
    matched: {
      '1': 'distinctive letters',
      '2a': 'small everyday words',
      '2b': 'common words',
      '3': 'letter patterns',
    },
    clueLabels: {
      '1': 'Distinctive letters',
      '2a': 'Small everyday words',
      '2b': 'Common words',
      '3': 'Letter patterns',
    },
    howItWorks: {
      title: 'How it works',
      intro:
        'Movar reads the text on your device and tries one clue at a time, until one of them is sure enough — the result shows which clue decided.',
      layer1Title: 'Distinctive letters',
      layer1Lead: "Letters one language has and the others don't —",
      layer2Title: 'Small and common words',
      layer2Detail: 'The short words each language leans on, then the words it uses most.',
      layer3Title: 'Letter patterns',
      layer3Detail:
        'The combinations of letters each language tends to use, for the hardest snippets.',
      foot: 'Latin and other alphabets come back undetected. Nothing is sent anywhere.',
    },
    limitations: {
      title: 'What it cannot do',
      items: [
        'It isn\'t AI — a fixed set of checks, not a model that "understands" text.',
        "No server and no full dictionary — it doesn't look words up, and nothing is sent anywhere.",
        'It goes only on what is in the text: distinctive letters, common words, and letter patterns.',
        'Short, mixed, or romanized text can come back undetected.',
      ],
    },
  },
  audit: {
    title: 'Audit a site',
    intro:
      'What a site claims about languages, what it actually serves, and whether its switcher works.',
    placeholder: 'example.com',
    run: 'Run audit',
    running: 'Auditing…',
    runningNote: 'One request per language…',
    progress: (done, total) => `Request ${String(done)} of ${String(total)}`,
    uaPack: 'Ukrainian law rule pack',
    uaPackHint: 'Law 2704-VIII, Art. 27 §6. Applies to sites serving Ukraine — yours to switch on.',
    invalidUrl: "That doesn't look like a web address.",
    failed: 'The audit could not finish. Nothing was reported about this site.',
    noBridge: 'Auditing only works inside the Movar app.',
    brokenPromises: (count) =>
      count === 1 ? '1 broken promise' : `${String(count)} broken promises`,
    noBrokenPromises: 'No broken promises found',
    // Two clauses, both countable. The long form — "N needed evidence this
    // audit didn't collect" — put a subordinate clause under the one number the
    // document exists to produce, and WHICH evidence was missing is already
    // spelled out per rule, in the row that admits it. "not checked" is the
    // same word the filter pill uses, so the panel and the list agree.
    coverage: (ran, rules, notCollected) =>
      notCollected > 0
        ? `${String(ran)} of ${String(rules)} rules ran · ${String(notCollected)} not checked`
        : `${String(ran)} of ${String(rules)} rules ran`,
    notCollectedNote: 'What was not checked is never counted as passing.',
    engine: (build) => `Engine: ${build}`,
    engineUnknown: 'unknown',
    back: 'Audits',
    again: 'Audit again',
    export: 'Export',
    exportUnavailable: 'Exporting a report only works inside the Movar app.',
    previous: 'Previous audits',
    removeRun: (target) => `Remove ${target} from the list`,
    removeConfirm: {
      question: 'Remove this audit?',
      confirm: 'Remove',
      cancel: 'Cancel',
    },
    notStored: 'This session only. Export a report to keep it.',
    detail: 'Details',
    detailRule: 'Rule',
    detailPage: 'Page',
    detailFinding: 'Reported as',
    detailBasis: 'Based on',
    detailDenominator: 'Out of',
    denominator: (matched, examined) => `${String(matched)} of ${String(examined)} passages`,
    findings: 'Findings',
    observations: 'Observations',
    observationsNote: 'Noted, never counted as broken promises.',
    allRules: 'Every rule, and how it went',
    filterAll: 'All',
    findingCount: (count) => (count === 1 ? '1 finding' : `${String(count)} findings`),
    whyNotCollected: (missing) => `This run did not collect ${missing}.`,
    // The reason arrives as the kernel's own English clause — same rule as a
    // finding's summary: the wording a published report quotes is not localized,
    // or two people running the same evidence would get different documents.
    whyNotApplicable: (reason) => `This rule did not apply — ${reason}.`,
    whyPassed: 'This rule ran against the evidence collected, and found nothing to report.',
    listAnd: ' and ',
    goToFindings: 'Go to what it found',
    capabilities: {
      static: 'the page HTML',
      http: 'a real HTTP response — status, headers, redirects',
      matrix: 'the same page fetched once for each language',
      traversal: 'permission to follow the links the site declares',
      // Named for what it is FOR, not for its mechanism: the only two rules
      // that need it ask whether the site picks a language from your IP
      // address, and "requests from more than one vantage" tells a reader
      // nothing about that.
      'multi-vantage':
        'requests from more than one country — without them there is no way to see whether the site picks a language from your IP address',
      browser: 'the page as a browser builds it, with scripts run',
      site: 'more than one page of the site',
    },
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
    findingVerdicts: {
      // "Broken promise", not "error": the site said something about itself and
      // then did otherwise, which is the only thing this audit ever claims.
      fail: 'Broken promise',
      warn: 'Warning',
      observation: 'Observed',
      // NOT "Note": an `info` finding is a measurement the other findings are
      // read against — `core/serving-default-language` states which language
      // loads with no preference stated — and calling it a note put a shrug
      // where the baseline should be.
      info: 'Measured',
    },
    pageCount: (count) => (count === 1 ? 'on 1 page' : `on ${String(count)} pages`),
    grounding: {
      declared: 'Based on what the site declares',
      observed: 'Based on what the site actually served',
      classified: 'Based on automatic language detection — read as a hint, not a verdict',
    },
    downgraded: 'not counted as a broken promise',
    confirm: {
      title: 'This sends a request to the site',
      body: (host) => `Movar will load ${host} a few times — once for each language.`,
      points: [
        'Nothing about you: no cookies, no account, no identifier.',
        "Movar names itself — the site's owner will see it in their logs.",
        'There is no Movar server in between.',
      ],
      once: 'Asked once per session.',
      cancel: 'Cancel',
      proceed: 'I understand — run the audit',
    },
    matrix: {
      title: 'How the site answered',
      intro: 'The same address, asked for in a different language each time.',
      colAsked: 'Asked for',
      colServed: 'Served',
      noPreference: 'no preference',
      noAnswer: 'no answer',
      errored: 'an error page',
      undeclared: 'declares no language',
      openSite: 'Open the site',
    },
    about: {
      title: 'What Movar Audit is',
      body: "The Movar extension fixes one page, for you, and tells nobody. Movar Audit is the other half: point it at a site — yours or anyone else's — and it reports how that site actually handles languages, with the evidence attached.",
      points: [
        'It never tells you which languages to offer. It reports where a site declared one and did not deliver it — a defect with a repro, not an opinion.',
        'Every verdict comes from a fixed catalogue of rules, the same one the command-line tool runs — so what you see here is what your build would see.',
        'A report carries the evidence it was decided from, so anyone can re-run it and get the same answer — your team, or the company you send it to.',
      ],
    },
    privacy: {
      title: 'How an audit runs',
      items: [
        'Requests go only to the site you name, from this device — there is no Movar server.',
        'No cookies, a fixed number of requests, and Movar names itself every time.',
        "A site that asks Movar to prove it isn't a robot is reported unaudited, never judged.",
      ],
    },
  },
  settings: {
    enabledLabel: 'Movar enabled',
    enabledHelp: 'Turns everything Movar does on or off.',
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
      'Movar opens sites in Ukrainian, switches pages away from Russian where a site offers a choice, and can hide unwanted languages right on the page — automatically.',
    whatTitle: 'What Movar does',
    features: [
      {
        title: 'Opens sites in your language',
        desc: 'Asks every site for Ukrainian first, then English.',
      },
      {
        title: 'Switches away from Russian',
        desc: 'When a site has several languages and hands you a blocked one, Movar switches it to yours.',
      },
      {
        title: 'Hides content — optional',
        desc: 'Hides entries in blocked languages from language switchers and feeds. Off by default.',
      },
    ],
    sourceCode: 'Source code',
    versionLink: (stamp) => `${stamp} — what's new`,
  },
};
