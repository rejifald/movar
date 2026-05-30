import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import {
  type CorrectionEvent,
  type HiddenSummary,
  type LanguageCode,
  type MovarMessage,
  type MovarSettings,
} from '@movar/shared';
import { getRuleForHost, type SiteRule } from '@movar/rules';
import { logCorrection } from '../lib/events';
import {
  classifyLanguageElement,
  detectPageLanguage,
  filterPickers,
  findLanguagePickers,
  ORIGINAL_TEXT_ATTR,
  pickRedirectTarget,
  RESTORED_ATTR,
  type Picker,
} from '../lib/picker';
import { detachAllTooltips } from '../lib/tooltip';
import {
  applyContentFilter,
  clearAllContentMarks,
  getFilterForHost,
  revealAllBlurred,
} from '../lib/content-filter';
import { detachAllCurtains } from '../lib/curtain';
import { setContentLocale } from '../lib/i18n/content';
import { resolveLocale } from '../lib/i18n/resolve';
import { getPauseState } from '../lib/pause';
import { getSettings, onSettingsChange } from '../lib/settings';
import { applyStrategy } from '../lib/strategy';

const HIDDEN_ATTR = 'data-movar-hidden';

/** True after the user clicks "Show all" — stops the MutationObserver from
 *  re-hiding the picker items we just restored. Resets on page reload. */
let userOverride = false;

function getHiddenSummary(): HiddenSummary {
  const languages = new Set<LanguageCode>();
  document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    const reason = el.getAttribute(HIDDEN_ATTR);
    if (reason === 'not-in-priority' && el instanceof HTMLElement) {
      const c = classifyLanguageElement(el);
      if (c) languages.add(c.language);
    }
  });
  // Hidden picker containers are tracked via curtain hosts marked
  // data-movar-kind="picker-container".
  const containers = document.querySelectorAll(
    '[data-movar-curtain][data-movar-kind="picker-container"]',
  ).length;
  return {
    languages: [...languages].toSorted((a, b) => a.localeCompare(b)),
    containers,
    userOverride,
  };
}

/** Reverse every DOM modification this content script applied — without
 *  marking content cards REVEALED. Suitable for "the feature was turned
 *  off, undo what we did" gestures (settings toggle off); a future
 *  applyOnce pass treats the page as never-seen and re-filters from
 *  scratch. Sibling to restoreAll, which carries the extra "the user
 *  explicitly opted to see this page's content" semantics. */
function clearAllModifications(): void {
  // Detach every curtain on the page — reverses the per-curtain side effects
  // (display:none on picker containers, pointer-events/aria-hidden on blur
  // cards) in one sweep.
  detachAllCurtains();
  // Sweep the remaining hideElement-marked links (no curtain attached to those).
  document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    el.removeAttribute(HIDDEN_ATTR);
    if (el instanceof HTMLElement) {
      el.style.removeProperty('display');
    }
    if (el instanceof HTMLOptionElement) el.hidden = false;
  });
  // Sweep trimOrphanSeparators text mutations. These leaves had their
  // textContent rewritten ("UA  |  " → "UA") in-place because the
  // separator shared a text node with the language label; the original
  // sits in ORIGINAL_TEXT_ATTR so restore puts the text back verbatim.
  document.querySelectorAll(`[${ORIGINAL_TEXT_ATTR}]`).forEach((el) => {
    const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
    el.removeAttribute(ORIGINAL_TEXT_ATTR);
    if (original !== null && el instanceof HTMLElement) {
      el.textContent = original;
    }
  });
  // Detach every survivor tooltip — the picker links they explained are
  // about to be restored, so the explanation is stale. detachAllTooltips
  // sweeps via the host marker attribute (`data-movar-tooltip`).
  detachAllTooltips();
  // Clear per-picker "user restored this container" markers. The global
  // "Show everything" sweep is a stronger statement than any per-picker
  // restore, so we reset the picker-level memory too — otherwise a
  // container marked restored here would never get re-filtered after the
  // popup-driven sweep finishes.
  document.querySelectorAll(`[${RESTORED_ATTR}]`).forEach((el) => {
    el.removeAttribute(RESTORED_ATTR);
  });
  // Drop the content-filter bookkeeping (BLURRED/CHECKED) so a future
  // applyContentFilter pass can re-blur the same cards if filtering comes
  // back on. Per-card REVEALED_ATTR survives — those are explicit user
  // "Show" clicks we should never undo.
  clearAllContentMarks();
}

