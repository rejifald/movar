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
    /** CTA button paired with the exempt state — un-exempts the site + reloads. */
    enableSiteCta: string;
    /** Non-web tab (chrome://, store, new tab) — nothing for Movar to do. */
    noPage: string;
    /** Active site is snoozed (a timed per-site break). Subtitle reuses
     *  `pausedUntilDate`; CTA reuses `pause.resume`. */
    snoozedTitle: string;
  };
  /** Eyebrow noun above the priority-chip chain. Short label so the row
   *  isn't visually mistaken for an unrelated tag list. */
  priorityLabel: string;
  /**
   * Screen-reader sentence for the visual priority-chip chain in the hero.
   * Takes already-localised language names — keeps the spoken reading in
   * the popup's locale instead of letter-spelling ISO codes (`uk` reads as
   * "u-k", not "Ukrainian").
   */
  priority: (names: string[]) => string;
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
      addLabel: string;
      moveUp: (language: string) => string;
      moveDown: (language: string) => string;
      remove: (language: string) => string;
    };
    blocked: {
      title: string;
      intro: string;
      empty: string;
      addLabel: string;
      unblock: (language: string) => string;
      /** Hint shown on permanently-blocked entries (e.g. Russian) where the
       *  unblock button is replaced by a lock indicator. */
      lockedHint: (language: string) => string;
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
      byEngineLabel: string;
      /** Engine bucket for sync-tier (engine-less) corrections. */
      syncTier: string;
      /** Per-site correction count, paired with the domain. */
      siteCount: (n: number) => string;
      /** Per-mechanism display labels — the levers Movar uses to steer a page. */
      mechanism: Record<CorrectionMechanism, string>;
    };
  };

  // ─── First-run onboarding page ───────────────────────────────────────────
  /** Full-tab welcome page opened once on install (entrypoints/onboarding).
   *  Walks each browser's flow from store install to the host-access grant — the
   *  "let Movar read every site" step this page exists to make unmissable.
   *  `access` / `enable` copy is flow-specific; `pin` / `reload` / `language` is
   *  shared. The vendor label ("Chrome", "Edge", …) is a Latin-form proper noun
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
    steps: {
      pin: { title: string; body: (browserName: string) => string };
      reload: { title: string; body: string };
      language: { title: string; body: string; cta: string };
    };
    /** The host-access step — the "read every website" wording differs per flow. */
    access: {
      chromium: { title: string; body: (browserName: string) => string };
      firefox: { title: string; body: string };
      safari: { title: string; body: string };
      safariIos: { title: string; body: string };
    };
    /** Turning the extension on — Safari only (off until switched on). */
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
    /** Quiet privacy reassurance answering the "read all your data" prompt. */
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
        : 'Blocked content hidden on this page',
    clean: 'No blocked language here',
    reload: "Movar isn't running here yet",
    reloadCta: 'Reload page',
    exemptTitle: 'Movar is off on this site',
    exemptDetail: "It's on your exempt list",
    enableSiteCta: 'Turn on for this site',
    noPage: 'Open a website to see Movar at work',
    snoozedTitle: 'Movar is snoozed on this site',
  },
  priorityLabel: 'Preferred order',
  priority: (names) => `Priority ${names.join(' → ')}`,
  pausedTitle: 'Movar is paused',
  pausedUntilDate: (date) => `Until ${date}`,
  pausedIndefinitely: 'Until you resume',
  pausedNoEnd: 'No scheduled end',
  offTitle: 'Movar is off',
  offMessage: 'Nothing is blocked or switched',
  hidden: {
    title: 'On this page',
    fromPickers: 'Hidden from pickers:',
    collapsed: (n) =>
      `Collapsed ${n} ${plural('en', n, { one: 'picker', other: 'pickers' })} with only one option left`,
    feedCurtained: (n) =>
      `${n} ${plural('en', n, { one: 'card', other: 'cards' })} behind a curtain`,
    feedHidden: (n) => `${n} ${plural('en', n, { one: 'card', other: 'cards' })} hidden`,
    show: 'Show everything on this page',
    reload: 'Reload the page to re-apply Movar.',
    restored: 'Restored on this page — reload to re-apply.',
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
  },
  contentToggle: {
    label: 'Filter blocked-language content',
    description: 'In language pickers and content feeds',
  },
  concealMode: {
    legend: 'How to hide filtered content',
    curtain: {
      label: 'Keep behind a curtain',
      description: 'Card stays in place, blurred but peekable',
    },
    hide: {
      label: 'Hide',
      description: 'Card is removed and the feed reflows',
    },
  },
  settings: 'Settings',
  feedback: 'Send feedback',
  sourceCode: 'Source code',
  report: {
    link: 'Report an issue',
    subject: (host) => (host == null ? 'Movar — issue' : `Movar — issue on ${host}`),
    bodyPrompt: (hasPage) =>
      hasPage
        ? "Describe what's wrong on this page. The details below help us reproduce it — you can remove anything you'd rather not share."
        : "Describe the issue. The details below help us look into it — you can remove anything you'd rather not share.",
    blockedSite: {
      link: 'This site ignored my language',
      prompt:
        "This site served a blocked language and Movar couldn't switch it. The details below help us look into it — you can remove anything you'd rather not share.",
    },
  },
  errorBoundary: {
    title: 'Movar hit an unexpected problem',
    description:
      'The popup ran into an error and could not load. Reload to try again — your settings are not affected.',
    reload: 'Reload',
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
        "Movar negotiates each request with the site's available languages. If a site offers Ukrainian, it serves Ukrainian. If only English, English. If only Russian, Movar tries to switch you away.",
      blockedVsExemptTitle: 'Blocked vs exempt',
      blockedVsExempt:
        'Blocked languages trigger an automatic switch away. Exempt sites are ignored entirely — Movar does nothing on them.',
    },
    priority: {
      title: 'Language priority',
      intro: 'Movar will request each site in this order; the first available wins.',
      addLabel: 'Add language',
      moveUp: (language) => `Move ${language} up`,
      moveDown: (language) => `Move ${language} down`,
      remove: (language) => `Remove ${language}`,
    },
    blocked: {
      title: 'Blocked languages',
      intro: 'Movar will switch away from any page served in these languages.',
      empty: 'No languages are blocked.',
      addLabel: 'Block another',
      unblock: (language) => `Unblock ${language}`,
      lockedHint: (language) => `${language} is always blocked`,
    },
    allowlist: {
      title: 'Exempt sites',
      intro: 'Movar takes no action on these domains.',
      empty: 'No sites are exempt.',
      errorBadDomain: 'Enter a domain like example.com',
      errorDuplicate: 'Already on the list',
      inputLabel: 'Domain to exempt',
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
      byMechanismLabel: 'By mechanism',
      byEngineLabel: 'By engine',
      syncTier: 'Sync tier',
      siteCount: (n) => `${n} ${plural('en', n, { one: 'correction', other: 'corrections' })}`,
      mechanism: {
        header: 'Request header',
        cookie: 'Cookie',
        localStorage: 'Local storage',
        redirect: 'Redirect',
        dom: 'Page content',
        search: 'Search',
      },
    },
  },
  onboarding: {
    title: 'Movar is installed',
    intro:
      'Movar keeps every page in your language. To do that it reads each page you open — here is how to switch that on and set your language.',
    stepLabel: (index, total) => `Step ${index} of ${total}`,
    steps: {
      pin: {
        title: 'Pin Movar',
        body: (browserName) =>
          `Open the extensions menu in ${browserName} and pin Movar, so its icon stays in the toolbar.`,
      },
      reload: {
        title: 'Reload open tabs',
        body: 'Pages you opened before installing need a reload for Movar to act on them.',
      },
      language: {
        title: 'Set your language',
        body: 'Open settings and put your language first. Movar requests every site in that order.',
        cta: 'Open settings',
      },
    },
    access: {
      chromium: {
        title: 'Let Movar read every site',
        body: (browserName) =>
          `Movar reads each page to detect its language. Click below to let it read every site in ${browserName}.`,
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
        body: 'Open the Settings app, then Apps → Safari → Extensions, and switch Movar on.',
      },
    },
    permission: {
      granted: 'Movar can read every page.',
      missing: "Movar can't read pages yet — grant access below.",
      recheck: 'Check again',
      button: 'Allow access',
      requesting: 'Requesting…',
    },
    reassurance:
      'Movar reads pages only to detect and switch their language. It has no servers — nothing about your browsing leaves your device.',
  },
};
