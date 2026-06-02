import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import {
  type CorrectionEvent,
  type HiddenSummary,
  type LanguageCode,
  type MovarMessage,
  type MovarSettings,
} from '@movar/shared';
import { detectLanguageFromText } from '@movar/lang-detect';
import { getRuleForHost, type SiteRule } from '@movar/rules';
import { logCorrection } from '../lib/events';
import { classifyLanguageElement } from '../lib/lang-pickers/classify';
import { findLanguagePickers } from '../lib/lang-pickers/extract';
import { filterPickers } from '../lib/lang-pickers/filter';
import { pickRedirectTarget } from '../lib/lang-pickers/redirect';
import { buildPickerModel } from '../lib/lang-pickers/build-model';
import { ORIGINAL_TEXT_ATTR, RESTORED_ATTR, type Picker } from '../lib/lang-pickers/types';
import { detectPageLanguageFromModel } from '../lib/page-language';
import { sampleVisibleText } from '../lib/page-text';
import { detachAllTooltips, setAllTooltipsColorScheme } from '../lib/tooltip';
import { applyContentFilter, clearAllMarks, revealAllNodes } from '../lib/page-content/conceal';
import { buildModelForHost } from '../lib/page-content/registry';
import '../lib/page-content/google';
import '../lib/page-content/youtube';
import { detachAllCurtains, setAllCurtainsColorScheme } from '../lib/curtain';
import { setCurrentColorScheme } from '../lib/page-mode/context';
import { detectModeForHost } from '../lib/page-mode/registry';
import { watchPageMode } from '../lib/page-mode/observer';
import type { PageMode } from '../lib/page-mode/types';
import { setContentLocale } from '../lib/i18n/content';
import { resolveLocale } from '../lib/i18n/resolve';
import {
  clearAttempt,
  hasAttemptedNavTo,
  markAttempt,
  recentlyAttemptedHere,
} from '../lib/loop-guard';
import { getPauseState } from '../lib/pause';
import { getPickerChoice, recordPickerChoice } from '../lib/session-choice';
import { getSettings, onSettingsChange } from '../lib/settings';
import { applyStrategy, type StrategyContext } from '../lib/strategy';
import { hostMatchesAllowlist } from '../lib/host-match';

const HIDDEN_ATTR = 'data-movar-hidden';

/** True after the user clicks "Show all" — stops the MutationObserver from
 *  re-hiding the picker items we just restored. Resets on page reload. */
let userOverride = false;

/** Currently-detected page color scheme. Read by applyOnce when attaching
 *  new curtains/tooltips; updated by the watchPageMode subscription so
 *  later attachments pick up the live value. Initialised at content-script
 *  bootstrap (see `main()`); kept module-level rather than threaded
 *  through call sites because the orchestrator already passes settings
 *  the same way and any caller would have to re-detect to stay current. */
let pageMode: PageMode = 'light';

/** Picker containers found on the most recent applyOnce pass. The capture-
 *  phase click listener consults this to decide whether a click is on a real
 *  language picker (and therefore an intent to switch this site to that
 *  language) versus an incidental link that happens to classify as a
 *  language — a blog post titled "Read in Russian", a `?lang=ru` deep link.
 *  WeakSet, so removed containers don't pin DOM nodes in memory. */
const knownPickerContainers = new WeakSet<HTMLElement>();

/** True while Movar is itself driving a picker click via tryPickerRedirect's
 *  button branch. The capture-phase listener checks this to avoid recording
 *  "user picked X" when Movar is the one synthesising the click — the user
 *  hasn't expressed any preference, we're just routing them to their global
 *  priority language. Anchor-based pickers go through location.replace and
 *  never fire a click, so the flag is only meaningful for the button branch. */
let movarSimulatedClick = false;

function rememberPickerContainers(pickers: Picker[]): void {
  for (const p of pickers) knownPickerContainers.add(p.container);
}

/** Walk up from `el` to find the nearest ancestor that classifies as a
 *  language element (anchor with hreflang, `<option value="ru">`, etc.).
 *  Stops at <body> to bound the walk. */
// DOM-walking glue exercised by end-to-end Storybook smoke tests; no isolated unit test needed.
// fallow-ignore-next-line complexity
function nearestClassifiedLanguage(el: Element | null): LanguageCode | null {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (cur instanceof HTMLElement) {
      const classified = classifyLanguageElement(cur);
      if (classified) return classified.language;
    }
    cur = cur.parentElement;
  }
  return null;
}

/** True when `el` (or any of its ancestors up to <body>) is a container we
 *  identified as a language picker on the most recent applyOnce pass. */
// DOM-walking glue exercised by end-to-end Storybook smoke tests; no isolated unit test needed.
// fallow-ignore-next-line complexity
function isInsideKnownPicker(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (cur instanceof HTMLElement && knownPickerContainers.has(cur)) return true;
    cur = cur.parentElement;
  }
  return false;
}