function restoreAll(): void {
  userOverride = true;
  // Order matters: revealAllBlurred reads BLURRED_ATTR to know which cards
  // to mark REVEALED, so it has to run before clearAllModifications strips
  // that mark. REVEALED is what tells future applyContentFilter passes to
  // skip these cards — without it, the MutationObserver would re-blur them
  // the next time YouTube re-renders the grid. clearAllModifications then
  // sweeps the picker hides and any other curtains.
  revealAllBlurred();
  clearAllModifications();
}

/**
 * URL-scoped loop guard. We store the URL we last redirected FROM in
 * sessionStorage; if we wake up on the same URL after a navigation/reload, we
 * bail to avoid bouncing. Cleared whenever we land on a non-blocked page (the
 * previous attempt succeeded). A different key from the old binary
 * 'movar:redirected' flag, so any stale value from older versions is ignored.
 */
const ATTEMPT_KEY = 'movar:redirectedFrom';

function recentlyAttemptedHere(): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY) === location.href;
  } catch {
    return false;
  }
}

function markAttempt(): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, location.href);
  } catch {
    // sessionStorage unavailable (e.g. private mode) — accept loop risk.
  }
}

function clearAttempt(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
    // Also wipe the obsolete key from older builds so users on stuck tabs
    // recover after upgrading without needing to clear storage manually.
    sessionStorage.removeItem('movar:redirected');
  } catch {
    // ignored
  }
}

