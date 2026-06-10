import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import type { MovarSettings } from '@movar/settings';
import type { HiddenSummary, MovarMessage } from './messaging';
import { chromeAiEngine, detectLanguageFromTextWith } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { backgroundFrancEngine, warmBackgroundFranc } from './lang-detect-bridge';
import { getRuleForHost } from '../sites/registry';
import { logCorrection, logCorrections } from './events';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { buildPickerModel } from '@movar/lang-pickers/build-model';
import type { Picker } from '@movar/lang-pickers/types';
import { detectPageLanguageFromModel } from '@movar/page-language';
import { sampleVisibleText } from './page-text';
import type { ContentCorrection, ContentModificationContext } from '../dynamic/features/conceal';
import type { ProvisionedContentPresenter } from '../dynamic/features/curtain-ui';
import { contentLocaleChanged, resolveLocale } from './i18n/resolve';
import { provisionCapabilities } from './capability-loader';
import type { ConcealFeatureModule, ProvisionedCapabilityModules } from './capability-loader';
import { resolveNeeds } from './capabilities';
import type { CapabilityNeeds } from './capabilities';
import { reactToSettingsChange } from './settings-reaction';
import { clearAttempt, hasAttemptedNavTo, markAttempt, recentlyAttemptedHere } from './loop-guard';
import { getPauseState } from './pause';
import { getPickerChoice, recordPickerChoice } from './session-choice';
import { getSettings, onSettingsChange, setSettings } from './settings';
import { applyStrategy } from './strategy';
import type { StrategyContext } from './strategy';
import { hostMatchesAllowlist } from './host-match';
import { pickerChoiceForTarget } from './picker-click';
import { buildHiddenSummary } from './hidden-summary';
import { attemptLanguageSwitch } from './language-switch';
import type { LanguageSwitchDeps } from './language-switch';

/** True after the user clicks "Show all" — stops the MutationObserver from
 *  re-hiding the picker items we just restored. Resets on page reload. */
let userOverride = false;

/** Loaded structural concealment facade. It is separate from the optional
 *  presenter: hide mode needs this module but must not load curtain UI bytes. */
let concealModule: ConcealFeatureModule | null = null;

/** Live curtain/tooltip presenter, only while the current capability set needs
 *  `features/curtain-ui.js`. Revocation tears down its page-mode watcher and
 *  presentation DOM. */
let activePresenter: ProvisionedContentPresenter | null = null;

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
  invalidateInFlightApplies();
  userOverride = true;
  // No-op when the conceal chunk was never loaded: nothing can be concealed unless
  // applyContentModification ran, and that is the only thing that loads the chunk.
  if (concealModule) concealModule.revealAllContent(activePresenter ?? undefined);
  revokePresenter();
}

function revokePresenter(): void {
  activePresenter?.teardown();
  activePresenter = null;
}

function teardownContentModification(): void {
  if (concealModule) concealModule.teardownContentModification(activePresenter ?? undefined);
  revokePresenter();
}

async function provisionPresenter(
  settings: MovarSettings,
  presenterModule: Awaited<ReturnType<typeof provisionCapabilities>>['presenter'],
): Promise<ProvisionedContentPresenter | null> {
  const locale = resolveLocale(settings.uiLanguage, browser.i18n.getUILanguage());
  if (activePresenter) {
    await activePresenter.setLocale(locale);
    return activePresenter;
  }
  if (!presenterModule) return null;
  try {
    activePresenter = await presenterModule.createContentPresenter({
      host: location.hostname,
      locale,
    });
  } catch {
    activePresenter = null;
  }
  return activePresenter;
}

function rememberConcealModule(mod: ConcealFeatureModule | null): ConcealFeatureModule | null {
  const next = mod ?? concealModule;
  if (next) concealModule = next;
  return next;
}

function revokePresenterWhenUnneeded(needs: CapabilityNeeds): void {
  if (needs.presenter === null) revokePresenter();
}

async function resolvePresenterForNeeds(
  settings: MovarSettings,
  needs: CapabilityNeeds,
  presenterModule: ProvisionedCapabilityModules['presenter'],
): Promise<ProvisionedContentPresenter | undefined> {
  if (needs.presenter === null) return undefined;
  return (await provisionPresenter(settings, presenterModule)) ?? undefined;
}

function presentationContext(
  needs: CapabilityNeeds,
  presenter: ProvisionedContentPresenter | undefined,
): Partial<Pick<ContentModificationContext, 'presenter' | 'cleanupPresenter'>> {
  if (presenter) return { presenter };
  if (needs.presenter === null && activePresenter) return { cleanupPresenter: activePresenter };
  return {};
}

