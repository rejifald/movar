import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type * as LangDetect from '@movar/lang-detect';
import type { DetectedLanguage, SnippetVerdict } from '@movar/lang-detect';
import {
  SETTINGS_KEY,
  RULE_ID,
  GOOGLE_RULE_ID,
  installDnr,
  currentRule,
  googleRedirectRule,
  loadBackground,
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

  it('installs the Google /search redirect rule alongside the Accept-Language rule', async () => {
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });

    // resync drives BOTH dynamic rules from the same settings snapshot.
    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeDefined();
    });
    expect(googleRedirectRule()?.action.type).toBe('redirect');
    expect(currentRule()).toBeDefined();
  });

  it('sweeps a stale Google redirect rule when settings disable the extension', async () => {
    const existing = { ...defaultSettings, enabled: false };
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: existing });
    // Pre-seed a stale rule 2 (as if it survived from an enabled session) so
    // the assertion observes resync actively removing it, not a vacuous "was
    // never installed".
    await browser.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: GOOGLE_RULE_ID,
          priority: 1,
          action: { type: 'redirect', redirect: {} },
          condition: { resourceTypes: ['main_frame'] },
        },
      ],
    });
    expect(googleRedirectRule()).toBeDefined();
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', temporary: false });

    await vi.waitFor(() => {
      expect(googleRedirectRule()).toBeUndefined();
    });
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

  it('clears crash-disabled hosts on an update', async () => {
    await fakeBrowser.storage.local.set({
      'movar:disabledUntilUpdateHosts': ['crashed.example.com'],
    });
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', temporary: false });

    await vi.waitFor(async () => {
      const stored = (await fakeBrowser.storage.local.get('movar:disabledUntilUpdateHosts'))[
        'movar:disabledUntilUpdateHosts'
      ];
      expect(stored).toBeUndefined();
      // The resynced rules no longer exclude the now-recovered host. Checked
      // inside the waitFor: the storage clear lands BEFORE resync() in the
      // listener chain, so the rules lag it — rule 2 is the chain's last
      // write, making it the "resync finished" signal.
      expect(currentRule()?.condition.excludedRequestDomains).toBeUndefined();
      expect(googleRedirectRule()?.condition.excludedRequestDomains).toBeUndefined();
    });
  });

  it('does NOT clear crash-disabled hosts on a fresh install', async () => {
    await fakeBrowser.storage.local.set({
      'movar:disabledUntilUpdateHosts': ['crashed.example.com'],
    });
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });

    await vi.waitFor(() => {
      expect(currentRule()).toBeDefined();
    });
    const stored = (await fakeBrowser.storage.local.get('movar:disabledUntilUpdateHosts'))[
      'movar:disabledUntilUpdateHosts'
    ];
    expect(stored).toEqual(['crashed.example.com']);
  });
});

/** Direct-assign a tabs.create stub (mirrors stubCommands): fakeBrowser leaves
 *  tabs.create partial, and a direct stub makes the call assertable regardless. */
function stubTabsCreate() {
  const create = vi.fn<(info: { url?: string }) => Promise<unknown>>().mockResolvedValue({});
  (browser.tabs as unknown as { create: typeof create }).create = create;
  return create;
}

describe('onInstalled → onboarding', () => {
  it('opens the onboarding page on a fresh install', async () => {
    const create = stubTabsCreate();
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });

    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0]?.[0]?.url).toContain('onboarding.html');
  });

  it('does not open onboarding on an update', async () => {
    const create = stubTabsCreate();
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', temporary: false });

    // The install-time settings seed + resync still run on update...
    await vi.waitFor(() => {
      expect(currentRule()).toBeDefined();
    });
    // ...but the onboarding tab is first-run only.
    expect(create).not.toHaveBeenCalled();
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

/** A fake Safari App Group behind `runtime.sendNativeMessage`, mirroring
 *  SafariWebExtensionHandler.swift: `getSettings` returns the blob + rev,
 *  `setSettings` stores the blob and bumps the rev unconditionally. */
function installAppGroup(initial: { rev: number; settings: unknown }) {
  const group = { ...initial };
  const send = vi.fn((_app: string, msg: { type: string; settings?: unknown }) => {
    if (msg.type === 'getSettings') {
      return { rev: group.rev, settings: group.settings };
    }
    group.rev += 1;
    group.settings = msg.settings;
    return { ok: true, rev: group.rev };
  });
  Object.assign(browser.runtime, { sendNativeMessage: send });
  return group;
}

/** Hold every `storage.sync` read that finds no settings until the next settings
 *  write lands (or a short fallback elapses, so a fixed build can't deadlock).
 *  This forces the first-run interleaving deterministically: a read that saw an
 *  empty store resolves only AFTER the host app's blob was adopted. */
function holdEmptySettingsReads(): void {
  const realGet = fakeBrowser.storage.sync.get.bind(fakeBrowser.storage.sync);
  const realSet = fakeBrowser.storage.sync.set.bind(fakeBrowser.storage.sync);
  const waiters: (() => void)[] = [];
  vi.spyOn(fakeBrowser.storage.sync, 'set').mockImplementation(async (items) => {
    await realSet(items);
    if (SETTINGS_KEY in items) {
      for (const release of waiters.splice(0)) release();
    }
  });
  vi.spyOn(fakeBrowser.storage.sync, 'get').mockImplementation(async (keys) => {
    const result = await realGet(keys);
    if (result[SETTINGS_KEY] == null) {
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 20);
      });
    }
    return result;
  });
}

/** Let every fire-and-forget chain the worker started run to completion. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

async function storedSettings(): Promise<{ contentModification?: boolean } | undefined> {
  return (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] as
    | { contentModification?: boolean }
    | undefined;
}

describe('Safari first run: host-app settings survive the first launch', () => {
  // The user turned content hiding on in the host app before Safari ever ran
  // the extension: the App Group holds a blob, storage.sync is still empty.
  const hostChoice = { ...defaultSettings, contentModification: true };

  beforeEach(() => {
    vi.stubEnv('BROWSER', 'safari');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adopts the App Group blob instead of seeding defaults over it', async () => {
    const group = installAppGroup({ rev: 1, settings: hostChoice });
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });
    await settle();

    expect((await storedSettings())?.contentModification).toBe(true);
    // The host app keeps the choice too: nothing pushed defaults back over it.
    expect((group.settings as { contentModification: boolean }).contentModification).toBe(true);
  });

  it('keeps the adopted blob when the first-run read precedes the adoption (TOCTOU)', async () => {
    const group = installAppGroup({ rev: 1, settings: hostChoice });
    holdEmptySettingsReads();
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });
    await settle();

    expect((await storedSettings())?.contentModification).toBe(true);
    expect((group.settings as { contentModification: boolean }).contentModification).toBe(true);
  });

  it('seeds an empty App Group from the defaults on a plain first run', async () => {
    const group = installAppGroup({ rev: 0, settings: null });
    await loadBackground();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });
    await settle();

    expect(await storedSettings()).toEqual(defaultSettings);
    expect(group.settings).toEqual(defaultSettings);
  });
});
