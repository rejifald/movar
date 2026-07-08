/**
 * Empty-results fallback for enforce-mode search rules (`SiteRule.emptyResultsRetry`).
 *
 * Why this exists: Google can serve a zero-organic-result SERP even on a fully
 * cleaned URL. The poisoned entry request (opaque `gs_lcrp` omnibox token) is
 * served BEFORE the content-script rewrite can redirect away, so for a short
 * hot window the pinned candidate set rides Google's server-side session state
 * — and intersecting it with the `lr=lang_*` filter yields zero results. URL
 * param stripping cannot reach that state (docs/google-search-url-params.md,
 * finding #1). The durable fix is detect-and-retry: once the page settles,
 * a SERP that carries the filter param yet shows a rendered-but-empty results
 * area is retried exactly once with the filter param removed (`hl` stays).
 *
 * The retry itself is the test — we can't distinguish a pinned session from a
 * legitimately-empty query up front, but the retry resolves it either way: a
 * pinned query recovers, a legitimately-empty one stays empty and is never
 * retried again. "Exactly once" rides the loop guard's per-tab, TTL'd URL set:
 * the FROM URL is marked so this page never re-retries, and the retried URL is
 * pre-marked so the enforce rewrite (`tryStrategySwitch` bails on
 * `recentlyAttemptedHere`) doesn't immediately re-add the filter and bounce
 * back. A fresh query mints a fresh URL, so the next search gets the filter
 * as usual — suppression is per-URL, not per-session.
 *
 * Scheduling: the check is armed from the applyOnce tick (sync, non-blocking)
 * and confirms on its own timer after the document settles, because a
 * DOMContentLoaded-time count can read a healthy SERP as empty (results not
 * rendered yet) and an SPA transition can pass through an emptied container.
 * Every condition is re-checked at confirm time; a settings change, SPA
 * navigation, or pause between schedule and confirm makes the confirm a no-op,
 * and the next applyOnce tick re-arms it if the state still calls for a retry.
 */
import type { CorrectionEvent } from '@movar/events';
import type { LanguageCode } from '@movar/lang-detect';
import type { EmptyResultsRetry } from '../sites/types';

/** ms between the document settling (window `load`) and the confirming count.
 *  Covers late post-load renders without holding an applyOnce tick hostage. */
export const RETRY_SETTLE_DELAY_MS = 400;

/** Side effects injected by the content script; tests pass stubs. */
export interface EmptyResultsRetryDeps {
  /** Navigation surface (real `location` in the content script). */
  location: { readonly href: string; replace(url: string): void };
  /** `document.querySelectorAll(selector).length` in production. */
  countMatches(selector: string): number;
  /** Run `fn` now if the document already finished loading, else once on
   *  window `load`. */
  whenSettled(fn: () => void): void;
  /** Loop-guard read: true when `href` is already in this tab's attempted set. */
  recentlyAttemptedHere(href: string): boolean;
  /** Loop-guard write: add `href` to this tab's attempted set (TTL'd). */
  markAttempt(href: string): void;
  /** Correction-event logger (content-runtime's `record`). */
  record(
    mechanism: CorrectionEvent['mechanism'],
    fromLang: LanguageCode,
    toLang: LanguageCode,
  ): Promise<void>;
  /** False once a pause/snooze/settings change supersedes the scheduling tick. */
  isActive(): boolean;
}

/** URL of the pending confirm, so mutation-tick bursts on the same page arm a
 *  single timer. Purely an optimization — a duplicate confirm would bail on
 *  the loop-guard marker anyway. Module-level like the content script's other
 *  page-scoped flags; reset per test via {@link resetEmptyResultsRetryState}. */
let pendingHref: string | null = null;

export function resetEmptyResultsRetryState(): void {
  pendingHref = null;
}

/** `href` with the filter param dropped, or null when the param isn't present
 *  (nothing to retry) or dropping it changes nothing. */
export function retryTargetUrl(href: string, dropParam: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(dropParam)) return null;
  url.searchParams.delete(dropParam);
  const target = url.toString();
  return target === href ? null : target;
}

/** The results area rendered AND holds zero organic hits. An absent container
 *  is "not a results page / not rendered yet", never "empty" — that asymmetry
 *  is what keeps the check off interstitials and half-loaded documents. */
function isConfirmedEmpty(retry: EmptyResultsRetry, deps: EmptyResultsRetryDeps): boolean {
  return (
    deps.countMatches(retry.containerSelector) > 0 && deps.countMatches(retry.resultsSelector) === 0
  );
}

/** The world moved on between schedule and confirm: paused/snoozed/settings
 *  changed, an SPA navigation swapped the URL, or this URL already retried. */
function isSuperseded(deps: EmptyResultsRetryDeps, href: string): boolean {
  return !deps.isActive() || deps.location.href !== href || deps.recentlyAttemptedHere(href);
}

async function confirmAndRetry(
  retry: EmptyResultsRetry,
  target: LanguageCode,
  deps: EmptyResultsRetryDeps,
  href: string,
): Promise<void> {
  // Unconditional: whatever happens below, the next tick may re-arm freely.
  pendingHref = null;
  if (isSuperseded(deps, href)) return;
  if (!isConfirmedEmpty(retry, deps)) return;
  const retryHref = retryTargetUrl(href, retry.dropParam);
  if (retryHref == null) return;
  // Mark BOTH sides before navigating (same order as tryStrategySwitch:
  // mark → record → navigate). The FROM mark makes this page once-only; the
  // target mark makes the enforce rewrite bail on the retried page instead of
  // re-adding the filter param and bouncing straight back.
  deps.markAttempt(href);
  deps.markAttempt(retryHref);
  await deps.record('search-retry', target, target);
  deps.location.replace(retryHref);
}

/**
 * Arm the empty-results check for the current page, if it looks retriable.
 * Called from every applyOnce tick on rule-bearing hosts; cheap no-op unless
 * the URL carries the filter param and the page currently shows zero organic
 * hits. The verdict itself is taken by {@link confirmAndRetry} after the
 * document settles plus {@link RETRY_SETTLE_DELAY_MS}.
 *
 * `target` is the user's top priority language — only used to label the
 * `search-retry` correction event (the retry never needs a language; the
 * caller gates on having one because a filter we didn't add isn't ours to
 * remove).
 */
export function maybeScheduleEmptyResultsRetry(
  retry: EmptyResultsRetry,
  target: LanguageCode,
  deps: EmptyResultsRetryDeps,
): void {
  const href = deps.location.href;
  if (pendingHref === href || deps.recentlyAttemptedHere(href)) return;
  if (retryTargetUrl(href, retry.dropParam) == null) return;
  // Results already visible — the common healthy-SERP case. Skip without
  // arming a timer; a later mutation tick re-enters if the page empties.
  if (deps.countMatches(retry.resultsSelector) > 0) return;
  pendingHref = href;
  deps.whenSettled(() => {
    setTimeout(() => void confirmAndRetry(retry, target, deps, href), RETRY_SETTLE_DELAY_MS);
  });
}
