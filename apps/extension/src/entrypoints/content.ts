import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import type { MovarSettings } from '@movar/settings';
import type { HiddenSummary, MovarMessage } from '../lib/messaging';
import { chromeAiEngine, detectLanguageFromTextWith } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { backgroundFrancEngine, warmBackgroundFranc } from '../lib/lang-detect-bridge';
import { getRuleForHost } from '@movar/rules';
import type { SiteRule } from '@movar/rules';
import { logCorrection } from '../lib/events';
import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { pickRedirectTarget } from '@movar/lang-pickers/redirect';
import { buildPickerModel } from '@movar/lang-pickers/build-model';
import type { Picker } from '@movar/lang-pickers/types';
import { detectPageLanguageFromModel } from '@movar/page-language';
import { sampleVisibleText } from '../lib/page-text';
import {
  applyContentModification,
  revealAllContent,
  setContentModificationColorScheme,
  teardownContentModification,
} from '../lib/content-modification';
import { setCurrentColorScheme } from '@movar/page-mode/context';
import { detectModeForHost } from '@movar/page-mode/registry';
import { watchPageMode } from '@movar/page-mode/observer';
import type { PageMode } from '@movar/page-mode/types';
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
import { applyStrategy } from '../lib/strategy';
import type { StrategyContext } from '../lib/strategy';
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
  if (lang == null) return;
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
  // Content cards concealed by the page-content filter — blurred (curtain,
  // data-movar-content-blurred) or hard-hidden (display:none, data-movar-hidden
  // with a "content-filter:…" reason). Picker hides use the "not-in-priority"
  // reason and are counted via `languages` above, so the prefix selector keeps
  // the two channels from double-counting.
  const feedCards =
    document.querySelectorAll('[data-movar-content-blurred]').length +
    document.querySelectorAll(`[${HIDDEN_ATTR}^="content-filter"]`).length;
  return {
    languages: [...languages].toSorted((a, b) => a.localeCompare(b)),
    containers,
    feedCards,
    pageLang: lastPageLang,
    userOverride,
  };
}

/** "Show everything on this page" — reveal every concealed card and undo all
 *  picker/content hides. Sets the page-scoped override so the MutationObserver
 *  stops re-hiding what we just restored; the content-modification facade owns
 *  the reveal-then-teardown ordering. */
function restoreAll(): void {
  userOverride = true;
  revealAllContent();
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

/** Language detected on the most recent applyOnce pass, surfaced to the popup
 *  via getHiddenSummary so the hero can report "this page is in X" without the
 *  popup re-running detection. Updated each tick; survives early-return ticks
 *  (userOverride) with its last value, which is the right "what's on screen now"
 *  answer. Module-level for the same reason `settings` is — the message bridge
 *  reads it synchronously when the popup asks. */
let lastPageLang: LanguageCode | null = null;

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
  if (currentDetectionEngine != null) event.detectionEngine = currentDetectionEngine;
  await logCorrection(event);
}

async function whenDomReady(): Promise<void> {
  if (document.readyState !== 'loading') return;
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
    rule?.enforce === true &&
    target != null &&
    (await tryStrategySwitch(rule, pageLang ?? target, settings.priority))
  )
    return true;

  // Switch off a blocked-language page.
  if (pageLang == null || target == null || !settings.blocked.includes(pageLang)) return false;

  if (rule) return tryStrategySwitch(rule, pageLang, settings.priority);

  // No site-specific rule: try the page's own hreflang map first (most
  // reliable when present), then fall back to clicking the picker link.
  if (await tryHreflangRedirect(pageLang, settings.priority)) return true;
  if (pickers.length === 0) return false;
  return tryPickerRedirect(pickers, pageLang, settings.priority);
}

/** ms allotted to the tier-7 async engine call. Aborts the orchestrator's
 *  await; in-flight engine work (especially chrome-ai's first session
 *  warmup) keeps running past the deadline so the next applyOnce tick reuses
 *  the warm session. See docs/on-device-language-detection.md (Concurrency). */
const TIER7_TIMEOUT_MS = 150;

/** Tier-7 engine roster. chrome-ai (Gemini Nano) runs in-page — its
 *  LanguageDetector API is a window global absent in service workers — then
 *  franc, which now runs in the background worker (backgroundFrancEngine just
 *  messages it). No franc tables in the content bundle: the roster is built from
 *  the franc-free barrel plus the messaging bridge. */
