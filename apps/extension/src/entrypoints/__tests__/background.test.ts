import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type * as LangDetect from '@movar/lang-detect';
import type { DetectedLanguage, SnippetVerdict } from '@movar/lang-detect';
import { getPauseState, RESUME_ALARM, SNOOZE_ALARM } from '../../lib/pause';

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

const SETTINGS_KEY = 'settings';
const RULE_ID = 1;

type DnrUpdate = Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0];
type DnrRule = NonNullable<DnrUpdate['addRules']>[number];

/** In-memory backing store for the DNR rule. The base fakeBrowser leaves
 *  `declarativeNetRequest` unimplemented (it throws "not implemented"), so we
 *  provide a tiny working implementation ourselves — exactly what that error
 *  message asks for — and read the installed rule back through it. Reset and
 *  re-spied per test in `installDnr()`. */
let dynamicRules: DnrRule[] = [];

/** Wire `updateDynamicRules` to mutate `dynamicRules` (sweep removeRuleIds,
 *  then append addRules) — the atomic replace `dnr.ts` relies on. The mock
 *  body is synchronous; `dnr.ts` awaits the call and `await undefined` settles
 *  immediately, so the in-memory store is consistent on the next read. */
function installDnr(): void {
  dynamicRules = [];
  vi.spyOn(browser.declarativeNetRequest, 'updateDynamicRules').mockImplementation(
    (update: DnrUpdate) => {
      const remove = new Set<number>(update.removeRuleIds);
      dynamicRules = dynamicRules.filter((r) => !remove.has(r.id));
      if (update.addRules) dynamicRules.push(...update.addRules);
    },
  );
}

/** The currently-installed Accept-Language rule, or undefined when removed. */
function currentRule(): DnrRule | undefined {
  return dynamicRules.find((r) => r.id === RULE_ID);
}

/** Run the background's main() to register every listener against the current
 *  fakeBrowser. The module is import-cached; `fakeBrowser.reset()` in beforeEach
 *  has already cleared every prior listener, so re-running main() registers a
 *  clean set (no resetModules — that would detach the spy we install on
 *  `declarativeNetRequest` from the `browser` the worker imports). */
async function loadBackground(): Promise<void> {
  const mod = await import('../background');
  mod.default.main();
}

/** Fire the runtime.onMessage event and return the (single) franc listener's
 *  return value. fakeBrowser's `trigger` resolves to an array of every
 *  listener's result; the worker registers exactly one onMessage listener, so
 *  index 0 is its `true`/`false` "keep the channel open?" verdict. `msg` is
 *  optional so the falsy-message case omits it (a bare `undefined` arg).
 *
 *  fakeBrowser types `onMessage.trigger` as `(message, sender)` only, but the
 *  real Chrome listener (and the fake's runtime forwarding) also receives a
 *  `sendResponse` callback — so we widen the trigger to the 3-arg shape the
 *  worker's listener actually consumes. */
interface MessageTriggerEvent {
  trigger(message: unknown, sender: unknown, sendResponse: () => void): Promise<unknown[]>;
}

async function triggerMessage(sendResponse: () => void, msg?: unknown): Promise<unknown> {
  const onMessage = fakeBrowser.runtime.onMessage as unknown as MessageTriggerEvent;
  const results = await onMessage.trigger(msg, {}, sendResponse);
  return results[0];
}

/** fakeBrowser leaves `commands` unimplemented; stub `onCommand` so the
 *  worker's keyboard-shortcut listener registers in main() without throwing.
 *  The dispatch behaviour itself is covered in background.commands.test.ts. */
function stubCommands(): void {
  (browser as unknown as { commands: { onCommand: { addListener: () => void } } }).commands = {
    onCommand: { addListener: vi.fn() },
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  stubCommands();
  installDnr();
  detect.mockReset().mockResolvedValue({ language: 'ru', confidence: 0.9, engine: 'franc' });
  classifyBySnippet
    .mockReset()
    .mockReturnValue({ language: 'ru', margin: 0.3, rung: 3, discriminating: true });
  getProfiles.mockReset().mockReturnValue(['profile']);
  // Resolves with no value — warmFranc is fire-and-forget (Promise<void>).
  warmFranc.mockReset().mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main() registration', () => {
  it('warms franc once when the worker starts', async () => {
    await loadBackground();
    expect(warmFranc).toHaveBeenCalledTimes(1);
  });
});

describe('onInstalled', () => {
  it('initialises settings to the defaults and installs the DNR rule', async () => {
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });

    // Defaults are written to sync storage and the rule is synced (the defaults
    // are enabled with a non-empty priority, so the modifyHeaders rule lands).
    await vi.waitFor(() => {
      expect(currentRule()).toBeDefined();
    });
    const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
    expect(stored).toEqual(defaultSettings);
    expect(currentRule()?.action.type).toBe('modifyHeaders');
  });

  it('leaves already-stored settings untouched (no first-run overwrite)', async () => {
    const existing = { ...defaultSettings, enabled: false };
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: existing });
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', temporary: false });

    // Resync still runs; with enabled:false the rule is removed, not installed.
    await vi.waitFor(() => {
      expect(currentRule()).toBeUndefined();
    });
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual(existing);
  });
});

describe('onStartup', () => {
  it('resyncs the DNR rule from current settings', async () => {
    await loadBackground();

    await fakeBrowser.runtime.onStartup.trigger();

    // Default settings are active → the rule is (re)installed.
    await vi.waitFor(() => {
      expect(currentRule()).toBeDefined();
    });
  });

  it('removes a stale rule on startup when paused indefinitely', async () => {
    await fakeBrowser.storage.local.set({ 'movar:pausedIndefinitely': true });
    // Pre-seed a stale rule (as if it survived from a previous session) so we
    // can observe startup sweeping it because the pause is still in effect.
    await browser.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: RULE_ID,
          priority: 1,
          action: { type: 'modifyHeaders', requestHeaders: [] },
          condition: { resourceTypes: ['main_frame'] },
        },
      ],
    });
    expect(currentRule()).toBeDefined();
    await loadBackground();

    await fakeBrowser.runtime.onStartup.trigger();

    await vi.waitFor(() => {
      expect(currentRule()).toBeUndefined();
    });
  });
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

  it('routes movar:classifySnippets through getProfiles + classifyBySnippet, one verdict per text', async () => {
    await loadBackground();
    const sendResponse = vi.fn();
    const verdict: SnippetVerdict = { language: 'ru', margin: 0.3, rung: 3, discriminating: true };
    classifyBySnippet.mockReturnValue(verdict);

    const keepOpen = await triggerMessage(sendResponse, {
      type: 'movar:classifySnippets',
      texts: ['a', 'b'],
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

describe('change subscriptions', () => {
  it('resyncs the DNR rule when settings change', async () => {
    await loadBackground();
    const update = browser.declarativeNetRequest.updateDynamicRules as ReturnType<typeof vi.fn>;
    update.mockClear();

    await fakeBrowser.storage.onChanged.trigger(
      { [SETTINGS_KEY]: { newValue: defaultSettings } },
      'sync',
    );

    await vi.waitFor(() => {
      expect(update).toHaveBeenCalled();
    });
  });

  it('resyncs the DNR rule when the pause state changes', async () => {
    await loadBackground();
    const update = browser.declarativeNetRequest.updateDynamicRules as ReturnType<typeof vi.fn>;
    update.mockClear();

    await fakeBrowser.storage.onChanged.trigger(
      { 'movar:pausedIndefinitely': { newValue: true } },
      'local',
    );

    await vi.waitFor(() => {
      expect(update).toHaveBeenCalled();
    });
  });
});
