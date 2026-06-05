/** Movar correction-log types — the record of corrections the extension applied. */

import type { LanguageCode } from '@movar/lang-detect';

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