const TIER7_ENGINES = [chromeAiEngine, backgroundFrancEngine];

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

/** Tier-7 fallback: sample the visible body text and run it through the engine
 *  roster (chrome-ai in-page → franc in the background worker) under the 150 ms
 *  budget. On a hit, records the engine id in the module-level
 *  `currentDetectionEngine` (so record() can stamp the correction) and returns
 *  the language. Engines that exceed the budget return null, and the next
 *  applyOnce tick benefits from the warm engine state (a warm worker with
 *  franc's tables already loaded). */
async function detectViaTier7(): Promise<LanguageCode | null> {
  const sample = sampleVisibleText(document);
  if (!sample) return null;
  const detected = await detectLanguageFromTextWith(TIER7_ENGINES, sample, {
    signal: AbortSignal.timeout(TIER7_TIMEOUT_MS),
  });
  if (!detected) return null;
  currentDetectionEngine = detected.engine;
  return detected.language;
}

// Sequential per-tick pipeline: build the picker model once, tier-7 async text
// fallback, session-choice bail, loop-guard clear, then the switch/filter
// action branches — each step feeds the next.
// fallow-ignore-next-line complexity
async function applyOnceInner(settings: MovarSettings): Promise<boolean> {
  if (userOverride) return false;
  // Build the model once — one DOM walk covers both pageLang detection and
  // picker filtering; remembering the containers here also powers the
  // capture-phase click listener's "is this a real picker click" check.
  const pickerModel = buildPickerModel(findLanguagePickers(), location.href);
  const pickers = pickerModel.pickers;
  // Sync chain first; only fall back to the async tier-7 text sniff when it
  // returned null (see detectViaTier7).
  const pageLang = detectPageLanguageFromModel(pickerModel) ?? (await detectViaTier7());
  // Cache for the popup hero (read synchronously by getHiddenSummary). Set
  // once detection has settled for this tick, before any switch navigates away.
  lastPageLang = pageLang;
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
  if (sessionChoice != null && pageLang === sessionChoice) return false;

  // Landed on an OK page — the previous redirect (if any) worked. Drop the
  // loop guard so any future blocked page in this tab can redirect again.
  //
  // Exception: enforce-mode sites (search engines). YouTube's polymer router
  // strips our `&hl=uk&gl=UA` params via history.replaceState after we add
  // them, kicking off a `bare → params → bare → params` loop if the guard
  // gets cleared. The guard staying set + the strategy's URL-equality no-op
  // together break the loop: we apply once, YouTube strips, and on the
  // re-pass we see the bare URL as recently-attempted and bail.
  if (pageLang != null && !settings.blocked.includes(pageLang) && rule?.enforce !== true) {
    clearAttempt();
  }

  if (await attemptLanguageSwitch(settings, rule, pageLang, target, pickers)) return true;

  if (settings.contentModification) {
    await applyContentModification({ settings, pageLang, target, pickers, record });
  }

  return false;
}

/** Mutable settings holder shared by the bootstrap's listeners. `main` seeds
 *  `current`; the onSettingsChange listener rewrites it and the MutationObserver
 *  reads it, so both see popup-side toggles without each holding their own
 *  snapshot (the role the closed-over `let settings` used to play). */
interface LiveSettings {
  current: MovarSettings;
}

/** Detect the host page's color scheme once and install a watcher that flips
 *  both the context (used by future curtain/tooltip attachments) and the live
 *  overlays already on the page when the page (or OS) toggles theme. Seeds the
 *  module-level `pageMode` so the first applyOnce pass paints in matching
 *  light/dark. Call AFTER the enabled/allowlist/pause gates so we don't install
 *  a watcher on tabs we're inert on. */
function installPageModeWatcher(): void {
  pageMode = detectModeForHost(location.hostname);
  setCurrentColorScheme(pageMode);
  watchPageMode(
    () => detectModeForHost(location.hostname),
    (next) => {
      pageMode = next;
      setCurrentColorScheme(next);
      setContentModificationColorScheme(next);
    },
  );
}

/** Capture-phase click listener that records the user's picker choice before
 *  the site's own handler navigates away. Only "trusted" events count —
 *  synthetic clicks fired by page scripts shouldn't read as a real user
 *  choice. */