async function buildContentModificationContext(
  settings: MovarSettings,
  needs: CapabilityNeeds,
  modules: ProvisionedCapabilityModules,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  pickers: Picker[],
): Promise<ContentModificationContext> {
  const presenter = await resolvePresenterForNeeds(settings, needs, modules.presenter);
  return {
    settings,
    pageLang,
    target,
    pickers,
    model: modules.model?.extract(document) ?? null,
    onHideAll: () => void persistConcealHide(),
    ...presentationContext(needs, presenter),
  };
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

/** Monotonically-increasing epoch. Incremented whenever a settings change or
 *  restoreAll() invalidates any in-flight apply tick, so a tick that resumes
 *  after an await can detect it is now stale and abort before touching the DOM. */
let applyGeneration = 0;
function invalidateInFlightApplies(): void {
  applyGeneration += 1;
}

// The per-tick orchestrator; each branch is a documented escape (loop-guard,
// enforce-mode, content-modification flag).
// fallow-ignore-next-line complexity
async function applyOnce(settings: MovarSettings): Promise<boolean> {
  if (applyingInFlight) return false;
  applyingInFlight = true;
  const generation = applyGeneration;
  currentDetectionEngine = null;
  try {
    return await applyOnceInner(settings, generation);
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

async function applyContentCapabilities(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  pickers: Picker[],
  generation: number,
): Promise<void> {
  const needs = resolveNeeds(location.hostname, settings);
  const modules = await provisionCapabilities(needs);
  // A settings change (or restoreAll) landed while the chunk was loading;
  // abort before building context, creating a presenter, or concealing anything.
  if (generation !== applyGeneration) return;
  const mod = rememberConcealModule(modules.conceal);
  if (!mod) {
    revokePresenterWhenUnneeded(needs);
    return;
  }

  const ctx = await buildContentModificationContext(
    settings,
    needs,
    modules,
    pageLang,
    target,
    pickers,
  );
  // A settings change landed during presenter provisioning; tear down the
  // presenter this tick just created and skip applying concealment.
  if (generation !== applyGeneration) {
    revokePresenter();
    return;
  }
  // NOTE: a change landing during franc's classify round-trip INSIDE
  // mod.applyContentModification is a narrower window not covered here
  // (would require threading the token into the facade) — intentionally out of scope.
  const corrections = await mod.applyContentModification(ctx);
  await recordContentCorrections(corrections);
  revokePresenterWhenUnneeded(needs);
}

// Sequential per-tick pipeline: build the picker model once, tier-7 async text
// fallback, session-choice bail, loop-guard clear, then the switch/filter
// action branches — each step feeds the next.
// fallow-ignore-next-line complexity
async function applyOnceInner(settings: MovarSettings, generation: number): Promise<boolean> {
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

  if (settings.contentModification)
    await applyContentCapabilities(settings, pageLang, target, pickers, generation);

  return false;
}

/** Mutable settings holder shared by the bootstrap's listeners. `main` seeds
 *  `current`; the onSettingsChange listener rewrites it and the MutationObserver
 *  reads it, so both see popup-side toggles without each holding their own
 *  snapshot (the role the closed-over `let settings` used to play). */
interface LiveSettings {
  current: MovarSettings;
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
 *  Without this listener two things go stale: the held `settings` and any live
 *  presenter strings. The pure reaction decides whether to teardown, re-apply,
 *  or both; this function applies that verdict against the loaded capabilities. */
function installSettingsListener(live: LiveSettings): void {
  onSettingsChange((next) => {
    invalidateInFlightApplies();
    const previous = live.current;
    live.current = next;

    const browserUiLang = browser.i18n.getUILanguage();
    const localeChanged = contentLocaleChanged(previous.uiLanguage, next.uiLanguage, browserUiLang);
    const reaction = reactToSettingsChange(previous, next, localeChanged, userOverride);
    userOverride = reaction.userOverride;
    if (reaction.teardown) {
      teardownContentModification();
    } else if (localeChanged && activePresenter) {
      void activePresenter.setLocale(resolveLocale(next.uiLanguage, browserUiLang));
    }
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

export interface ContentRuntime {
  applyOnce: typeof applyOnce;
  getHiddenSummary: typeof getHiddenSummary;
  handlePickerClickCapture: typeof handlePickerClickCapture;
  restoreAll: typeof restoreAll;
  rememberPickerContainers: typeof rememberPickerContainers;
  installMessageBridge: typeof installMessageBridge;
  installSettingsListener: typeof installSettingsListener;
  main: typeof main;
}

export function createContentRuntime(): ContentRuntime {
  return {
    applyOnce,
    getHiddenSummary,
    handlePickerClickCapture,
    restoreAll,
    rememberPickerContainers,
    installMessageBridge,
    installSettingsListener,
    main,
  };
}

// Content-script bootstrap: settings load → enabled/allowlist/pause guards →
// watcher/listeners/bridge install → first apply → observer. Each step is
// sequential and reads top-to-bottom. The remaining branching is the inert-tab
// guard chain.
// fallow-ignore-next-line complexity
async function main(): Promise<void> {
  const live: LiveSettings = { current: await getSettings() };
  if (!live.current.enabled) return;
  if (hostMatchesAllowlist(location.hostname, live.current.allowlist)) return;
  if (await isPaused()) return;

  // Wake the background worker and warm franc's tables now (fire-and-forget):
  // tier-7 and the content filter both reach franc by message, and warming it
  // before the first need keeps the worker cold-start off the 150 ms tier-7
  // budget.
  void warmBackgroundFranc();

  installPickerClickListener();
  installMessageBridge();
  installSettingsListener(live);

  await whenDomReady();
  if (await applyOnce(live.current)) return;
  installMutationObserver(live);
}