/** Capture-phase click handler. Records the language the user chose when a
 *  click lands inside a known picker container. Capture phase so we run
 *  before the site's own picker handlers — they typically navigate via
 *  location.assign, which would lose our chance to record. The handler does
 *  NOT preventDefault; the site's navigation is exactly what we want to
 *  follow. The recorded choice is then consulted by the next applyOnce on
 *  the destination page. */
// Early-return guard chain; complexity is from null-safety checks, not branching logic.
// fallow-ignore-next-line complexity
function handlePickerClickCapture(e: MouseEvent): void {
  if (movarSimulatedClick) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  if (!isInsideKnownPicker(target)) return;
  const lang = nearestClassifiedLanguage(target);
  if (!lang) return;
  recordPickerChoice(location.hostname, lang);
}

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
  // text-divider marker spans (from trimContainerTextSeparators) get
  // replaced with text nodes containing the original separator — the
  // wrapper is structural, so once we're restoring we put the DOM back
  // to the verbatim shape the site rendered.
  document.querySelectorAll(`[${ORIGINAL_TEXT_ATTR}]`).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
    el.removeAttribute(ORIGINAL_TEXT_ATTR);
    if (original === null) return;
    if (el.dataset['movarKind'] === 'text-divider') {
      el.replaceWith(document.createTextNode(original));
    } else {
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
  clearAllMarks();
}

function restoreAll(): void {
  userOverride = true;
  // Order matters: revealAllNodes reads BLURRED_ATTR to know which cards
  // to mark REVEALED, so it has to run before clearAllModifications strips
  // that mark. REVEALED is what tells future applyContentFilter passes to
  // skip these cards — without it, the MutationObserver would re-blur them
  // the next time YouTube re-renders the grid. clearAllModifications then
  // sweeps the picker hides and any other curtains.
  revealAllNodes();
  clearAllModifications();
}

async function isPaused(): Promise<boolean> {
  return (await getPauseState()).paused;
}

/** Partial strategy context that wires the loop guard into hreflang
 *  navigation. `applyStrategy` merges this onto its default DOM-bound
 *  context, so we only override the predicate without restating every
 *  side-effect surface. */
const loopGuardCtx: Partial<StrategyContext> = { isAttemptedUrl: hasAttemptedNavTo };

/** Engine that drove the current applyOnce tick's pageLang detection, or
 *  null when detection came from a sync tier. Set at the top of applyOnce
 *  and consumed by record() so any correction this tick produces carries
 *  the engine in CorrectionEvent.detectionEngine. */
let currentDetectionEngine: string | null = null;

async function record(
  mechanism: CorrectionEvent['mechanism'],
  fromLang: LanguageCode,
  toLang: LanguageCode,
): Promise<void> {
  const event: CorrectionEvent = {
    timestamp: Date.now(),
    domain: location.hostname,
    mechanism,
    fromLang,
    toLang,
  };
  if (currentDetectionEngine) event.detectionEngine = currentDetectionEngine;
  await logCorrection(event);
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
  priority: readonly LanguageCode[],
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  // Pass the full priority list so searchParams params with
  // `joinPreferences: true` (Google's `lr`) can pipe-join every preferred
  // language — single-target leaves still use priority[0] internally.
  const outcome = applyStrategy(rule.strategy, priority, loopGuardCtx);
  if (outcome.appliedSteps === 0) return false;

  const target = priority[0] ?? pageLang;
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
    const outcome = applyStrategy({ type: 'hreflang' }, target, loopGuardCtx);
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
    // Loop guard: refuse to click into a URL we already redirected FROM
    // this session. Sibling-locale URLs on misconfigured sites all share
    // the same `<html lang>`, so following the picker would bounce.
    if (hasAttemptedNavTo(target.href)) return false;
    markAttempt();
    await record('redirect', pageLang, priority[0] ?? pageLang);
    location.replace(target.href);
    return true;
  }

  // <button> — let the site's own form-submit / click handler do the work.
  markAttempt();
  await record('redirect', pageLang, priority[0] ?? pageLang);
  // Suppress the capture-phase click listener — Movar driving this click
  // is not the user expressing a preference for `priority[0]`.
  movarSimulatedClick = true;
  try {
    target.click();
  } finally {
    movarSimulatedClick = false;
  }
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
  pickers: Picker[],
): Promise<boolean> {
  // Enforce-mode rules (search engines): fire regardless of pageLang. A
  // Google SERP can have a Ukrainian interface but Russian-language results
  // — page-language detection can't see that. The strategy must be no-op-safe
  // when the URL is already at the target (searchParams is).
  if (
    rule?.enforce &&
    target &&
    (await tryStrategySwitch(rule, pageLang ?? target, settings.priority))
  )
    return true;

  // Switch off a blocked-language page.
  if (!pageLang || !target || !settings.blocked.includes(pageLang)) return false;

  if (rule) return tryStrategySwitch(rule, pageLang, settings.priority);

  // No site-specific rule: try the page's own hreflang map first (most
  // reliable when present), then fall back to clicking the picker link.
  if (await tryHreflangRedirect(pageLang, settings.priority)) return true;
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
  pickers: Picker[],
): Promise<void> {
  if (pickers.length === 0) return;

  // Blocked-only mode is the default: strip languages the user explicitly
  // blocked, leave everything else visible — including languages outside
  // the priority list. This matches the "blocked vs everything-else"
  // mental model and means the picker container itself is never replaced
  // by a chip overlay through this path. Pickers that lose every option
  // to blocking just become empty (children display:none); the consent
  // wall handles the active-switch consent flow separately. The chip
  // overlay is reserved for the strict keep-only path — production no longer
  // takes that path by default.
  //
  // The survivor tooltip's "Show hidden options" button does an in-place
  // per-picker restore (lang-pickers/filter owns the implementation) and marks the
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
  const contentModel = buildModelForHost(location.hostname);
  if (!contentModel || settings.blocked.length === 0) return;
  const blurred = applyContentFilter(contentModel, settings.blocked);
  const toLang = target ?? pageLang ?? '';
  for (const card of blurred) {
    await record('dom', card.fromLang, toLang);
  }
}