async function isPaused(): Promise<boolean> {
  return (await getPauseState()).paused;
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  return allowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

async function record(
  mechanism: CorrectionEvent['mechanism'],
  fromLang: LanguageCode,
  toLang: LanguageCode,
): Promise<void> {
  await logCorrection({
    timestamp: Date.now(),
    domain: location.hostname,
    mechanism,
    fromLang,
    toLang,
  });
}

function whenDomReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

const STRATEGY_MECHANISM: Record<string, CorrectionEvent['mechanism']> = {
  cookie: 'cookie',
  localStorage: 'localStorage',
  searchParams: 'search',
};

// Small switch over CorrectionEvent.mechanism kinds; flattening into a map
// removes one branch without changing readability.
// fallow-ignore-next-line complexity
function mechanismForStrategy(rule: SiteRule): CorrectionEvent['mechanism'] {
  // Best-effort label for the dashboard. Compound reports its dominant step.
  const s = rule.strategy;
  const head = s.type === 'compound' ? s.steps[0]?.type : s.type;
  return (head && STRATEGY_MECHANISM[head]) ?? 'redirect';
}

/** Returns true if a navigation/reload was triggered and the page is unloading. */
// Guards are sequential (recent-attempt → applied-steps → reload-vs-navigate);
// splitting just shifts the chain.
// fallow-ignore-next-line complexity
async function tryStrategySwitch(
  rule: SiteRule,
  pageLang: LanguageCode,
  target: LanguageCode,
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  const outcome = applyStrategy(rule.strategy, target);
  if (outcome.appliedSteps === 0) return false;

  markAttempt();
  await record(mechanismForStrategy(rule), pageLang, target);

  if (!outcome.navigated && outcome.needsReload) {
    location.reload();
    return true;
  }
  return outcome.navigated;
}

/** Generic hreflang fallback when no rule exists. Works on any site that
 *  publishes <link rel="alternate" hreflang="..."> for the target language. */
async function tryHreflangRedirect(
  pageLang: LanguageCode,
  priority: LanguageCode[],
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  for (const target of priority) {
    const outcome = applyStrategy({ type: 'hreflang' }, target);
    if (outcome.navigated) {
      markAttempt();
      await record('redirect', pageLang, target);
      return true;
    }
  }
  return false;
}

/** Picker-link fallback when no rule and no hreflang got us there. Handles
 *  both anchor- and button-based pickers (the latter for form-POST switchers
 *  like bosch-centre). */
// Anchor vs button are independent code paths; merging them would lose the
// form-POST handling.
// fallow-ignore-next-line complexity
async function tryPickerRedirect(
  pickers: Picker[],
  pageLang: LanguageCode,
  priority: LanguageCode[],
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  const target = pickRedirectTarget(pickers, priority);
  if (!target) return false;

  if (target instanceof HTMLAnchorElement) {
    if (!target.href || target.href === location.href) return false;
    markAttempt();
    await record('redirect', pageLang, priority[0] ?? pageLang);
    location.replace(target.href);
    return true;
  }

  // <button> — let the site's own form-submit / click handler do the work.
  markAttempt();
  await record('redirect', pageLang, priority[0] ?? pageLang);
  target.click();
  return true;
}

/** Returns true if a navigation/reload was triggered and the page is unloading. */
// Strategy ordering (enforce → rule → hreflang → picker) is intentionally
// explicit; collapsing it would hide which fallback fired.
// fallow-ignore-next-line complexity
async function attemptLanguageSwitch(
  settings: MovarSettings,
  rule: SiteRule | undefined,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
): Promise<boolean> {
  // Enforce-mode rules (search engines): fire regardless of pageLang. A
  // Google SERP can have a Ukrainian interface but Russian-language results
  // — page-language detection can't see that. The strategy must be no-op-safe
  // when the URL is already at the target (searchParams is).
  if (rule?.enforce && target && (await tryStrategySwitch(rule, pageLang ?? target, target)))
    return true;

  // Switch off a blocked-language page.
  if (!pageLang || !target || !settings.blocked.includes(pageLang)) return false;

  if (rule) return tryStrategySwitch(rule, pageLang, target);

  // No site-specific rule: try the page's own hreflang map first (most
  // reliable when present), then fall back to clicking the picker link.
  if (await tryHreflangRedirect(pageLang, settings.priority)) return true;
  const pickers = findLanguagePickers();
  if (pickers.length === 0) return false;
  return tryPickerRedirect(pickers, pageLang, settings.priority);
}

/** Strip unwanted-language entries from any visible language pickers and log
 *  one correction event per distinct hidden language. */
// Set-dedup loop + early returns; cyclomatic count comes from short-circuits,
// not nested logic.
// fallow-ignore-next-line complexity
async function filterAndRecordPickers(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
): Promise<void> {
  const pickers = findLanguagePickers();
  if (pickers.length === 0) return;

  // Blocked-only mode is the default: strip languages the user explicitly
  // blocked, leave everything else visible — including languages outside
  // the priority list. This matches the "blocked vs everything-else"
  // mental model and means the picker container itself is never replaced
  // by a chip overlay through this path. Pickers that lose every option
  // to blocking just become empty (children display:none); the consent
  // wall handles the active-switch consent flow separately. The chip
  // overlay remains in the picker.ts code for any future caller that
  // wants the strict-mode collapse signal — but production no longer
  // takes that path by default.
  //
  // The survivor tooltip's "Show hidden options" button does an in-place
  // per-picker restore (picker.ts owns the implementation) and marks the
  // container with `data-movar-restored` so filterPickers skips it on
  // future MutationObserver re-runs. The popup's "Show everything on
  // this page" stays available as the page-wide global sweep.
  const result = filterPickers(pickers, settings.priority, { blocked: settings.blocked });
  if (result.hiddenLinks.length === 0) return;

  const preferred = target ?? pageLang ?? '';
  const seen = new Set<LanguageCode>();
  for (const link of result.hiddenLinks) {
    if (seen.has(link.language)) continue;
    seen.add(link.language);
    await record('dom', link.language, preferred);
  }
}

/** Blur content cards whose title/channel reads as a blocked language
 *  (YouTube + similar — sites with no usable language picker for results). */
// Guards + per-card loop; counts above threshold because of the early-returns,
// not nested branches.
// fallow-ignore-next-line complexity
async function filterAndRecordContent(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
): Promise<void> {
  const contentFilter = getFilterForHost(location.hostname);
  if (!contentFilter || settings.blocked.length === 0) return;
  const blurred = applyContentFilter(contentFilter, settings.blocked);
  const toLang = target ?? pageLang ?? '';
  for (const card of blurred) {
    await record('dom', card.fromLang, toLang);
  }
}

// The per-tick orchestrator; each branch is a documented escape (loop-guard,
// enforce-mode, content-modification flag).
// fallow-ignore-next-line complexity
async function applyOnce(settings: MovarSettings): Promise<boolean> {
  if (userOverride) return false;
  const pageLang = detectPageLanguage();
  const target = settings.priority[0];
  const rule = getRuleForHost(location.hostname);

  // Landed on an OK page — the previous redirect (if any) worked. Drop the
  // loop guard so any future blocked page in this tab can redirect again.
  //
  // Exception: enforce-mode sites (search engines). YouTube's polymer router
  // strips our `&hl=uk&gl=UA` params via history.replaceState after we add
  // them, kicking off a `bare → params → bare → params` loop if the guard
  // gets cleared. The guard staying set + the strategy's URL-equality no-op
  // together break the loop: we apply once, YouTube strips, and on the
  // re-pass we see the bare URL as recently-attempted and bail.
  if (pageLang && !settings.blocked.includes(pageLang) && !rule?.enforce) {
    clearAttempt();
  }

  if (await attemptLanguageSwitch(settings, rule, pageLang, target)) return true;

  if (settings.contentModification) {
    await filterAndRecordPickers(settings, pageLang, target);
    await filterAndRecordContent(settings, pageLang, target);
  }

  return false;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  // Content-script bootstrap: settings load → locale → enabled/allowlist/pause
  // guards → message bridge → observer install. Each step is sequential and
  // reads top-to-bottom.
  // fallow-ignore-next-line complexity
  async main() {
    // `let` rather than `const` because onSettingsChange below reassigns it.
    // The MutationObserver / message-bridge / re-apply paths all read this
    // identifier, so they pick up popup-side toggles without each holding
    // their own snapshot.
    let settings = await getSettings();
    // Resolve once at bootstrap — content-script i18n is module-level by
    // design (curtains are imperative DOM, no React context to thread).
    // New curtains created later in this tab pick up the locale chosen
    // here; existing ones don't retro-update, which is acceptable.
    setContentLocale(resolveLocale(settings.uiLanguage, browser.i18n.getUILanguage()));
    if (!settings.enabled) return;
    if (hostMatchesAllowlist(location.hostname, settings.allowlist)) return;
    if (await isPaused()) return;

    // Popup/options ↔ content-script bridge. Synchronous responses; small payloads.
    browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const msg = raw as MovarMessage | undefined;
      if (!msg) return false;
      switch (msg.type) {
        case 'movar:getHidden': {
          sendResponse(getHiddenSummary());
          return false;
        }
        case 'movar:restoreHidden': {
          restoreAll();
          sendResponse(getHiddenSummary());
          return false;
        }
      }
    });

    // Mirror popup-side setting flips into the page. Without this listener
    // the captured `settings` reference goes stale: the user can uncheck
    // "Hide content in blocked languages" in the popup and watch nothing
    // happen on the page, because the MutationObserver loop keeps reading
    // the boot-time value. Today the listener only handles the content-
    // modification toggle (matches a visible bug); other setting changes
    // still reach the next MutationObserver tick via the updated
    // reference, which is enough for our current call sites.
    onSettingsChange((next) => {
      const previous = settings;
      settings = next;
      // Only the contentModification flip needs an active response today
      // (matches a visible bug — popup toggle, page didn't react). Other
      // setting changes reach the next MutationObserver tick via the updated
      // `settings` reference, which is enough for current call sites.
      if (previous.contentModification === next.contentModification) return;
      if (next.contentModification) {
        // Feature turned back ON — re-apply with the fresh settings. If a
        // prior "Show everything" had set userOverride, clear it: the user
        // just explicitly opted back into filtering, so honour that over
        // the page-scoped override.
        userOverride = false;
        void applyOnce(next);
      } else {
        // Feature turned OFF — undo every DOM modification we made on the
        // page so the user sees the original site immediately. We don't
        // touch userOverride here: that flag belongs to the popup's "Show
        // everything" gesture, not to a settings flip.
        clearAllModifications();
      }
    });

    await whenDomReady();
    if (await applyOnce(settings)) return;

    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (scheduled !== null) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        void applyOnce(settings);
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
