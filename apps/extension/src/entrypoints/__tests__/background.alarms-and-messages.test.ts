import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import type * as LangDetect from '@movar/lang-detect';
import type { DetectedLanguage, SnippetVerdict } from '@movar/lang-detect';
import type { CorrectionEvent } from '@movar/events';
import { getPauseState, RESUME_ALARM, SNOOZE_ALARM } from '../../lib/pause';
import { getCorrectionEvents } from '../../lib/events';
import {
  GOOGLE_RULE_ID,
  installDnr,
  currentRule,
  googleRedirectRule,
  loadBackground,
  triggerMessage,
  stubCommands,
  setIcon,
  setBadgeText,
  stubAction,
} from './background.test-utils';

// Deterministic franc stubs. The dispatch handler routes each message type to
// one of these; mocking both subpaths keeps the worker's responses fixed and
// franc's real trigram tables out of the test. The spies are exposed directly
// as the mocked exports, so a call into franc is a call we can assert on.
//
// Created via `vi.hoisted` so they exist before any import triggers a mock
// factory: `@movar/settings`'s settings migration now imports `@movar/lang-detect`
// transitively, which evaluates the mock below earlier in the module graph than
// plain top-level `const`s would be initialized.
const { detect, classifyBySnippet, getProfiles, warmFranc } = vi.hoisted(() => ({
  detect: vi.fn<(text: string, ctx: unknown) => Promise<DetectedLanguage | null>>(),
  classifyBySnippet: vi.fn<(...args: unknown[]) => SnippetVerdict | null>(),
  getProfiles: vi.fn<(codes: string[]) => unknown>(),
  warmFranc: vi.fn<() => Promise<void>>(),
}));

// Spread the real module so pure helpers like `normalizeLanguageCode` (now
// pulled in transitively via `@movar/settings`'s settings migration) keep
// their real implementation; override only the franc-routed spies we assert on.
vi.mock('@movar/lang-detect', async (importActual) => ({
  ...(await importActual<typeof LangDetect>()),
  classifyBySnippet,
  getProfiles,
}));

vi.mock('@movar/lang-detect/franc', () => ({
  francEngine: { id: 'franc', isAvailable: () => true, detect },
  francRung3Resolver: { id: 'franc-rung3' },
  warmFranc,
}));

// background.ts keeps this alarm name private; mirror the literal for the test.
const RESTORE_GOOGLE_REDIRECT_ALARM = 'movar:restore-google-redirect';
// dnr.ts keeps this session-storage key private; mirror the literal (same stance
// as the alarm name above) to seed / read the empty-SERP-retry suspension flag.
const GOOGLE_REDIRECT_SUSPENDED_KEY = 'movar:googleRedirectSuspended';

beforeEach(() => {
  fakeBrowser.reset();
  stubCommands();
  stubAction();
  setIcon.mockClear();
  setBadgeText.mockClear();
  installDnr();
  detect.mockReset().mockResolvedValue({ language: 'ru', confidence: 0.9, engine: 'franc' });
  classifyBySnippet
    .mockReset()
    .mockReturnValue({ language: 'ru', margin: 0.3, rung: 3, discriminating: true });
  getProfiles.mockReset().mockReturnValue(['profile']);
  // Resolves with no value — warmFranc is fire-and-forget (Promise<void>).
  warmFranc.mockReset().mockResolvedValue();
});

afterEach(async () => {
  // The worker's listeners run their handlers fire-and-forget (`void
  // resync()` and friends), so a chain can still be in flight when a test's
  // last assertion passes. Drain it BEFORE restoring the DNR mocks —
  // otherwise its tail updateDynamicRules call lands on the unimplemented
  // fake and surfaces as an unhandled rejection outside any test.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.restoreAllMocks();
});