function installPickerClickListener(): void {
  document.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted) return;
      handlePickerClickCapture(e);
    },
    { capture: true },
  );
}

/** Popup/options ↔ content-script bridge. Synchronous responses; small
 *  payloads. A dispatch map keeps the listener flat as message types grow, and
 *  `Partial` preserves the "ignore unknown messages" safety (other extensions
 *  can post into this listener) the old switch had via fall-through. */
function installMessageBridge(): void {
  const messageHandlers: Partial<Record<MovarMessage['type'], (msg: MovarMessage) => unknown>> = {
    'movar:getHidden': () => getHiddenSummary(),
    'movar:restoreHidden': () => {
      restoreAll();
      return getHiddenSummary();
    },
  };
  // Always returns `false` by contract: the WebExtension onMessage protocol
  // reads the return value as "do I keep the message channel open for an
  // async sendResponse?". We answer synchronously via `sendResponse`, so
  // every path must return a non-`true` value — the invariant is the API,
  // not dead logic.
  // eslint-disable-next-line sonarjs/no-invariant-returns -- constant `false` is the WebExtension onMessage contract for synchronous responders (true/Promise would mean "channel stays open for async reply")
  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as MovarMessage | undefined;
    if (!msg) return false;
    const handler = messageHandlers[msg.type];
    if (!handler) return false;
    sendResponse(handler(msg));
    return false;
  });
}

/** Mirror popup-side setting flips into the page. Without this listener the
 *  held `settings` go stale: the user can uncheck "Hide content in blocked
 *  languages" in the popup and watch nothing happen, because the
 *  MutationObserver loop keeps reading the boot-time value. Today only the
 *  contentModification flip needs an active response (matches a visible bug);
 *  other setting changes reach the next MutationObserver tick via the updated
 *  `live.current`, which is enough for current call sites. */
function installSettingsListener(live: LiveSettings): void {
  onSettingsChange((next) => {
    const previous = live.current;
    live.current = next;
    if (previous.contentModification === next.contentModification) return;
    if (next.contentModification) {
      // Feature turned back ON — re-apply with the fresh settings. If a prior
      // "Show everything" had set userOverride, clear it: the user just
      // explicitly opted back into filtering, so honour that over the
      // page-scoped override.
      userOverride = false;
      void applyOnce(next);
    } else {
      // Feature turned OFF — undo every DOM modification we made on the page so
      // the user sees the original site immediately. We don't touch userOverride
      // here: that flag belongs to the popup's "Show everything" gesture, not to
      // a settings flip.
      teardownContentModification();
    }
  });
}

/** Debounced MutationObserver that re-runs applyOnce as the page mutates,
 *  always with the latest settings (read from `live.current`). The debounce
 *  coalesces rapid DOM mutations (e.g. lazy-loaded cards) into a single call. */
function installMutationObserver(live: LiveSettings): void {
  const MUTATION_DEBOUNCE_MS = 150;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (scheduled !== null) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      void applyOnce(live.current);
    }, MUTATION_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  // Content-script bootstrap: settings load → locale → enabled/allowlist/pause
  // guards → watcher/listeners/bridge install → first apply → observer. Each
  // step is sequential and reads top-to-bottom. The remaining branching is the
  // inert-tab guard chain; the orchestration is exercised by the content-script
  // integration suite, not isolated unit tests.
  // fallow-ignore-next-line complexity
  async main() {
    const live: LiveSettings = { current: await getSettings() };
    // Resolve once at bootstrap — content-script i18n is module-level by
    // design (curtains are imperative DOM, no React context to thread).
    // New curtains created later in this tab pick up the locale chosen
    // here; existing ones don't retro-update, which is acceptable.
    setContentLocale(resolveLocale(live.current.uiLanguage, browser.i18n.getUILanguage()));
    if (!live.current.enabled) return;
    if (hostMatchesAllowlist(location.hostname, live.current.allowlist)) return;
    if (await isPaused()) return;

    // Wake the background worker and warm franc's tables now (fire-and-forget):
    // tier-7 and the content filter both reach franc by message, and warming it
    // before the first need keeps the worker cold-start off the 150 ms tier-7
    // budget.
    void warmBackgroundFranc();

    installPageModeWatcher();
    installPickerClickListener();
    installMessageBridge();
    installSettingsListener(live);

    await whenDomReady();
    if (await applyOnce(live.current)) return;
    installMutationObserver(live);
  },
});
