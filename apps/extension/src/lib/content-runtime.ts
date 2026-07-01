import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
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
// Import the pure resolver from the `/resolve` subpath, NOT the package barrel:
// the barrel (index.tsx) pulls in the en/uk message catalogues and the React
// I18nProvider, which esbuild can't tree-shake out of the always-on content
// bundle — that blows the content.js size budget (wxt.config's bundle-guard).
import { contentLocaleChanged, resolveLocale } from '@movar/i18n/resolve';
import { provisionCapabilities } from './capability-loader';
import type { ConcealFeatureModule, ProvisionedCapabilityModules } from './capability-loader';
import { resolveNeeds } from './capabilities';
import type { CapabilityNeeds } from './capabilities';
import { reactToSettingsChange } from './settings-reaction';
import { clearAttempt, hasAttemptedNavTo, markAttempt, recentlyAttemptedHere } from './loop-guard';
import { getPauseState, isHostSnoozed, onPauseChange, onSnoozeChange } from './pause';
import { getPickerChoice, recordPickerChoice } from './session-choice';
import { getSettings, onSettingsChange, setSettings } from './settings';
import { applyStrategy } from './strategy';
import type { StrategyContext } from './strategy';
import { hostMatchesAllowlist } from './host-match';
import { pickerChoiceForTarget } from './picker-click';
import { buildHiddenSummary } from './hidden-summary';
import { attemptLanguageSwitch } from './language-switch';
import type { LanguageSwitchDeps } from './language-switch';
import { isMovarOwnedMutation } from './movar-markers';
import { announce, teardownLiveRegion } from './live-region';
import { getContentMessages, loadContentMessages, setContentLocale } from './i18n/content';
import type { ResolvedLocale } from '@movar/i18n/resolve';

/** True after the user clicks "Show all" — stops the MutationObserver from
 *  re-hiding the picker items we just restored. Resets on page reload. */
let userOverride = false;

/** True while Movar is paused (timed or indefinite). Makes applyOnce a no-op so
 *  the MutationObserver / locationchange ticks do nothing and no redirect or
 *  concealment fires — WITHOUT detaching listeners, so an explicit resume
 *  re-arms the page without a reload. Seeded at bootstrap from the persisted
 *  pause state and flipped by the onPauseChange listener (installPauseListener). */
let pausedActive = false;

/** True while THIS host is snoozed (a timed per-site break, distinct from the
 *  global pause and the permanent allowlist). Same inert-not-detached mechanism
 *  as {@link pausedActive}: applyOnce is a no-op for the window, and an explicit
 *  "Resume now" or the snooze expiring (the background sweep prunes the entry →
 *  storage change → installSnoozeListener) re-arms the page without a reload.
 *  Seeded at bootstrap from the persisted snooze map. */
let snoozedActive = false;

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
  if (concealModule) {
    concealModule.revealAllContent(activePresenter ?? undefined);
    // Announce the reveal to assistive tech (polite, debounced); only meaningful
    // when something was actually concealed, which is exactly when concealModule
    // is loaded.
    announce(getContentMessages().liveRegion.revealed);
  }
  revokePresenter();
}

/** Resolved locale most recently pushed into the content-script i18n module, so
 *  we don't re-fetch the catalogue every tick. `null` until the first conceal
 *  pass. */
let contentLocaleApplied: ResolvedLocale | null = null;

/** Make sure the content-script string catalogue matches the user's locale
 *  before we announce or conceal. The curtain presenter does this too in curtain
 *  mode, but hide mode has no presenter — so without this the live-region
 *  announcement would fall back to English for a Ukrainian user hiding content.
 *  Guarded so it only (re)fetches when the resolved locale actually changes. */
function ensureContentLocale(settings: MovarSettings): void {
  const locale = resolveLocale(settings.uiLanguage, browser.i18n.getUILanguage());
  if (locale === contentLocaleApplied) return;
  contentLocaleApplied = locale;
  setContentLocale(locale);
  void loadContentMessages();
}

function revokePresenter(): void {
  activePresenter?.teardown();
  activePresenter = null;
}