describe('onAlarm', () => {
  it('resumes a timed pause and resyncs when the resume alarm fires', async () => {
    // An active timed pause + its alarm, plus a stale "active" rule. Firing the
    // resume alarm clears the pause + alarm and re-syncs (rule stays installed).
    await fakeBrowser.storage.local.set({ 'movar:pausedUntil': Date.now() + 60_000 });
    await browser.alarms.create(RESUME_ALARM, { when: Date.now() + 60_000 });
    await loadBackground();

    void fakeBrowser.alarms.onAlarm.trigger({ name: RESUME_ALARM, scheduledTime: Date.now() });

    await vi.waitFor(async () => {
      // Pause cleared (resume ran).
      expect((await getPauseState()).paused).toBe(false);
      // Alarm cleared.
      expect(await fakeBrowser.alarms.get(RESUME_ALARM)).toBeFalsy();
      // Rule re-installed now that the pause is gone.
      expect(currentRule()).toBeDefined();
    });
  });

  it('does nothing for an unrelated alarm name', async () => {
    await loadBackground();
    const set = vi.spyOn(browser.storage.local, 'set');

    await fakeBrowser.alarms.onAlarm.trigger({
      name: 'some:other:alarm',
      scheduledTime: Date.now(),
    });

    // Let any (erroneous) async work flush, then assert the resume path never ran.
    await Promise.resolve();
    await Promise.resolve();
    expect(set).not.toHaveBeenCalled();
  });

  it('on the snooze sweep alarm: prunes expired hosts and resyncs', async () => {
    // An already-elapsed snooze entry, as if its alarm fired late.
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { 'old.example.com': Date.now() - 1000 },
    });
    await loadBackground();

    void fakeBrowser.alarms.onAlarm.trigger({ name: SNOOZE_ALARM, scheduledTime: Date.now() });

    await vi.waitFor(async () => {
      const map = (await fakeBrowser.storage.local.get('movar:snoozedHosts'))['movar:snoozedHosts'];
      expect(map).toEqual({}); // expired entry pruned
      // Rule re-installed and no longer excludes the (resumed) host.
      expect(currentRule()?.condition.excludedRequestDomains).toBeUndefined();
    });
  });

  it('re-installs the Google redirect rule when the restore alarm fires', async () => {
    await loadBackground();
    // main()'s wake resync installs rule 2; wait for it, then simulate the
    // suspend (movar:suspendGoogleRedirect removes rule 2) so the restore alarm
    // has a genuinely-absent rule to re-install — resync skips a no-op write.
    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeDefined();
    });
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [GOOGLE_RULE_ID] });
    expect(googleRedirectRule()).toBeUndefined();

    void fakeBrowser.alarms.onAlarm.trigger({
      name: RESTORE_GOOGLE_REDIRECT_ALARM,
      scheduledTime: Date.now(),
    });

    // The RESTORE_GOOGLE_REDIRECT_ALARM switch arm resyncs, re-installing rule 2.
    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeDefined();
    });
  });
});

describe('snooze excludes from the DNR rule', () => {
  it('excludes a live snoozed host from the resynced Accept-Language rule', async () => {
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { 'snoozed.example.com': Date.now() + 3_600_000 },
    });
    await loadBackground();

    await fakeBrowser.runtime.onStartup.trigger();

    await vi.waitFor(() => {
      expect(currentRule()?.condition.excludedRequestDomains).toContain('snoozed.example.com');
    });
  });
});

describe('crash-disabled hosts exclude from the DNR rule', () => {
  it('excludes a host turned off from the crash screen from the resynced Accept-Language rule', async () => {
    await fakeBrowser.storage.local.set({
      'movar:disabledUntilUpdateHosts': ['crashed.example.com'],
    });
    await loadBackground();

    await fakeBrowser.runtime.onStartup.trigger();

    await vi.waitFor(() => {
      expect(currentRule()?.condition.excludedRequestDomains).toContain('crashed.example.com');
    });
  });
});

describe('worker-wake pause reconcile', () => {
  it('self-heals an elapsed timed pause whose resume alarm was dropped', async () => {
    // A timed pause whose window already elapsed, with NO resume alarm present
    // (the alarm was dropped while the service worker slept past the deadline).
    // Nothing else would clear it, so the DNR rule would stay off indefinitely.
    await fakeBrowser.storage.local.set({ 'movar:pausedUntil': Date.now() - 60_000 });

    await loadBackground(); // main() runs the wake-time resumeIfExpired + resync

    await vi.waitFor(async () => {
      // The stale pause artifact is cleared (resumeIfExpired ran): the elapsed
      // numeric `until` is gone (null/undefined), not still a number.
      const local = await fakeBrowser.storage.local.get('movar:pausedUntil');
      expect(local['movar:pausedUntil'] ?? null).toBeNull();
      // ...and the rule is reinstalled now that the expired pause is gone.
      expect(currentRule()).toBeDefined();
    });
  });

  it('does not resume a still-active timed pause on wake', async () => {
    const until = Date.now() + 60_000;
    await fakeBrowser.storage.local.set({ 'movar:pausedUntil': until });
    await browser.alarms.create(RESUME_ALARM, { when: until });

    await loadBackground();

    await vi.waitFor(async () => {
      expect((await getPauseState()).paused).toBe(true);
    });
    // The active pause window and its alarm are untouched; rule stays off.
    const local = await fakeBrowser.storage.local.get('movar:pausedUntil');
    expect(local['movar:pausedUntil']).toBe(until);
    expect(await fakeBrowser.alarms.get(RESUME_ALARM)).toBeTruthy();
    expect(currentRule()).toBeUndefined();
  });
});

