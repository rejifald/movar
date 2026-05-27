/** Movar shared types, defaults, and constants. */

/** Where users can send feedback. Used by the popup, options page, and marketing site. */
export const FEEDBACK_URL = 'mailto:feedback@movar.fyi?subject=Movar%20feedback';

/** ISO 639-1 language code, e.g. 'uk', 'en', 'ru'. */
export type LanguageCode = string;

export type PauseDuration = '1h' | '24h' | 'session' | '1w';

export const PAUSE_DURATIONS: readonly PauseDuration[] = ['1h', '24h', 'session', '1w'];

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
}

export const defaultSettings: MovarSettings = {
  enabled: true,
  priority: ['uk', 'en'],
  blocked: ['ru'],
  allowlist: [],
  contentModification: false,
};

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

/** Message protocol between popup/options and content script. */
export type MovarMessage = { type: 'movar:getHidden' } | { type: 'movar:restoreHidden' };
