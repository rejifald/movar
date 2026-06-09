import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import type { MovarSettings } from '@movar/settings';
import type { HiddenSummary, MovarMessage } from '../lib/messaging';
import { chromeAiEngine, detectLanguageFromTextWith } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { backgroundFrancEngine, warmBackgroundFranc } from '../lib/lang-detect-bridge';
import { getRuleForHost } from '@movar/rules';
import { logCorrection, logCorrections } from '../lib/events';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
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
import type { ContentCorrection } from '../lib/content-modification';
import { setCurrentColorScheme } from '@movar/page-mode/context';
import { detectModeForHost } from '@movar/page-mode/registry';
import { watchPageMode } from '@movar/page-mode/observer';
import type { PageMode } from '@movar/page-mode/types';
import { setContentLocale } from '../lib/i18n/content';
import { contentLocaleChanged, resolveLocale } from '../lib/i18n/resolve';
import { reactToSettingsChange } from '../lib/settings-reaction';
import {
  clearAttempt,
  hasAttemptedNavTo,
  markAttempt,
  recentlyAttemptedHere,
} from '../lib/loop-guard';
import { getPauseState } from '../lib/pause';
import { getPickerChoice, recordPickerChoice } from '../lib/session-choice';
import { getSettings, onSettingsChange, setSettings } from '../lib/settings';
import { applyStrategy } from '../lib/strategy';
import type { StrategyContext } from '../lib/strategy';
import { hostMatchesAllowlist } from '../lib/host-match';
import { pickerChoiceForTarget } from '../lib/picker-click';
import { buildHiddenSummary } from '../lib/hidden-summary';
import { attemptLanguageSwitch } from '../lib/language-switch';
import type { LanguageSwitchDeps } from '../lib/language-switch';

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

/** Capture-phase click handler. Records the language the user chose when a
 *  click lands inside a known picker container (the decision lives in
 *  `pickerChoiceForTarget`). Capture phase so we run before the site's own
 *  picker handlers — they typically navigate via location.assign, which would
 *  lose our chance to record. The handler does NOT preventDefault; the site's
 *  navigation is exactly what we want to follow. The recorded choice is then
 *  consulted by the next applyOnce on the destination page. */
function handlePickerClickCapture(e: MouseEvent): void {
  if (movarSimulatedClick) return;
  const target = e.target instanceof Element ? e.target : null;
  const lang = pickerChoiceForTarget(target, knownPickerContainers);
  if (lang == null) return;
  recordPickerChoice(location.hostname, lang);
}

function getHiddenSummary(): HiddenSummary {
  return buildHiddenSummary(document, { pageLang: lastPageLang, userOverride });
}

/** "Show everything on this page" — reveal every concealed card and undo all
 *  picker/content hides. Sets the page-scoped override so the MutationObserver
 *  stops re-hiding what we just restored; the content-modification facade owns
 *  the reveal-then-teardown ordering. */
function restoreAll(): void {
  userOverride = true;
  revealAllContent();
}

/** Persist 'hide' as the standing conceal-mode preference — invoked by a blur
 *  curtain's "Hide all" action via the content-modification context. Reads the
 *  latest settings before writing rather than the apply-tick snapshot (which may
 *  be stale by the time the user clicks), so it can't clobber an unrelated
 *  change. The storage-change listener mirrors the new mode back into this page
 *  (settings-reaction → re-apply); the curtain action already escalated the
 *  visible cards synchronously, so this just makes the choice durable. */
