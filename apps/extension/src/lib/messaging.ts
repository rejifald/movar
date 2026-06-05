/** Popup/options ↔ content-script messaging protocol and its payload shapes. */

import type { LanguageCode } from '@movar/lang-detect';

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
