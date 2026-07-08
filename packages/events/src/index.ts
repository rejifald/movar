/** Movar correction-log types — the record of corrections the extension applied. */

import type { LanguageCode } from '@movar/lang-detect';

export type CorrectionMechanism =
  | 'header'
  | 'cookie'
  | 'localStorage'
  | 'redirect'
  | 'dom'
  | 'search'
  /** Empty-results fallback: a result-filtered search page (e.g. Google with
   *  `lr=lang_*`) rendered zero organic results, so the same query was retried
   *  once without the filter param. Distinct from 'search' so the retry stays
   *  observable in the dashboard. */
  | 'search-retry';

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