function teardownContentModification(): void {
  if (concealModule) concealModule.teardownContentModification(activePresenter ?? undefined);
  revokePresenter();
  // Concealment is gone — drop the polite live region so a quiet page holds none.
  teardownLiveRegion();
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
  generation: number,
): Promise<ContentModificationContext> {
  const presenter = await resolvePresenterForNeeds(settings, needs, modules.presenter);
  return {
    settings,
    pageLang,
    target,
    pickers,
    model: modules.model?.extract(document) ?? null,
    onHideAll: () => void persistConcealHide(),
    // Close over the tick's epoch so the content (card) pass can detect — after
    // its async classify round-trip inside applyContentModification — that a
    // settings change or "Show everything" superseded this tick, and bail before
    // re-concealing cards the user just revealed.
    isStale: () => generation !== applyGeneration,
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
  if (pausedActive || snoozedActive) return false;
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
  // Locale for the live-region announcement below (and the English-fallback gap
  // in hide mode). Cheap + guarded — only refetches on a real locale change.
  ensureContentLocale(settings);
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
    generation,
  );
  // A settings change landed during presenter provisioning; tear down the
  // presenter this tick just created and skip applying concealment.
  if (generation !== applyGeneration) {
    revokePresenter();
    return;
  }
  // The remaining window — a change landing during the classify round-trip INSIDE
  // mod.applyContentModification — is now guarded by ctx.isStale (the generation
  // closure above), which the content (card) pass checks right after the await and
  // before any conceal. A stale tick resolves to [] here; recordContentCorrections
  // is then a no-op. The picker pass is synchronous and runs before that await, so
  // it is unaffected and not covered by the gate.
  const corrections = await mod.applyContentModification(ctx);
  await recordContentCorrections(corrections);
  // Announce a rolled-up "Movar hid content here" to assistive tech when this
  // pass concealed something new. Debounced in live-region.ts so an
  // infinite-scroll feed's burst of conceal passes collapses to one message.
  if (corrections.length > 0) announce(getContentMessages().liveRegion.concealed);
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

/** ms the MutationObserver coalesces rapid DOM churn (lazy-loaded cards, SPA
 *  hydration) into a single applyOnce. Exported so the observer test references
 *  the same constant rather than hard-coding it. */
export const MUTATION_DEBOUNCE_MS = 150;

/** Build the MutationObserver callback: a debounced, self-aware scheduler.
 *
 *  Two filters before a tick is armed:
 *  1. `isMovarOwnedMutation` — drop batches whose additions are *only* Movar's
 *     own concealment DOM (curtain/tooltip hosts). Every conceal pass appends
 *     those into the observed `document.body` subtree; without this skip each
 *     apply would schedule the next — a self-perpetuating re-walk loop on busy,
 *     mutation-heavy pages (the whole reason this issue exists). In-place hides
 *     Movar performs are attribute mutations the observer doesn't watch, so they
 *     never reach here and can't re-arm the loop either.
 *  2. Debounce — collapse a burst of genuine page mutations into one apply.
 *
 *  Factored out and exported (not the observer wiring) so the skip decision and
 *  the {@link MUTATION_DEBOUNCE_MS} debounce are unit-testable with fake timers,
 *  without standing up the full content-script bootstrap or a live
 *  MutationObserver. `apply` is the side effect (production passes the real
 *  applyOnce; tests pass a spy).
 *
 *  Scoping note: each surviving batch still triggers a *whole-document*
 *  re-walk (`findLanguagePickers` + `buildPickerModel` + the conceal walk).
 *  Narrowing the re-walk to the mutated subtree is deferred: pickers and
 *  blockable content legitimately appear outside the mutated region (sticky
 *  headers, late-hydrating nav), and the first apply (`main`) plus the
 *  settings-change / `userOverride` re-applies must stay full-document. A safe
 *  subtree seam would have to fall back to full whenever the common ancestor of
 *  the added nodes is ambiguous, which is most of the time — net of little
 *  value next to the feedback-loop fix above. */
export function createDebouncedApplyScheduler(
  apply: () => void,
  delayMs: number = MUTATION_DEBOUNCE_MS,
): (records: MutationRecord[]) => void {
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  return (records) => {
    if (isMovarOwnedMutation(records)) return;
    if (scheduled !== null) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      apply();
    }, delayMs);
  };
}

