import type { CorrectionMechanism } from '@movar/events';
import { plural } from './plural';

/**
 * Pause-duration keys the catalogue must provide a label for. Mirrors the
 * runtime `PauseDuration` union in `apps/extension/src/lib/pause.ts` — the
 * catalogue only needs the key set (its own concern), not the timing logic, so
 * the string-literal type lives here rather than dragging the extension's
 * `browser`-bound pause module into this browser-free package. Keep the two in
 * sync when a pause option is added.
 */
type PauseDuration = '1h' | 'indefinite';

/** English string catalogue for Movar's own UI surfaces (popup, options) and
 *  for the content-script's injected curtains. Shape is the canonical one —
 *  the Ukrainian catalogue is typed against `Messages` so missing keys surface
 *  at build time. Plural forms are functions so each locale can apply its own
 *  rules instead of leaking ICU MessageFormat into the call sites.
 *
 *  Popup keys live at the root (history reasons — popup shipped first).
 *  Options and content-script copy are namespaced so each surface's strings
 *  stay grouped. */
export interface Messages {
  // ─── Popup ─────────────────────────────────────────────────────────────
  status: {
    /** Label for the off-state hero's "Turn Movar on" CTA. */
    turnOn: string;
  };
  /**
   * Popup hero — a live, per-page status line that replaced the old
   * cross-site "corrections today" count. Each variant maps to exactly one
   * verifiable claim about the active tab; the hero renders one at a time.
   */
  pageStatus: {
    /** Page is already in a preferred language — the all-clear. Takes the
     *  localised language name. */
    servedIn: (name: string) => string;
    /** Page is still in a blocked language Movar found no lever to switch. */
    blockedTitle: (name: string) => string;
    blockedDetail: string;
    /** Button on the blocked band, shown when a session guard is suppressing the
     *  switch — clears the guard and reloads so Movar re-attempts. */
    retrySwitch: string;
    /** Movar concealed picker entries and/or feed cards here. Takes the
     *  hidden picker languages (already localised); empty list → a generic
     *  line for the feed-card-only case (e.g. YouTube) where no picker
     *  language was hidden. */
    hiding: (names: string[]) => string;
    /** Active, page language detected, nothing blocked to act on. */
    clean: string;
    /** Web page with no content script yet — fresh install before a reload. */
    reload: string;
    /** CTA button paired with `reload` — reloads the active tab. */
    reloadCta: string;
    /** Active tab's site is on the exempt list. */
    exemptTitle: string;
    exemptDetail: string;
    /** Same exempt hero, shown instead of `exemptDetail` when the site was
     *  turned off from the crash screen (cleared on the next update) rather
     *  than permanently allowlisted. */
    exemptUntilUpdateDetail: string;
    /** CTA button paired with the exempt state — un-exempts the site + reloads. */
    enableSiteCta: string;
    /** Non-web tab (chrome://, store, new tab) — nothing for Movar to do. */
    noPage: string;
    /** Active site is snoozed (a timed per-site break). Subtitle reuses
     *  `pausedUntilDate`; CTA reuses `pause.resume`. */
    snoozedTitle: string;
  };
  /** Inline label opening the hero's priority line ("Priority: Ukrainian ›
   *  English"). A short noun so the line isn't mistaken for an unrelated
   *  tag list; the language names that follow are already localised. */
  priorityLabel: string;
  /** Paused-state hero title (parallels `offTitle`). The subtitle below carries
   *  the resume timing. */
  pausedTitle: string;
  /** Paused-state subtitles — shown under `pausedTitle`, so they read as the
   *  "when" without repeating "Paused". */
  pausedUntilDate: (date: string) => string;
  pausedIndefinitely: string;
  pausedNoEnd: string;
  /** Off-state hero title + subtitle. */
  offTitle: string;
  offMessage: string;
  hidden: {
    title: string;
    fromPickers: string;
    collapsed: (n: number) => string;
    /** Count of feed cards behind a reversible blur curtain. */
    feedCurtained: (n: number) => string;
    /** Count of feed cards fully hidden (display:none). */
    feedHidden: (n: number) => string;
    show: string;
    reload: string;
    restored: string;
    nothing: string;
  };
  pause: {
    title: string;
    durations: Record<PauseDuration, string>;
    resume: string;
    /** Per-site snooze trigger — a timed break scoped to the active host. */
    snoozeSite: string;
    /** Permanent per-site exemption trigger — adds the active host to the
     *  allowlist so Movar takes no action there until the user removes it. */
    exemptSite: string;
  };
  /** In-popup version of the options-page contentModification toggle. Same
   *  setting, surfaced here so users can flip it without digging into
   *  options. `description` is a one-line concrete-behaviours hint shown
   *  under the label; wired as `aria-describedby` so screen readers
   *  announce it as the checkbox's description, not part of its name. */
  contentToggle: {
    label: string;
    description: string;
  };
  /** Curtain-vs-hide selector shown under the filtering toggle on BOTH the
   *  popup and the options page (one source, two surfaces). `legend` is the
   *  accessible group label; each option carries a short label + a one-line
   *  description of what happens to a filtered card. See
   *  docs/content-filtering-modes.md. */
  concealMode: {
    legend: string;
    curtain: { label: string; description: string };
    hide: { label: string; description: string };
  };
  /** Footer link that opens the full options page via
   *  `browser.runtime.openOptionsPage()`. Paired with a gear icon. */
  settings: string;

