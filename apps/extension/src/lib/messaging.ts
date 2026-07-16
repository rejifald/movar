/** Content-script messaging protocols: popup/options ↔ content, and
 *  content → background (the background hosts franc — see lang-detect-bridge). */

import type { LanguageCode, SnippetItem } from '@movar/lang-detect';
import type { ResolvedLocale } from '@movar/i18n/resolve';

/** Summary of what the content script has currently hidden on a tab. */
export interface HiddenSummary {
  /** Unique languages whose picker links/items are currently hidden. */
  languages: LanguageCode[];
  /** Picker containers collapsed because ≤1 language remained. */
  containers: number;
  /** Content cards (feed items, e.g. YouTube) behind a reversible blur curtain. */
  feedCurtained: number;
  /** Content cards fully hidden (display:none) — the harder concealment the
   *  user opted into via 'hide' mode or a curtain's "Hide all". Split from
   *  {@link feedCurtained} so the popup can show what's recoverable in place
   *  versus removed from the page. */
  feedHidden: number;
  /** Detected language of the current page as of the last apply pass, or
   *  null when detection found nothing. Drives the popup hero's "this page
   *  is in X" / "couldn't switch" status — a live read of the tab, not a
   *  cross-site aggregate. */
  pageLang: LanguageCode | null;
  /** True after the user pressed "Show all" — we stop re-hiding until reload. */
  userOverride: boolean;
  /** True when a session-scoped guard is currently suppressing a language switch
   *  on this tab — either the loop guard holds attempt history (a prior redirect
   *  "hiccup") or a live picker choice for this host matches the page language.
   *  Lets the popup offer "Try switching again" only when a retry can actually do
   *  something, vs a site that genuinely serves only a blocked language. */
  switchSuppressed: boolean;
}

/** True when the content script has concealed anything on the tab — blocked
 *  picker languages, collapsed containers, or blurred feed cards. Shared by the
 *  popup hero (`resolveHero`) and the hidden-content panel so the "is anything
 *  hidden?" test stays a single expression in one place. */
export function hasConcealment(hidden: HiddenSummary): boolean {
  return (
    hidden.languages.length > 0 ||
    hidden.containers > 0 ||
    hidden.feedCurtained > 0 ||
    hidden.feedHidden > 0
  );
}

/** Total count of concealed things on the tab — every picker language, collapsed
 *  container, and feed card Movar hid. Drives the toolbar's native count badge
 *  ("N hidden") in the `blocking` state. Companion to {@link hasConcealment}:
 *  `concealedCount > 0` iff `hasConcealment`. */
export function concealedCount(hidden: HiddenSummary): number {
  return hidden.languages.length + hidden.containers + hidden.feedCurtained + hidden.feedHidden;
}

/** Tier-7 whole-page language detection, served by the background-worker franc.
 *  Response: `DetectedLanguage | null` (from @movar/lang-detect). */
export interface DetectTextMessage {
  type: 'movar:detectText';
  text: string;
  maxChars?: number;
}

/** Batched per-snippet classification for the content filter — the worker runs
 *  the full classifier (rungs 1–3, franc + the language profiles) over each
 *  card against the candidate languages, so neither the profiles nor franc ship
 *  in the content bundle. Each item is a card's text plus, for a page-declared
 *  node, its declared language: declared items are fused (declaration + text),
 *  the rest run the text-only rung classifier. One verdict (or null) per item,
 *  in order.
 *  Response: `(SnippetVerdict | FusedVerdict | null)[]` (from @movar/lang-detect). */
export interface ClassifySnippetsMessage {
  type: 'movar:classifySnippets';
  items: SnippetItem[];
  candidateCodes: LanguageCode[];
}

/** Wake the background worker and force franc's tables to load (cold-start
 *  mitigation). Fire-and-forget; no meaningful response. */
export interface WarmFrancMessage {
  type: 'movar:warmFranc';
}

/** Fetch the active locale's content-script curtain strings from the worker,
 *  which hosts every catalogue — so the content script ships only its English
 *  fallback, not every locale. Response: `ContentStrings` (the serializable data
 *  shape, from i18n/content-strings). */
export interface ContentStringsMessage {
  type: 'movar:contentStrings';
  locale: ResolvedLocale;
}

/** Content → background: the empty-results retry is about to navigate to the
 *  same query with the `lr` filter deliberately dropped, to escape a
 *  server-side session pin (docs/google-search-url-params.md, finding #1). The
 *  Google /search DNR redirect rule (lib/dnr.ts) would otherwise re-add `lr` at
 *  the network layer — it has no view of the content-script loop-guard that
 *  suppresses the *content* rewrite — and bounce the retry back to the pinned
 *  zero-result URL. This asks the background to suspend that rule so the lr-less
 *  navigation survives. Awaited (the nav waits until the rule is down) but
 *  otherwise fire-and-forget: the background auto-restores the rule via a timed
 *  alarm, so the suspension self-heals even if this tab never reports back. */
export interface SuspendGoogleRedirectMessage {
  type: 'movar:suspendGoogleRedirect';
}

/** Content → background: the tab's concealment settled or changed (an apply pass
 *  hid/revealed cards, an infinite-scroll feed added more, or the user pressed
 *  "Show everything"). Fire-and-forget, deduped content-side by concealment
 *  count. Lets the background flip the toolbar icon to `blocking` and set the
 *  native count badge the moment concealment lands — the `getHidden` pull on tab
 *  events can fire before the content script has finished concealing. Carries the
 *  fresh summary so the background needn't round-trip back. */
export interface HiddenChangedMessage {
  type: 'movar:hiddenChanged';
  summary: HiddenSummary;
}

/** Message protocol across the content script, popup/options, and background.
 *  getHidden/restoreHidden/retrySwitch are popup→content (tabs.sendMessage);
 *  detectText/classifySnippets/warmFranc/contentStrings are content→background
 *  (runtime.sendMessage). Each listener ignores the types it doesn't own. */
export type MovarMessage =
  | { type: 'movar:getHidden' }
  | { type: 'movar:restoreHidden' }
  | { type: 'movar:retrySwitch' }
  | DetectTextMessage
  | ClassifySnippetsMessage
  | WarmFrancMessage
  | ContentStringsMessage
  | SuspendGoogleRedirectMessage
  | HiddenChangedMessage;
