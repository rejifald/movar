/**
 * Diagnostics snapshot types. The panel shows what the **product's own models**
 * extract and classify on the current page — reused as library code, not by
 * reading the running product (decision 2 holds: no runtime coupling).
 *
 *   • the page-content model (`buildModelForHost`) → content cards, each
 *     classified and marked blocked/kept;
 *   • the language-picker model (`findLanguagePickers` + `buildPickerModel`) →
 *     the on-site switcher's languages, active + blocked.
 *
 * `@movar/lang-detect` owns the pure detection types; only these view-model
 * shapes live here.
 */

import type { LanguageCode } from '@movar/lang-detect';

/** Which classifier rung decided a verdict (null = no confident verdict). */
export const RUNG_TRIGRAMS = 3 as const;
export type Rung = 1 | '2a' | '2b' | typeof RUNG_TRIGRAMS | null;

/** A content card the product's page model extracted, with our classification. */
export interface DiagCard {
  /** Stable id within a snapshot, mapping back to the DOM element for highlight. */
  id: string;
  /** Card kind from the product extractor (video / result / channel / …). */
  kind: string;
  /** Detected language code, or the string `'unknown'` when undecided. */
  language: LanguageCode;
  rung: Rung;
  margin: number;
  /** Detected language is in the blocked set → the product would conceal it. */
  blocked: boolean;
  /** Franc cross-check on confident rung-1/2 verdicts: true = agrees, false =
   *  contradicts (a calibration miss), null = not checked / franc abstained. */
  francAgree: boolean | null;
  francLanguage: LanguageCode | null;
  /** Trimmed card text — local-only, never persisted or sent off-device. */
  sample: string;
}

/** One language option offered by an on-site language picker. */
export interface DiagPickerLang {
  id: string;
  code: LanguageCode;
  /** In the blocked set → the product would strip this option. */
  blocked: boolean;
  /** The picker's currently-active language. */
  active: boolean;
}

/** A language picker (on-site switcher) the product's picker model found. */
export interface DiagPicker {
  id: string;
  languages: DiagPickerLang[];
  activeLanguage: LanguageCode | null;
}

/** One input to a detection chain (page mode / page language): its label and
 *  what it resolved to (null = this signal didn't fire). */
export interface DiagSignal {
  label: string;
  value: string | null;
}

/** Page-mode (light/dark) detection — the product's `detectPageMode` chain. */
export interface PageModeDiag {
  verdict: 'light' | 'dark';
  /** Label of the first signal in the chain that fired. */
  decidedBy: string;
  signals: DiagSignal[];
}

/** Page-language detection — the product's sync `detectPageLanguageFromModel`
 *  chain (the redirect path's signal; body-text engines are async, out of scope). */
export interface PageLanguageDiag {
  verdict: LanguageCode | null;
  /** Verdict is in the blocked set (the product would steer away from it). */
  blocked: boolean;
  signals: DiagSignal[];
}

/** Full snapshot of the current page, as the product's models see it. */
export interface PageDiagnostics {
  /** Page-content extractor id (e.g. 'google'), or null for an unsupported host. */
  extractor: string | null;
  cards: DiagCard[];
  /** Tally of card languages, e.g. `{ ru: 5, uk: 1 }`. */
  cardLangCounts: Record<string, number>;
  pickers: DiagPicker[];
  /** Page-mode (light/dark) detection; null if it threw. */
  pageMode: PageModeDiag | null;
  /** Page-language (sync chain) detection. */
  pageLanguage: PageLanguageDiag;
  /** Cards + picker options the product would act on (blocked) — the FAB badge. */
  blockedCount: number;
}

export const EMPTY_DIAGNOSTICS: PageDiagnostics = {
  extractor: null,
  cards: [],
  cardLangCounts: {},
  pickers: [],
  pageMode: null,
  pageLanguage: { verdict: null, blocked: false, signals: [] },
  blockedCount: 0,
};