  // ─── Cross-surface ─────────────────────────────────────────────────────
  feedback: string;
  /** Options-footer link to the public source repository (`SOURCE_URL`), opened
   *  in a new tab. Paired with a code glyph. Wording mirrors the marketing
   *  footer's "Source code". */
  sourceCode: string;
  /** Accessible name (and tooltip) for the footer's version stamp on both the
   *  popup and the options page, which links out to `movar.fyi/changelog`
   *  anchored at the running version. Takes the stamp exactly as rendered
   *  (`v1.6.2`) and must start with it: the visible text is the whole label, so
   *  WCAG 2.5.3 (label in name) requires the accessible name to contain it. */
  versionLink: (stamp: string) => string;
  /** Popup-only "report an issue" affordance. Unlike `feedback` (a bare mailto
   *  on both surfaces), this one is contextual: on an http(s) page the popup
   *  prefills that page's URL + the extension version into the body; on a
   *  non-web tab (chrome://, store, new-tab) it sends a page-less report — hence
   *  `subject` takes a nullable host and `bodyPrompt` a `hasPage` flag.
   *  `subject` carries the hostname (when present) to keep the maintainer's
   *  inbox triageable; `bodyPrompt` opens the message and says what's
   *  auto-attached — and that the user can edit or remove it. Composed into a
   *  `mailto:`; nothing is sent until the user hits send in their own mail
   *  client (the extension itself makes no network request). */
  report: {
    link: string;
    subject: (host: string | null) => string;
    bodyPrompt: (hasPage: boolean) => string;
    /** Contextual "this site served a blocked language" affordance — shown in
     *  the popup ONLY when the active page's hero is `blocked`. `link` is the
     *  affordance label; `prompt` opens a pre-composed report body explaining
     *  the site ignored the user's language. Still `mailto:`-only. */
    blockedSite: {
      link: string;
      prompt: string;
    };
  };
  languageSelector: {
    label: string;
    auto: string;
    en: string;
    uk: string;
  };
  /** Last-resort UI shown by the React `ErrorBoundary` wrapping the popup
   *  and options-page mount points. Keeps the chrome usable when a storage
   *  read or render throws — without it the surface blanks silently. */
  errorBoundary: {
    title: string;
    description: string;
    reload: string;
    /** Popup-only recovery action (see popup/CrashFallback): exempt the active
     *  site via a direct storage write, for when reload alone can't clear the
     *  crash. */
    turnOffSite: string;
  };