async function persistConcealHide(): Promise<void> {
  const current = await getSettings();
  if (current.concealMode === 'hide') return;
  await setSettings({ ...current, concealMode: 'hide' });
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

function buildCorrectionEvent(
  mechanism: CorrectionEvent['mechanism'],
  fromLang: LanguageCode,
  toLang: LanguageCode,
): CorrectionEvent {
  const event: CorrectionEvent = {
    timestamp: Date.now(),
    domain: location.hostname,
    mechanism,
    fromLang,
    toLang,
  };
  if (currentDetectionEngine != null) event.detectionEngine = currentDetectionEngine;
  return event;
}

async function record(
  mechanism: CorrectionEvent['mechanism'],
  fromLang: LanguageCode,
  toLang: LanguageCode,
): Promise<void> {
  await logCorrection(buildCorrectionEvent(mechanism, fromLang, toLang));
}

/** Batch-log the corrections from one content-modification pass (all 'dom'
 *  mechanism) in a single serialized write. */
async function recordContentCorrections(corrections: readonly ContentCorrection[]): Promise<void> {
  await logCorrections(corrections.map((c) => buildCorrectionEvent('dom', c.fromLang, c.toLang)));
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

/** The side-effect surface the language-switch ladder runs against, bound to the
 *  live content-script state: the loop guard, the correction log, the page's
 *  `location`, and the simulated-click flag. The ladder itself (enforce → rule →
 *  hreflang → picker) lives in the unit-tested `lib/language-switch` module; this
 *  object is the only place those effects are wired to real browser/page state. */
const switchDeps: LanguageSwitchDeps = {
  recentlyAttemptedHere,
  hasAttemptedNavTo,
  markAttempt,
  record,
  applyStrategy,
  loopGuardCtx,
  // Lazy accessors, not a captured `location` reference: this object is built at
  // module load, and the page `location` global only exists in the content
  // script's browser context (WXT's Node-side entrypoint analysis would throw
  // "location is not defined" on an eager capture).
  location: {
    get href(): string {
      return location.href;
    },
    replace: (url: string): void => {
      location.replace(url);
    },
    reload: (): void => {
      location.reload();
    },
  },
  setSimulatedClick: (active) => {
    movarSimulatedClick = active;
  },
};

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

  if (await attemptLanguageSwitch(switchDeps, settings, rule, pageLang, target, pickers))
    return true;

  if (settings.contentModification) {
    const corrections = await applyContentModification({
      settings,
      pageLang,
      target,
      pickers,
      onHideAll: () => void persistConcealHide(),
    });
    await recordContentCorrections(corrections);
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

/** Mirror popup/options-side setting changes into the already-rendered page.
 *  Without this listener two things go stale: the held `settings` (the user
 *  toggles "Hide content in blocked languages" and nothing happens, because the
 *  MutationObserver loop keeps reading the boot-time value) and the on-page
 *  curtains' language (each curtain bakes its catalogue strings in at build
 *  time, so a mid-session UI-language switch strands existing curtains in the
 *  old language). The branching that decides what to do lives in the pure,
 *  unit-tested {@link reactToSettingsChange}; here we just re-point the locale
 *  catalogue and apply its verdict. applyOnce's content-modification pass
 *  `await`s `loadContentMessages()` before building a pill, so a rebuild
 *  refetches the new locale's curtain strings on its own — no loading here. */
function installSettingsListener(live: LiveSettings): void {
  onSettingsChange((next) => {
    const previous = live.current;
    live.current = next;
    // Re-point the catalogue when the *resolved* UI locale changes (an
    // 'auto' → 'auto' edit that resolves the same is a no-op); setContentLocale
    // drops the cached strings so a rebuild refetches the new locale.
    const browserUiLang = browser.i18n.getUILanguage();
    const localeChanged = contentLocaleChanged(previous.uiLanguage, next.uiLanguage, browserUiLang);
    if (localeChanged) setContentLocale(resolveLocale(next.uiLanguage, browserUiLang));

    const reaction = reactToSettingsChange(previous, next, localeChanged, userOverride);
    userOverride = reaction.userOverride;
    if (reaction.teardown) teardownContentModification();
    if (reaction.apply) void applyOnce(next);
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

/** Test seam — exposes the orchestrator entrypoints + listener installers so the
 *  integration suite can drive a single tick (and the popup/settings bridges)
 *  without booting the full `main()`. Not part of the runtime API; each module
 *  import gets fresh module state, so tests isolate via `vi.resetModules()`. */
export const __test = {
  applyOnce,
  getHiddenSummary,
  handlePickerClickCapture,
  restoreAll,
  rememberPickerContainers,
  installMessageBridge,
  installSettingsListener,
  /** Reset the module-level orchestrator state between tests. The WeakSet of
   *  known picker containers is left as-is — tests use fresh DOM nodes, so stale
   *  entries can't match. */
  reset(): void {
    userOverride = false;
    lastPageLang = null;
    currentDetectionEngine = null;
    applyingInFlight = false;
    movarSimulatedClick = false;
    pageMode = 'light';
  },
};

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