/** Debounced MutationObserver that re-runs applyOnce as the page mutates,
 *  always with the latest settings (read from `live.current`), skipping the
 *  feedback from Movar's own concealment DOM (see
 *  {@link createDebouncedApplyScheduler}). */
function installMutationObserver(live: LiveSettings): void {
  const observer = new MutationObserver(
    createDebouncedApplyScheduler(() => void applyOnce(live.current)),
  );
  observer.observe(document.body, { childList: true, subtree: true });
}

/** React to a client-side (history-API / hash / popstate) URL change within the
 *  same document. The MutationObserver only re-applies on `document.body`
 *  childList mutations, which an SPA route transition (YouTube's polymer router,
 *  Google's instant SERP) need not produce — so enforce-mode rewrites would
 *  silently stop after the first load. This re-runs applyOnce on URL change.
 *
 *  Per-URL reset is gated on a real PATH change (a genuinely new page): both
 *  `userOverride` ("Show everything") and the loop guard are cleared only when
 *  `pathname` changes. A same-path, query-only rewrite is exactly the YouTube
 *  `&hl=uk&gl=UA` param-strip the loop guard exists to break (see
 *  applyOnceInner's enforce-mode note); clearing on it would reopen the
 *  `bare → params → bare` loop AND silently re-conceal content the user just
 *  revealed. So a query-only change re-runs applyOnce but keeps both flags.
 *  (applyOnceInner still self-clears the guard when it lands on an OK page.) */
function handleLocationChange(live: LiveSettings, newUrl: URL, oldUrl: URL): void {
  if (newUrl.href === oldUrl.href) return;
  // A new route invalidates any in-flight tick keyed to the old URL.
  invalidateInFlightApplies();
  if (newUrl.pathname !== oldUrl.pathname) {
    userOverride = false;
    clearAttempt();
  }
  // applyOnce's `applyingInFlight` guard drops this if a tick is mid-flight; the
  // generation bump above means that tick won't write stale DOM for the old URL.
  void applyOnce(live.current);
}

/** Wire the WXT location-change event to {@link handleLocationChange}. WXT
 *  patches `history.pushState`/`replaceState` and listens to `popstate` /
 *  `hashchange`, dispatching `wxt:locationchange` with the new/old URLs, and
 *  auto-removes the listener when the content-script context is invalidated. */
function installLocationChangeListener(live: LiveSettings, ctx: ContentScriptContext): void {
  // Cast to Window so WXT's typed `wxt:locationchange` overload is selected
  // (its event carries newUrl/oldUrl); the generic EventTarget overload would
  // erase that to a bare Event. `globalThis` is the page window here.
  ctx.addEventListener(globalThis as unknown as Window, 'wxt:locationchange', (event) => {
    handleLocationChange(live, event.newUrl, event.oldUrl);
  });
}

/** React live to pause/resume (the popup writes pause state to storage.local).
 *  On pause: abort any in-flight tick and tear down concealment, then make
 *  applyOnce inert via `pausedActive` — so the redirect ladder and content
 *  concealment stop firing in this already-open tab (the background also drops
 *  the DNR rule, but that only affects new requests). On resume: clear the flag
 *  and re-evaluate the page with the latest settings. Listeners/observer are
 *  deliberately left installed so resume needs no reload. */
function installPauseListener(live: LiveSettings): void {
  onPauseChange((next) => {
    if (next.paused) {
      pausedActive = true;
      invalidateInFlightApplies();
      teardownContentModification();
    } else if (pausedActive) {
      pausedActive = false;
      void applyOnce(live.current);
    }
  });
}

/** React live to this host being snoozed or resumed (the popup writes the
 *  snooze map; the background sweep prunes it at expiry). Mirrors
 *  installPauseListener: snooze → tear down + make applyOnce inert; un-snooze
 *  (explicit resume or expiry) → re-apply. The redirect (Accept-Language) is the
 *  background's DNR rule and only affects the NEXT navigation; this re-arms the
 *  in-page concealment immediately. Listeners stay installed so no reload is
 *  needed. */