  // ─── Options page ──────────────────────────────────────────────────────
  options: {
    nav: { languages: string };
    aside: {
      howPriorityWorksTitle: string;
      howPriorityWorks: string;
      blockedVsExemptTitle: string;
      blockedVsExempt: string;
    };
    priority: {
      title: string;
      intro: string;
      /** Accessible name for the add-language picker's select + button (also the
       *  select's placeholder). Descriptive; `addButton` is the compact visible
       *  button text. */
      addLabel: string;
      /** Compact visible label on the picker's confirm button. Kept short so it
       *  fits beside the select; the descriptive `addLabel` stays the accessible
       *  name (WCAG 2.5.3: `addLabel` contains `addButton`). */
      addButton: string;
      moveUp: (language: string) => string;
      moveDown: (language: string) => string;
      remove: (language: string) => string;
    };
    allowlist: {
      title: string;
      intro: string;
      empty: string;
      errorBadDomain: string;
      errorDuplicate: string;
      inputLabel: string;
      addButton: string;
      remove: (domain: string) => string;
    };
    pageContent: {
      title: string;
    };
    /** Read-only corrections-insights section. State register throughout:
     *  labels and counts, no voice. Counts use `plural()`. The section is a
     *  quiet local readout of the on-device corrections log — nothing leaves
     *  the browser. */
    insights: {
      title: string;
      /** One-line State message when the log is empty. */
      empty: string;
      /** Count of corrections in the last 7 days. */
      thisWeek: (n: number) => string;
      /** Count of corrections still in the 30-day retention window. */
      total: (n: number) => string;
      /** Subheads for the three breakdown lists. */
      topSitesLabel: string;
      byMechanismLabel: string;
      bySourceLabel: string;
      /** Per-site correction count, paired with the domain. */
      siteCount: (n: number) => string;
      /** Per-mechanism display labels — the levers Movar uses to steer a page. */
      mechanism: Record<CorrectionMechanism, string>;
      /** How Movar learned the page's language: `declared` when the page said
       *  so outright (the sync tiers), `read` when Movar had to sample the
       *  visible text (tier 7). Which detector won the tier-7 race is
       *  diagnostics, so the per-engine tallies are summed into `read` — no
       *  detector id ever reaches the page, and the engine roster can change
       *  without touching copy. */
      source: { declared: string; read: string };
    };
  };

  // ─── First-run onboarding page ───────────────────────────────────────────
  /** Full-tab welcome page opened once on install (entrypoints/onboarding).
   *  Walks each browser's flow from store install to the host-access grant — the
   *  "let Movar read every site" step this page exists to make unmissable.
   *  `access` / `enable` copy is flow-specific; `pin` is shared and optional.
   *  The vendor label ("Chrome", "Edge", …) is a Latin-form proper noun
   *  passed in by the App, so it isn't duplicated per locale. That param is named
   *  `browserName`, not `browser`, on purpose: WXT auto-imports the bare
   *  identifier `browser` from `wxt/browser` into this bundled package, which
   *  breaks `wxt build` (tsc + vitest still pass, so only the build catches it). */
  onboarding: {
    /** Page headline. State — the "you're installed, now finish" frame. */
    title: string;
    /** Lede under the wordmark. promote-in-action + the host-access why. */
    intro: string;
    /** Accessible ordinal for each step heading, e.g. "Step 2 of 4". */
    stepLabel: (index: number, total: number) => string;
    /** Tag shown next to a step that isn't required (currently just "pin"). */
    optionalBadge: string;
    steps: {
      pin: { title: string; body: (browserName: string) => string };
    };
    /** The host-access step — the "read every website" wording differs per flow. */
    access: {
      chromium: { title: string; body: (browserName: string) => string };
      firefox: { title: string; body: string };
      safari: { title: string; body: string };
      safariIos: { title: string; body: string };
    };
    /** Turning the extension on — Safari only (off until switched on). iOS also
     *  asks for Private Browsing: it's a separate toggle, and Movar is inert in
     *  private tabs without it. The same ask is mirrored in the marketing
     *  /install guide (`installGuide.flows.safariIos`) and the Safari host app
     *  (`ios.action`) — change one, change all three. */
    enable: {
      safari: { title: string; body: string };
      safariIos: { title: string; body: string };
    };
    /** Best-effort host-access readout under the access step (Chromium/Firefox). */
    permission: {
      granted: string;
      missing: string;
      recheck: string;
      /** The "allow access" button that fires the native permission prompt. */
      button: string;
      /** Button label while the prompt is in flight. */
      requesting: string;
    };
    /**
     * Closing privacy note answering the "read all your data" prompt the steps
     * above just walked the reader through. Titled and linked to the source
     * rather than set as a trailing footnote — it's the reason those grants are
     * safe, so it has to read as part of the guide. Kept in step with the
     * marketing /install guide's closing note (apps/marketing `installGuide`).
     */
    reassuranceTitle: string;
    reassurance: string;
  };
}

