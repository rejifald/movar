/** Movar shared types, defaults, and constants. */

/**
 * Where users can send feedback. Used by the popup, options page, and marketing site.
 */
export const FEEDBACK_URL = 'mailto:support@movar.fyi?subject=Movar%20feedback';

/** Public source repository. Movar is open source under the MIT license. */
export const SOURCE_URL = 'https://github.com/rejifald/movar';

/** ISO 639-1 language code, e.g. 'uk', 'en', 'ru'. */
export type LanguageCode = string;

/**
 * Two pause options today: a short timed break and an indefinite "until you
 * resume" pause. We deliberately don't offer multi-day timed pauses — if you
 * want Movar gone for that long, toggle the extension off instead.
 *
 * `'indefinite'` survives browser restarts (it really is paused *until you
 * resume*); the timed variant auto-expires via a chrome.alarms entry.
 */
export type PauseDuration = '1h' | 'indefinite';

export const PAUSE_DURATIONS: readonly PauseDuration[] = ['1h', 'indefinite'];

/**
 * Locale for Movar's own UI (popup, options). 'auto' follows the browser UI
 * language — only 'en' and 'uk' are translated today; anything else falls back
 * to 'en'. Distinct from {@link MovarSettings.priority}, which is the user's
 * content-language preference negotiated with sites.
 */
export type UiLanguage = 'auto' | 'en' | 'uk';

export const UI_LANGUAGES: readonly UiLanguage[] = ['auto', 'en', 'uk'];

export interface MovarSettings {
  enabled: boolean;
  /** Ordered language priority; the first available language wins. */
  priority: LanguageCode[];
  /** Languages to strip from on-site language switchers (only when contentModification is on). */
  blocked: LanguageCode[];
  /** Domains where Movar takes no action. */
  allowlist: string[];
  /**
   * Allow Movar to modify page DOM: hide blocked-language entries in
   * on-site language pickers and blur content cards in a blocked language.
   * Off by default — the safer baseline ships only header/URL-level switching.
   */
  contentModification: boolean;
  /** Record on-device shadow-oracle divergence diagnostics (dev / power-user;
   *  never networked). Off by default. */
  diagnostics: boolean;
  /** Locale for Movar's own UI; 'auto' follows browser UI language. */
  uiLanguage: UiLanguage;
}

export const defaultSettings: MovarSettings = {
  enabled: true,
  priority: ['uk', 'en'],
  blocked: ['ru'],
  allowlist: [],
  contentModification: false,
  diagnostics: false,
  uiLanguage: 'auto',
};

/**
 * Languages that are permanently blocked. The UI must not offer to remove
 * them from {@link MovarSettings.blocked} or add them to
 * {@link MovarSettings.priority}, and {@link enforceLockedLanguages} re-asserts
 * the invariant at the storage boundary so a stale sync from another device,
 * a hand-edited storage value, or a UI bug can't quietly disable the policy.
 *
 * Russian is locked because Movar's whole reason for existing is helping
 * Ukrainians dodge Russian content — making it user-toggleable would invite
 * "I switched it off and forgot" footguns that break the product premise.
 */
export const LOCKED_BLOCKED_LANGUAGES: readonly LanguageCode[] = ['ru'];

export function isLockedBlocked(code: LanguageCode): boolean {
  return LOCKED_BLOCKED_LANGUAGES.includes(code);
}

/**
 * Coerce `settings` to satisfy the locked-language invariant: every locked
 * code is present in `blocked`, and no locked code is in `priority`. Pure;
 * returns a new object when a change is needed. Idempotent.
 */
export function enforceLockedLanguages(settings: MovarSettings): MovarSettings {
  const blocked = [...settings.blocked];
  for (const code of LOCKED_BLOCKED_LANGUAGES) {
    if (!blocked.includes(code)) blocked.push(code);
  }
  const priority = settings.priority.filter((c) => !isLockedBlocked(c));
  // Avoid allocating a new settings object when nothing changed.
  if (blocked.length === settings.blocked.length && priority.length === settings.priority.length) {
    return settings;
  }
  return { ...settings, blocked, priority };
}

export type CorrectionMechanism =
  | 'header'
  | 'cookie'
  | 'localStorage'
  | 'redirect'
  | 'dom'
  | 'search';

/** A single correction the extension applied — logged locally for the dashboard. */
export interface CorrectionEvent {
  timestamp: number;
  /** Domain only — never the full URL, for privacy. */
  domain: string;
  mechanism: CorrectionMechanism;
  fromLang: LanguageCode;
  toLang: LanguageCode;
  /** Engine that produced the page-language signal that drove this correction.
   *  Absent when the correction was driven by a sync-tier signal (tier 1-5). */
  detectionEngine?: string;
}

/** Summary of what the content script has currently hidden on a tab. */
export interface HiddenSummary {
  /** Unique languages whose picker links/items are currently hidden. */
  languages: LanguageCode[];
  /** Picker containers collapsed because ≤1 language remained. */
  containers: number;
  /** True after the user pressed "Show all" — we stop re-hiding until reload. */
  userOverride: boolean;
}

/**
 * A single shadow-oracle divergence — the per-snippet classifier and the franc
 * oracle confidently disagreed. On-device diagnostics only; never networked.
 */
export interface DetectionDivergence {
  /** Stable id (unique within one content-script load) correlating a row back to
   *  the captured DOM element, so the popup can ask the page to highlight it. */
  id: string;
  timestamp: number;
  /** Domain only — never the full URL (mirrors CorrectionEvent's privacy rule). */
  domain: string;
  candidates: LanguageCode[];
  classifier: {
    language: LanguageCode | 'unknown';
    margin: number;
    rung: 1 | '2a' | '2b' | 3 | null;
  };
  oracle: { language: LanguageCode; margin: number };
  /** Trimmed snippet text — local-only, never persisted or sent off-device. */
  sample: string;
  lengthBucket: 'xs' | 's' | 'm' | 'l';
}

/** Diagnostics snapshot for the popup: total recorded + the most recent few. */
export interface DiagnosticsSummary {
  total: number;
  recent: DetectionDivergence[];
}

/** Message protocol between popup/options and content script. */
export type MovarMessage =
  | { type: 'movar:getHidden' }
  | { type: 'movar:restoreHidden' }
  | { type: 'movar:getDiagnostics' }
  | { type: 'movar:highlightDivergence'; id: string };