function installSnoozeListener(live: LiveSettings): void {
  onSnoozeChange(() => {
    void (async () => {
      const snoozed = (await isHostSnoozed(location.hostname)) != null;
      if (snoozed === snoozedActive) return;
      snoozedActive = snoozed;
      if (snoozed) {
        invalidateInFlightApplies();
        teardownContentModification();
      } else {
        void applyOnce(live.current);
      }
    })();
  });
}

export interface ContentRuntime {
  applyOnce: typeof applyOnce;
  getHiddenSummary: typeof getHiddenSummary;
  handlePickerClickCapture: typeof handlePickerClickCapture;
  restoreAll: typeof restoreAll;
  rememberPickerContainers: typeof rememberPickerContainers;
  installMessageBridge: typeof installMessageBridge;
  installSettingsListener: typeof installSettingsListener;
  installPauseListener: typeof installPauseListener;
  installSnoozeListener: typeof installSnoozeListener;
  handleLocationChange: typeof handleLocationChange;
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
    installPauseListener,
    installSnoozeListener,
    handleLocationChange,
    main,
  };
}

/** http/https only. The content script is registered for `<all_urls>` at
 *  document_start, which still reaches non-web documents (file:, view-source:,
 *  ftp:, ws:); none has a site language to correct, so bail. Pure + exported for
 *  a direct truth-table test. */
export function isSupportedProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/** True when running in the top-level browsing context. A cross-origin frame
 *  throws on `window.top` access — treat that as "not top frame" and bail.
 *  `allFrames` is false today, so this is belt-and-suspenders that documents the
 *  invariant; revisit it explicitly (don't silently inherit) if a future site
 *  adapter ever needs same-origin subframe handling. */
function isTopFrame(): boolean {
  try {
    return globalThis.top === globalThis.self;
  } catch {
    return false;
  }
}

// Content-script bootstrap: settings load → enabled/allowlist guards → pause
// seed → watcher/listeners/bridge install → first apply → observer. Each step
// is sequential and reads top-to-bottom. The remaining branching is the
// inert-tab guard chain. `ctx` is WXT's ContentScriptContext (optional only so
// the unit test harness can drive main() without one — production always passes it).
// fallow-ignore-next-line complexity
async function main(ctx?: ContentScriptContext): Promise<void> {
  // Surface guards first (cheapest, no storage read): never run on non-web
  // documents or inside a (sub)frame. Keeps the picker walk + redirect ladder
  // off ad/tracker iframes and file:/view-source: pages that <all_urls> reaches.
  if (!isSupportedProtocol(location.protocol)) return;
  if (!isTopFrame()) return;

  const live: LiveSettings = { current: await getSettings() };
  if (!live.current.enabled) return;
  if (hostMatchesAllowlist(location.hostname, live.current.allowlist)) return;
  // Seed the pause + snooze flags instead of early-returning: a tab that loads
  // while paused or while its host is snoozed stays inert (applyOnce is a no-op)
  // but still installs the listeners below, so an explicit resume / the snooze
  // expiring re-arms it without a reload.
  pausedActive = await isPaused();
  snoozedActive = (await isHostSnoozed(location.hostname)) != null;

  // Wake the background worker and warm franc's tables now (fire-and-forget):
  // tier-7 and the content filter both reach franc by message, and warming it
  // before the first need keeps the worker cold-start off the 150 ms tier-7
  // budget. Skipped while paused — nothing detects until resume.
  if (!pausedActive && !snoozedActive) void warmBackgroundFranc();

  installPauseListener(live);
  installSnoozeListener(live);
  installPickerClickListener();
  installMessageBridge();
  installSettingsListener(live);
  // Re-apply on SPA/history navigations the MutationObserver can't see.
  if (ctx) installLocationChangeListener(live, ctx);

  await whenDomReady();
  if (await applyOnce(live.current)) return;
  installMutationObserver(live);
}