describe('worker-wake respects an active empty-SERP-retry suspension (#301)', () => {
  it('does NOT re-install rule 2 on wake while the suspension flag is set', async () => {
    // A retry suspended rule 2 in a prior SW lifetime; the flag persists in
    // session storage, so it survives the very SW restart the wake implies.
    await fakeBrowser.storage.session.set({ [GOOGLE_REDIRECT_SUSPENDED_KEY]: true });

    await loadBackground(); // main()'s wake IIFE runs resumeIfExpired → resync

    // resync installs the Accept-Language rule (rule 1) BEFORE it evaluates rule 2,
    // so rule 1's presence plus a macrotask flush means the rule-2 decision has
    // also run — and it left rule 2 absent (pre-#301 the wake re-installed it,
    // failing the assertion below).
    await vi.waitFor(() => {
      expect(currentRule()).toBeDefined();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(googleRedirectRule()).toBeUndefined();
  });

  it('DOES install rule 2 on a normal wake (no active suspension)', async () => {
    await loadBackground();

    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeDefined();
    });
  });

  it('restore alarm clears the suspension and re-installs rule 2', async () => {
    await fakeBrowser.storage.session.set({ [GOOGLE_REDIRECT_SUSPENDED_KEY]: true });
    await loadBackground();
    // The wake resync respected the suspension: rule 1 present, rule 2 absent.
    await vi.waitFor(() => {
      expect(currentRule()).toBeDefined();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(googleRedirectRule()).toBeUndefined();

    // The restore alarm fires: it clears the flag first, then resync re-installs
    // rule 2 (the whole point — a still-set flag would leave the rule down).
    void fakeBrowser.alarms.onAlarm.trigger({
      name: RESTORE_GOOGLE_REDIRECT_ALARM,
      scheduledTime: Date.now(),
    });

    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeDefined();
    });
    // Flag cleared, so subsequent wakes install normally.
    const stored = await fakeBrowser.storage.session.get(GOOGLE_REDIRECT_SUSPENDED_KEY);
    expect(stored[GOOGLE_REDIRECT_SUSPENDED_KEY]).toBeUndefined();
  });
});