export const messagesEn: Messages = {
  status: {
    turnOn: 'Turn Movar on',
  },
  pageStatus: {
    servedIn: (name) => `This page is in ${name}`,
    blockedTitle: (name) => `This page is in ${name}`,
    blockedDetail: 'Movar found no way to switch it here',
    retrySwitch: 'Try switching again',
    hiding: (names) =>
      names.length > 0
        ? `${names.join(', ')} hidden on this page`
        : 'Some content is hidden on this page',
    clean: 'Nothing to switch here',
    reload: "Movar isn't running here yet",
    reloadCta: 'Reload page',
    exemptTitle: 'Movar is off on this site',
    exemptDetail: 'You asked Movar to skip it',
    exemptUntilUpdateDetail: 'Off until the next Movar update',
    enableSiteCta: 'Turn on for this site',
    noPage: 'Open a website to see Movar at work',
    snoozedTitle: 'Movar is snoozed on this site',
  },
  priorityLabel: 'Priority',
  pausedTitle: 'Movar is paused',
  pausedUntilDate: (date) => `Until ${date}`,
  pausedIndefinitely: 'Until you resume',
  pausedNoEnd: 'No end time set',
  offTitle: 'Movar is off',
  offMessage: 'Nothing is being switched or hidden',
  hidden: {
    title: 'On this page',
    fromPickers: 'Hidden from language switchers:',
    collapsed: (n) =>
      `Hid ${n} language ${plural('en', n, { one: 'switcher', other: 'switchers' })} with only one option left`,
    feedCurtained: (n) =>
      `${n} ${plural('en', n, { one: 'card', other: 'cards' })} behind a curtain`,
    feedHidden: (n) => `${n} ${plural('en', n, { one: 'card', other: 'cards' })} hidden`,
    show: 'Show everything on this page',
    reload: 'Reload the page to let Movar act again.',
    restored: 'Everything is back — reload to let Movar act again.',
    nothing: 'Nothing hidden here.',
  },
  pause: {
    title: 'Pause Movar',
    durations: {
      '1h': '1 hour',
      indefinite: 'Until I resume',
    },
    resume: 'Resume now',
    snoozeSite: 'Snooze this site for an hour',
    exemptSite: 'Always skip this site',
  },
  contentToggle: {
    label: 'Hide content in blocked languages',
    description: 'In language switchers and feeds',
  },
  concealMode: {
    legend: 'What happens to hidden content',
    curtain: {
      label: 'Keep behind a curtain',
      description: 'It stays in place, blurred — click to look',
    },
    hide: {
      label: 'Hide',
      description: 'It disappears and the page closes the gap',
    },
  },
  settings: 'Settings',
  feedback: 'Send feedback',
  sourceCode: 'Source code',
  versionLink: (stamp) => `${stamp} — what's new`,
  report: {
    link: 'Report a problem',
    subject: (host) => (host == null ? 'Movar — problem' : `Movar — problem on ${host}`),
    bodyPrompt: (hasPage) =>
      hasPage
        ? "Describe what's wrong on this page. The details below help us see what you saw — you can remove anything you'd rather not share."
        : "Describe the problem. The details below help us look into it — you can remove anything you'd rather not share.",
    blockedSite: {
      link: 'This site ignored my language',
      prompt:
        "This site kept showing a language I blocked, and Movar couldn't switch it. The details below help us look into it — you can remove anything you'd rather not share.",
    },
  },
  errorBoundary: {
    title: 'Something went wrong',
    description: 'Movar ran into a problem here. Reload, or try again later.',
    reload: 'Reload',
    turnOffSite: 'Turn off for this site',
  },
  languageSelector: {
    label: 'Language',
    auto: 'Auto',
    en: 'English',
    uk: 'Українська',
  },
  options: {
    nav: { languages: 'Languages' },
    aside: {
      howPriorityWorksTitle: 'How priority works',
      howPriorityWorks:
        'Movar asks every site for the first language on your list. If the site has Ukrainian, you get Ukrainian. If it only has English, you get English. If it only has Russian, Movar tries to move you off it.',
      blockedVsExemptTitle: 'Blocked languages, skipped sites',
      blockedVsExempt:
        'A blocked language makes Movar switch the page away from it. A skipped site is left alone — Movar does nothing there at all.',
    },
    priority: {
      title: 'Language priority',
      intro: 'Movar asks each site for these languages in order, and takes the first one it has.',
      addLabel: 'Add language',
      addButton: 'Add',
      moveUp: (language) => `Move ${language} up`,
      moveDown: (language) => `Move ${language} down`,
      remove: (language) => `Remove ${language}`,
    },
    allowlist: {
      title: 'Sites Movar skips',
      intro: 'Movar leaves these sites alone.',
      empty: 'Movar skips no sites yet.',
      errorBadDomain: 'Enter an address like example.com',
      errorDuplicate: 'Already on the list',
      inputLabel: 'Site to skip',
      addButton: 'Add',
      remove: (domain) => `Remove ${domain}`,
    },
    pageContent: {
      title: 'Page content',
    },
    insights: {
      title: 'Corrections',
      empty: 'No corrections yet.',
      thisWeek: (n) =>
        `${n} ${plural('en', n, { one: 'correction', other: 'corrections' })} this week`,
      total: (n) => `${n} in the last 30 days`,
      topSitesLabel: 'Top sites',
      byMechanismLabel: 'How Movar did it',
      bySourceLabel: 'How Movar knew the language',
      siteCount: (n) => `${n} ${plural('en', n, { one: 'correction', other: 'corrections' })}`,
      mechanism: {
        header: 'Asked the site',
        cookie: 'Saved the choice on the site',
        localStorage: 'Saved the choice in the browser',
        redirect: 'Opened the right address',
        dom: 'Changed things on the page',
        search: 'Added a hint to a search',
        'search-retry': 'Searched again',
      },
      source: {
        declared: 'The page said so',
        read: 'Movar read the text',
      },
    },
  },
  onboarding: {
    title: 'Movar is installed',
    intro:
      "Movar keeps every page in your language. To do that, it reads each page's content to detect its language — here is how to turn that on.",
    stepLabel: (index, total) => `Step ${index} of ${total}`,
    optionalBadge: 'Optional',
    steps: {
      pin: {
        title: 'Pin Movar',
        body: (browserName) =>
          `Open the extensions menu in ${browserName} and pin Movar, so its icon stays in the toolbar.`,
      },
    },
    access: {
      chromium: {
        title: 'Let Movar read page content',
        body: (browserName) =>
          `Movar reads each page's content to detect its language, then switches it to yours. Click below to allow this in ${browserName}.`,
      },
      firefox: {
        title: 'Keep access to every site',
        body: 'Firefox grants Movar access to every site at install. If you turned it off, use the button below to turn it back on.',
      },
      safari: {
        title: 'Allow on every website',
        body: 'In Safari Settings, open Extensions, select Movar, and choose "Allow on Every Website".',
      },
      safariIos: {
        title: 'Allow on all websites',
        body: 'In the Settings app, open Apps → Safari → Extensions → Movar, and set "All Websites" to "Allow".',
      },
    },
    enable: {
      safari: {
        title: 'Turn on Movar',
        body: 'Open Safari Settings, go to Extensions, and switch Movar on.',
      },
      safariIos: {
        title: 'Turn on Movar',
        body: 'Open the Settings app, then Apps → Safari → Extensions, switch Movar on, and allow it in Private Browsing — nothing leaves your browser, so your private tabs stay private.',
      },
    },
    permission: {
      granted: 'Movar can read page content.',
      missing: 'Movar needs permission to read page content — grant it below.',
      recheck: 'Check again',
      button: 'Allow access',
      requesting: 'Requesting…',
    },
    reassuranceTitle: 'Nothing leaves your browser',
    reassurance:
      "Movar only reads a page's content to detect its language, then switches it to yours. It has no servers, no accounts, no analytics — nothing about your browsing ever leaves your device. Every line of it is public.",
  },
};
