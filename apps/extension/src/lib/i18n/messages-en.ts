import type { LanguageCode, PauseDuration } from '@movar/shared';

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
    active: string;
    paused: string;
    off: string;
    turnOn: string;
    turnOff: string;
  };
  /**
   * Localised suffix only — the bare count is rendered separately so the
   * popup hero can put the numeral in a display weight without parsing a
   * localised sentence apart. Plural form still varies by `n` so the
   * suffix agrees in number (en: "correction today" vs "corrections
   * today"; uk: «виправлення сьогодні» / «виправлень сьогодні»).
   */
  correctionsTodayLabel: (n: number) => string;
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
  pausedUntilDate: (date: string) => string;
  pausedUntilSession: string;
  pausedNoEnd: string;
  offMessage: string;
  hidden: {
    title: string;
    fromPickers: string;
    collapsed: (n: number) => string;
    show: string;
    reload: string;
    restored: string;
    nothing: string;
  };
  pause: {
    title: string;
    durations: Record<PauseDuration, string>;
    resume: string;
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
  /** Footer link that opens the full options page via
   *  `browser.runtime.openOptionsPage()`. Paired with a gear icon. */
  settings: string;

  // ─── Cross-surface ─────────────────────────────────────────────────────
  feedback: string;
  languageSelector: {
    label: string;
    auto: string;
    en: string;
    uk: string;
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
      intro: string;
      toggleLabel: string;
    };
  };

  // ─── Content-script curtains ───────────────────────────────────────────
  content: {
    pickerHidden: {
      title: string;
      description: string;
      show: string;
    };
    contentHidden: {
      title: string;
      /** Description varies by detected language ('ru' is the only one with
       *  a tailored message today; others use a generic fallback). */
      descriptionForLanguage: (code: LanguageCode) => string;
      ariaLabelForLanguage: (code: LanguageCode) => string;
      show: string;
    };
  };
}

export const messagesEn: Messages = {
  status: {
    active: 'Active',
    paused: 'Paused',
    off: 'Off',
    turnOn: 'Turn Movar on',
    turnOff: 'Turn Movar off',
  },
  correctionsTodayLabel: (n) => `${n === 1 ? 'correction' : 'corrections'} today`,
  priorityLabel: 'Preferred order',
  priority: (names) => `Priority ${names.join(' → ')}`,
  pausedUntilDate: (date) => `Paused until ${date}`,
  pausedUntilSession: 'Paused until you restart the browser',
  pausedNoEnd: 'Paused',
  offMessage: 'Movar is off — toggle on to resume.',
  hidden: {
    title: 'On this page',
    fromPickers: 'Hidden from pickers:',
    collapsed: (n) => `Collapsed ${n} ${n === 1 ? 'picker' : 'pickers'} with only one option left`,
    show: 'Show everything on this page',
    reload: 'Reload the page to re-apply Movar.',
    restored: 'Restored on this page — reload to re-apply.',
    nothing: 'Nothing hidden here.',
  },
  pause: {
    title: 'Pause Movar',
    durations: {
      '1h': '1 hour',
      '24h': '24 hours',
      session: 'Session',
      '1w': '1 week',
    },
    resume: 'Resume now',
  },
  contentToggle: {
    label: 'Hide blocked-language content',
    description: 'In language pickers and content feeds',
  },
  settings: 'Settings',
  feedback: 'Send feedback',
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
      intro:
        'When on, Movar also hides blocked-language entries from on-site language pickers and blurs content cards (e.g. YouTube videos) in a blocked language. Off by default; turn on if you want a tidier page.',
      toggleLabel: 'Allow Movar to modify page content on visited sites.',
    },
  },
  content: {
    pickerHidden: {
      title: 'Picker hidden',
      description: 'No preferred languages here',
      show: 'Show',
    },
    contentHidden: {
      title: 'Content hidden',
      descriptionForLanguage: (code) =>
        code === 'ru' ? 'In Russian' : 'Language not in your list',
      ariaLabelForLanguage: (code) =>
        code === 'ru' ? 'Movar: Russian content hidden' : 'Movar: content hidden',
      show: 'Show',
    },
  },
};