/** ms allotted to the tier-7 async engine call. Aborts the orchestrator's
 *  await; in-flight engine work (especially chrome-ai's first session
 *  warmup) keeps running past the deadline so the next applyOnce tick reuses
 *  the warm session. See docs/on-device-language-detection.md (Concurrency). */
const TIER7_TIMEOUT_MS = 150;

/** True while applyOnce is mid-tick. The MutationObserver fires the next tick
 *  150 ms after a mutation, and a slow tier-7 call could let two ticks race.
 *  The guard drops overlapping calls — the next mutation triggers a fresh
 *  apply with the latest DOM, so dropped ticks aren't lost. */
let applyingInFlight = false;

// The per-tick orchestrator; each branch is a documented escape (loop-guard,
// enforce-mode, content-modification flag).
// fallow-ignore-next-line complexity
async function applyOnce(settings: MovarSettings): Promise<boolean> {
  if (applyingInFlight) return false;
  applyingInFlight = true;
  currentDetectionEngine = null;
  try {
    return await applyOnceInner(settings);
  } finally {
    applyingInFlight = false;
    currentDetectionEngine = null;
  }
}

// fallow-ignore-next-line complexity
async function applyOnceInner(settings: MovarSettings): Promise<boolean> {
  if (userOverride) return false;
  // Build the model once — one DOM walk covers both pageLang detection and
  // picker filtering; remembering the containers here also powers the
  // capture-phase click listener's "is this a real picker click" check.
  const pickerModel = buildPickerModel(findLanguagePickers(), location.href);
  const pickers = pickerModel.pickers;
  let pageLang = detectPageLanguageFromModel(pickerModel);
  // Tier-7: when the sync chain returned null, sample the visible body text
  // and run it through the engine roster (chrome-ai → franc-min). Budget is
  // 150 ms; engines that exceed it return null and the next applyOnce tick
  // benefits from the warm engine state. Engine id flows into record() so
  // tier-7 corrections carry CorrectionEvent.detectionEngine.
  if (!pageLang) {
    const sample = sampleVisibleText(document);
    if (sample) {
      const detected = await detectLanguageFromText(sample, {
        signal: AbortSignal.timeout(TIER7_TIMEOUT_MS),
      });
      if (detected) {
        pageLang = detected.language;
        currentDetectionEngine = detected.engine;
      }
    }
  }
  const target = settings.priority[0];
  const rule = getRuleForHost(location.hostname);
  rememberPickerContainers(pickers);

  // User clicked the site's own picker earlier this session and the page is
  // now serving that exact language — they got what they asked for. Auto-
  // switching would undo their click; filtering the picker would hide the
  // entries they just used. Bail before anything else fires. We do this
  // AFTER refreshing knownPickerContainers so a follow-up picker click on
  // this page still gets recorded (lets the user revise their choice).
  const sessionChoice = getPickerChoice(location.hostname);
  if (sessionChoice && pageLang === sessionChoice) return false;

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

  if (await attemptLanguageSwitch(settings, rule, pageLang, target, pickers)) return true;

  if (settings.contentModification) {
    await filterAndRecordPickers(settings, pageLang, target, pickers);
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

    // Detect the host page's color scheme once at bootstrap so the first
    // applyOnce pass paints overlays in matching light/dark; install a
    // watcher that flips both the context (used by future attachments)
    // and the live overlays already on the page when the page (or OS)
    // toggles theme. Runs AFTER the enabled/allowlist/pause gates so we
    // don't install a watcher on tabs we're inert on.
    pageMode = detectModeForHost(location.hostname);
    setCurrentColorScheme(pageMode);
    watchPageMode(
      () => detectModeForHost(location.hostname),
      (next) => {
        pageMode = next;
        setCurrentColorScheme(next);
        setAllCurtainsColorScheme(next);
        setAllTooltipsColorScheme(next);
      },
    );

    // Capture-phase so we record before the site's own picker handler
    // navigates away. Only "trusted" events count — synthetic clicks fired by
    // page scripts shouldn't be interpreted as a real user choice.
    document.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted) return;
        handlePickerClickCapture(e);
      },
      { capture: true },
    );

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