describe('franc onMessage dispatch', () => {
  it('routes movar:detectText to francEngine.detect and replies via sendResponse', async () => {
    await loadBackground();
    const sendResponse = vi.fn();
    const reply: DetectedLanguage = { language: 'ru', confidence: 0.9, engine: 'franc' };
    detect.mockResolvedValue(reply);

    const keepOpen = await triggerMessage(sendResponse, {
      type: 'movar:detectText',
      text: 'Пример',
      maxChars: 500,
    });

    // Returns true to keep the message channel open for the async reply.
    expect(keepOpen).toBe(true);
    expect(detect).toHaveBeenCalledWith('Пример', { maxChars: 500 });
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(reply);
    });
  });

  it('omits maxChars from the detect context when the message has none', async () => {
    await loadBackground();
    const sendResponse = vi.fn();

    await triggerMessage(sendResponse, { type: 'movar:detectText', text: 'text' });

    expect(detect).toHaveBeenCalledWith('text', {});
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });
  });

  it('routes undeclared movar:classifySnippets items through getProfiles + classifyBySnippet', async () => {
    await loadBackground();
    const sendResponse = vi.fn();
    const verdict: SnippetVerdict = { language: 'ru', margin: 0.3, rung: 3, discriminating: true };
    classifyBySnippet.mockReturnValue(verdict);

    const keepOpen = await triggerMessage(sendResponse, {
      type: 'movar:classifySnippets',
      items: [{ text: 'a' }, { text: 'b' }],
      candidateCodes: ['ru', 'uk'],
    });

    expect(keepOpen).toBe(true);
    // The candidate codes reconstruct the profiles once; each text is classified.
    expect(getProfiles).toHaveBeenCalledWith(['ru', 'uk']);
    expect(classifyBySnippet).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith([verdict, verdict]);
    });
  });

  it('fuses a declared item instead of routing it through the text classifier', async () => {
    await loadBackground();
    const sendResponse = vi.fn();
    // buildDeclaredClassifier (real, via the spread mock) compiles a langtell
    // detector over these; a bare {code, alphabet} roster classifies on rung 1.
    getProfiles.mockReturnValue([
      { code: 'ru', alphabet: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя' },
      { code: 'uk', alphabet: 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя' },
    ]);

    const keepOpen = await triggerMessage(sendResponse, {
      type: 'movar:classifySnippets',
      items: [{ text: '', declared: 'ru' }],
      candidateCodes: ['ru', 'uk'],
    });

    expect(keepOpen).toBe(true);
    // A declared item is fused (declaration + text), never text-classified.
    expect(classifyBySnippet).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith([
        { language: 'ru', confidence: expect.any(Number) as number, fused: true },
      ]);
    });
  });

  it('routes movar:warmFranc to warmFranc and replies once it settles', async () => {
    await loadBackground();
    const sendResponse = vi.fn();
    // main() already warmed once at registration; isolate this message's call.
    warmFranc.mockClear();

    const keepOpen = await triggerMessage(sendResponse, { type: 'movar:warmFranc' });

    expect(keepOpen).toBe(true);
    expect(warmFranc).toHaveBeenCalledTimes(1);
    // warmFranc resolves with no value → the reply is the resolved void.
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });
    expect(sendResponse.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('routes movar:logCorrections to the serialized writer and persists the whole batch', async () => {
    await loadBackground();
    const sendResponse = vi.fn();
    const events: CorrectionEvent[] = [
      {
        timestamp: Date.now(),
        domain: 'a.example',
        mechanism: 'dom',
        fromLang: 'ru',
        toLang: 'uk',
      },
      {
        timestamp: Date.now(),
        domain: 'b.example',
        mechanism: 'cookie',
        fromLang: 'ru',
        toLang: 'uk',
      },
    ];

    const keepOpen = await triggerMessage(sendResponse, { type: 'movar:logCorrections', events });

    // Keeps the channel open, then replies once the serialized write settles.
    expect(keepOpen).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });
    // The single background funnel wrote the shared log — the whole batch, none
    // dropped (the cross-tab race in #310 is what this writer removes).
    expect(await getCorrectionEvents()).toHaveLength(2);
  });

  it('ignores an unknown message type: returns false and never replies', async () => {
    await loadBackground();
    const sendResponse = vi.fn();

    const keepOpen = await triggerMessage(sendResponse, { type: 'movar:getHidden' });

    expect(keepOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
  });

  it('ignores a falsy message (none supplied): returns false', async () => {
    await loadBackground();
    const sendResponse = vi.fn();

    // No message argument → the listener sees `undefined` and bails.
    const keepOpen = await triggerMessage(sendResponse);

    expect(keepOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('movar:suspendGoogleRedirect', () => {
  it('suspends rule 2 (no addRules) and arms the self-healing restore alarm', async () => {
    await loadBackground();
    // Let main()'s wake-time resync land the Google redirect rule first, so the
    // suspend call below is observably removing a real rule, not a vacuous no-op.
    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeDefined();
    });
    const update = browser.declarativeNetRequest.updateDynamicRules as ReturnType<typeof vi.fn>;
    update.mockClear();
    const sendResponse = vi.fn();

    const keepOpen = await triggerMessage(sendResponse, { type: 'movar:suspendGoogleRedirect' });

    expect(keepOpen).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(true);
    });
    const suspendCall = update.mock.calls[0]![0] as {
      removeRuleIds?: number[];
      addRules?: unknown[];
    };
    expect(suspendCall.removeRuleIds).toContain(GOOGLE_RULE_ID);
    expect('addRules' in suspendCall).toBe(false);
    expect(googleRedirectRule()).toBeUndefined();
    // Self-healing restore: a same-named alarm is armed to reinstall the rule.
    expect(await fakeBrowser.alarms.get('movar:restore-google-redirect')).toBeTruthy();
  });
});
