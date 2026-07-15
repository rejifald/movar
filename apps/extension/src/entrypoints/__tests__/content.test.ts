import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { HiddenSummary } from '../../lib/messaging';
import type { CapabilityChunk, CapabilityNeeds } from '../../lib/capabilities';
import type {
  ChunkLoader,
  ModelFeatureModule,
  ProvisionedCapabilityModules,
} from '../../lib/capability-loader';
import type { ContentRuntime } from '../../lib/content-runtime';
import { isSupportedProtocol } from '../../lib/content-runtime';
import { getPickerChoice, recordPickerChoice } from '../../lib/session-choice';
import { clearAttempt, getAttemptedUrls, markAttempt } from '../../lib/loop-guard';
import { getCorrectionEvents } from '../../lib/events';
import { RETRY_SETTLE_DELAY_MS } from '../../lib/empty-results-retry';
import type { Picker } from '@movar/lang-pickers/types';

const capabilityLoaderMock = vi.hoisted(() => ({
  provisionCapabilities: vi.fn<(needs: CapabilityNeeds) => Promise<ProvisionedCapabilityModules>>(),
}));

// page-text's sampleVisibleText reads `innerText`, which jsdom doesn't
// implement; the tier-7 text sniff is exercised by page-text's own suite, so
// here we stub it to "no sample" to keep applyOnce deterministic. vi.mock is
// hoisted above the `../content` import, so the stub is in place on load.
vi.mock('../../lib/page-text', () => ({ sampleVisibleText: () => '' }));
vi.mock('../../lib/capability-loader', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    provisionCapabilities: capabilityLoaderMock.provisionCapabilities,
  };
});
import { createCapabilityLoader } from '../../lib/capability-loader';
import type * as ConcealFeatureModule from '../../dynamic/features/conceal';
import type * as CurtainUiFeatureModule from '../../dynamic/features/curtain-ui';

/** fakeBrowser's onMessage.trigger only types (message, sender); the content
 *  bridge replies through the third `sendResponse` arg, so widen it here. The
 *  cast lives at the call so the fake method is invoked (not read off the
 *  object), keeping `unbound-method` quiet. */
type TriggerMessageFn = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;
function triggerMessage(
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
): void {
  (fakeBrowser.runtime.onMessage.trigger as unknown as TriggerMessageFn)(
    message,
    sender,
    sendResponse,
  );
}

/** Stand-ins for lazily-loaded dynamic capability chunks. The real modules
 *  resolve from web-accessible files via runtime.getURL, which jsdom can't
 *  import. vi.fn()s keep call assertions precise. */
type ConcealMod = typeof ConcealFeatureModule;
type CurtainUiMod = typeof CurtainUiFeatureModule;
const SETTINGS_KEY = 'settings';

function fakeConcealModule() {
  return {
    applyContentModification: vi.fn<ConcealMod['applyContentModification']>(async () => {
      await Promise.resolve();
      return [];
    }),
    teardownContentModification: vi.fn<ConcealMod['teardownContentModification']>(),
    revealAllContent: vi.fn<ConcealMod['revealAllContent']>(),
  };
}

function fakePresenter() {
  return {
    hasVisiblePresentation: true,
    attachContentCurtain: vi.fn(() => null),
    detachCurtains: vi.fn(),
    attachPickerContainerCurtain: vi.fn(() => null),
    attachPickerSurvivorTooltip: vi.fn(() => null),
    detachAllTooltips: vi.fn(),
    setLocale: vi.fn(async () => {
      await Promise.resolve();
    }),
    setColorScheme: vi.fn(),
    teardown: vi.fn(),
  };
}

function fakeCurtainUiModule(presenter = fakePresenter()) {
  return {
    createContentPresenter: vi.fn<CurtainUiMod['createContentPresenter']>(async () => {
      await Promise.resolve();
      return presenter;
    }),
  };
}

function fakeModelModule() {
  return {
    extract: vi.fn((root?: ParentNode) => {
      void root;
      return { extractor: 'test', nodes: [] };
    }),
  } satisfies ModelFeatureModule;
}

function defaultFakeChunks(): Partial<Record<CapabilityChunk, object>> {
  return {
    'features/conceal.js': fakeConcealModule(),
    'features/curtain-ui.js': fakeCurtainUiModule(),
  };
}

function fakeChunkLoader(modules: Partial<Record<CapabilityChunk, object>> = defaultFakeChunks()) {
  const loader = vi.fn<ChunkLoader>(async (path) => {
    await Promise.resolve();
    return modules[path] ?? {};
  });
  return loader;
}

function installChunkLoader(loader: ReturnType<typeof fakeChunkLoader>) {
  const capabilityLoader = createCapabilityLoader(loader);
  capabilityLoaderMock.provisionCapabilities.mockImplementation(
    capabilityLoader.provisionCapabilities,
  );
  return loader;
}

function installFakeChunks(
  modules: Partial<Record<CapabilityChunk, object>> = defaultFakeChunks(),
) {
  return installChunkLoader(fakeChunkLoader(modules));
}

let runtime: ContentRuntime;

beforeEach(async () => {
  fakeBrowser.reset();
  capabilityLoaderMock.provisionCapabilities.mockReset();
  vi.resetModules();
  runtime = (await import('../../lib/content-runtime')).createContentRuntime();
  document.body.innerHTML = '';
  // installSettingsListener (since #79) resolves the UI locale via
  // browser.i18n.getUILanguage(), which fakeBrowser leaves unimplemented.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
  // Stand in fake dynamic chunks so the content-modification branch is
  // exercisable without resolving real runtime.getURL modules in jsdom.
  installFakeChunks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyOnce orchestration', () => {
  it('no-ops on a neutral page and caches a null page language', async () => {
    expect(await runtime.applyOnce(defaultSettings)).toBe(false);
    expect(runtime.getHiddenSummary().pageLang).toBeNull();
  });

  it('bails immediately once the user override is set', async () => {
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);
    expect(await runtime.applyOnce(defaultSettings)).toBe(false);
  });
});

describe('empty-SERP retry wiring', () => {
  // End-to-end through the real applyOnce: a google.com SERP already at the
  // rewrite target (hl/lr correct — the switch ladder no-ops) that renders an
  // empty results area must arm the settle-time retry, which then navigates
  // to the same query without `lr` and logs a 'search-retry' correction. The
  // decision logic itself is unit-tested in empty-results-retry.test.ts; this
  // pins the applyOnceInner wiring and the DOM/loop-guard/record deps.
  it('retries an empty google SERP once without lr and records the correction', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="search"><div id="rso"></div><p>0</p></div>';
    const pinnedUrl = 'https://www.google.com/search?q=test&hl=uk&lr=lang_uk';
    const fakeLocation = {
      href: pinnedUrl,
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      const settings = {
        ...defaultSettings,
        priority: ['uk' as const],
        contentModification: false,
      };
      expect(await runtime.applyOnce(settings)).toBe(false);
      // jsdom may not report readyState 'complete'; a load event releases the
      // whenSettled gate either way (the once-listener is gone if it already ran).
      globalThis.window.dispatchEvent(new Event('load'));
      await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);

      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);
      const retried = new URL(fakeLocation.href);
      expect(retried.searchParams.has('lr')).toBe(false);
      expect(retried.searchParams.get('hl')).toBe('uk');
      expect(retried.searchParams.get('q')).toBe('test');
      // Both sides marked: the empty URL never re-retries, and the enforce
      // rewrite bails on the retried URL instead of re-adding lr.
      expect(getAttemptedUrls().toSorted()).toEqual([pinnedUrl, fakeLocation.href].toSorted());
      const events = await getCorrectionEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ mechanism: 'search-retry', domain: 'www.google.com' });
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      vi.useRealTimers();
      sessionStorage.clear();
    }
  });
});

describe('picker choice capture', () => {
  it('records clicks inside remembered picker containers', () => {
    const picker = document.createElement('nav');
    const link = document.createElement('a');
    link.href = '/ru';
    link.hreflang = 'ru';
    link.textContent = 'Russian';
    picker.append(link);
    document.body.append(picker);

    runtime.rememberPickerContainers([{ container: picker } as Picker]);
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: link });

    runtime.handlePickerClickCapture(event);

    expect(getPickerChoice(location.hostname)).toBe('ru');
  });
});

describe('popup ↔ content message bridge', () => {
  it('answers movar:getHidden with the current hidden summary', () => {
    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:getHidden' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse.mock.calls[0]![0]).toMatchObject({
      languages: [],
      containers: 0,
      feedCurtained: 0,
      feedHidden: 0,
    });
  });

  it('movar:restoreHidden sets the page override and returns the summary', () => {
    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:restoreHidden' }, {}, sendResponse);
    expect((sendResponse.mock.calls[0]![0] as HiddenSummary).userOverride).toBe(true);
  });

  it('reports switchSuppressed while the loop guard holds attempt history', () => {
    sessionStorage.clear();
    expect(runtime.getHiddenSummary().switchSuppressed).toBe(false);
    markAttempt('https://example.com/ru');
    expect(runtime.getHiddenSummary().switchSuppressed).toBe(true);
  });

  it('movar:retrySwitch clears both session guards so the switch can retry', () => {
    // Arm both suppressors, as a prior redirect "hiccup" + a manual picker
    // click to the blocked language would.
    sessionStorage.clear();
    markAttempt('https://example.com/ru');
    recordPickerChoice(location.hostname, 'ru');

    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:retrySwitch' }, {}, sendResponse);

    expect(getAttemptedUrls()).toEqual([]);
    expect(getPickerChoice(location.hostname)).toBeNull();
    expect(sendResponse).toHaveBeenCalledOnce();
    expect((sendResponse.mock.calls[0]![0] as HiddenSummary).switchSuppressed).toBe(false);
  });

  it('ignores message types it does not own', () => {
    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:detectText', text: 'x' }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('settings listener', () => {
  it('tears content modification down when the flag is switched off', () => {
    const live = { current: { ...defaultSettings, contentModification: true } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );
    expect(live.current.contentModification).toBe(false);
  });

  it('re-applies when content modification is switched on (clearing a prior override)', async () => {
    runtime.restoreAll(); // sets userOverride
    const live = { current: { ...defaultSettings, contentModification: false } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: true } } },
      'sync',
    );
    await vi.waitFor(() => {
      expect(live.current.contentModification).toBe(true);
    });
    expect(runtime.getHiddenSummary().userOverride).toBe(false);
  });
});

describe('pause listener', () => {
  it('stands an already-open tab down on pause and re-arms on resume (no reload)', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    const settings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide' as const,
    };
    const live = { current: settings };
    runtime.installPauseListener(live);

    // Baseline: on an active tab applyOnce runs the conceal facade.
    await runtime.applyOnce(settings);
    expect(mod.applyContentModification).toHaveBeenCalled();

    // Pause (the popup writes pause state to storage.local) → the listener tears
    // concealment down and makes applyOnce inert.
    await fakeBrowser.storage.local.set({
      'movar:pausedIndefinitely': true,
      'movar:pausedUntil': null,
    });
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalled();
    });

    // While paused, applyOnce is a no-op — so an observer/locationchange tick
    // (both of which just call applyOnce) does nothing and no redirect fires.
    mod.applyContentModification.mockClear();
    expect(await runtime.applyOnce(settings)).toBe(false);
    expect(mod.applyContentModification).not.toHaveBeenCalled();

    // Resume → the listener clears the flag and re-applies, no page reload.
    await fakeBrowser.storage.local.set({
      'movar:pausedIndefinitely': false,
      'movar:pausedUntil': null,
    });
    await vi.waitFor(() => {
      expect(mod.applyContentModification).toHaveBeenCalled();
    });
  });
});

describe('snooze listener', () => {
  it('stands a snoozed host down and re-arms when the snooze is removed (no reload)', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    const settings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide' as const,
    };
    const live = { current: settings };
    runtime.installSnoozeListener(live);

    // Baseline: the host isn't snoozed, so applyOnce conceals.
    await runtime.applyOnce(settings);
    expect(mod.applyContentModification).toHaveBeenCalled();

    // Snooze this host (the popup writes the snooze map to storage.local) → the
    // listener tears concealment down and makes applyOnce inert.
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { [location.hostname]: Date.now() + 3_600_000 },
    });
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalled();
    });

    mod.applyContentModification.mockClear();
    expect(await runtime.applyOnce(settings)).toBe(false);
    expect(mod.applyContentModification).not.toHaveBeenCalled();

    // Resume the site (snooze entry removed / swept at expiry) → re-applies in
    // place, no page reload.
    await fakeBrowser.storage.local.set({ 'movar:snoozedHosts': {} });
    await vi.waitFor(() => {
      expect(mod.applyContentModification).toHaveBeenCalled();
    });
  });
});

describe('dynamic capability loading', () => {
  it('loads conceal once in hide mode and never loads the presenter chunk', async () => {
    const mod = fakeConcealModule();
    const loader = fakeChunkLoader({ 'features/conceal.js': mod });
    installChunkLoader(loader);
    const enabled: MovarSettings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide',
    };

    await runtime.applyOnce(enabled);
    await runtime.applyOnce(enabled);

    expect(loader).toHaveBeenCalledExactlyOnceWith('features/conceal.js');
    expect(loader).not.toHaveBeenCalledWith('features/curtain-ui.js');
    expect(mod.applyContentModification).toHaveBeenCalledTimes(2);
  });

  it('loads conceal, the matching model, and presenter in one capability batch', async () => {
    const mod = fakeConcealModule();
    const model = fakeModelModule();
    const presenter = fakePresenter();
    const curtain = fakeCurtainUiModule(presenter);
    const loader = fakeChunkLoader({
      'features/conceal.js': mod,
      'features/curtain-ui.js': curtain,
      'models/youtube.js': model,
    });
    installChunkLoader(loader);
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('https://www.youtube.com/results?search_query=test'),
    });
    try {
      await runtime.applyOnce({ ...defaultSettings, contentModification: true, priority: [] });

      expect(loader.mock.calls.map(([path]) => path).toSorted()).toEqual([
        'features/conceal.js',
        'features/curtain-ui.js',
        'models/youtube.js',
      ]);
      expect(curtain.createContentPresenter).toHaveBeenCalledWith({
        host: 'www.youtube.com',
        locale: 'en',
      });
      expect(model.extract.mock.calls[0]?.[0]).toBe(document);
      expect(mod.applyContentModification).toHaveBeenCalledOnce();
      expect(mod.applyContentModification.mock.calls[0]![0]).toMatchObject({
        model: { extractor: 'test', nodes: [] },
        presenter,
      });
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('passes a hide-all callback that persists hide mode from a curtain action', async () => {
    const apply = vi.fn<ConcealMod['applyContentModification']>(async (ctx) => {
      ctx.onHideAll?.();
      await Promise.resolve();
      return [];
    });
    const mod = { ...fakeConcealModule(), applyContentModification: apply };
    installFakeChunks({ 'features/conceal.js': mod });

    await runtime.applyOnce({
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide',
    });

    expect(apply).toHaveBeenCalledOnce();
    await vi.waitFor(async () => {
      const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
        SETTINGS_KEY
      ] as MovarSettings;
      expect(stored.concealMode).toBe('hide');
    });
  });

  it('announces concealment then reveal to assistive tech via the polite live region', async () => {
    // A pass that conceals something fires the rolled-up "hid content" message;
    // restoreAll fires the "restored" message. Both are debounced (~600ms), so
    // poll with waitFor rather than fake timers (which would race the async
    // applyOnce chain).
    const apply = vi.fn<ConcealMod['applyContentModification']>(async () => {
      await Promise.resolve();
      return [{ fromLang: 'ru', toLang: 'uk' }];
    });
    const mod = { ...fakeConcealModule(), applyContentModification: apply };
    installFakeChunks({ 'features/conceal.js': mod });

    await runtime.applyOnce({ ...defaultSettings, contentModification: true, concealMode: 'hide' });
    await vi.waitFor(() => {
      expect(document.querySelector('[data-movar-live]')?.textContent).toBe(
        'Movar hid blocked-language content on this page',
      );
    });

    runtime.restoreAll();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-movar-live]')?.textContent).toBe(
        'Movar restored everything on this page',
      );
    });
  });

  it('does not rewrite settings when hide mode is already persisted', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { ...defaultSettings, concealMode: 'hide' },
    });
    const set = vi.spyOn(browser.storage.sync, 'set');
    const get = vi.spyOn(browser.storage.sync, 'get');
    const apply = vi.fn<ConcealMod['applyContentModification']>(async (ctx) => {
      ctx.onHideAll?.();
      await Promise.resolve();
      return [];
    });
    const mod = { ...fakeConcealModule(), applyContentModification: apply };
    installFakeChunks({ 'features/conceal.js': mod });

    await runtime.applyOnce({
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide',
    });

    await vi.waitFor(() => {
      expect(get).toHaveBeenCalledWith(SETTINGS_KEY);
    });
    await Promise.resolve();
    expect(set).not.toHaveBeenCalled();
  });

  it('never loads the chunk to reveal or tear down when the feature was never enabled', () => {
    const loader = installFakeChunks();

    // "Show everything" with nothing concealed, then toggle the feature off: both
    // the reveal and the teardown paths must skip the (unloaded) chunk, not fetch it.
    runtime.restoreAll();
    const live = { current: { ...defaultSettings, contentModification: true } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );

    expect(loader).not.toHaveBeenCalled();
  });

  it('reveals through the chunk once it has loaded', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    await runtime.applyOnce({ ...defaultSettings, contentModification: true, concealMode: 'hide' });

    runtime.restoreAll();

    expect(mod.revealAllContent).toHaveBeenCalledOnce();
  });

  it('tears down through the chunk when the feature is switched off after loading', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    await runtime.applyOnce({ ...defaultSettings, contentModification: true, concealMode: 'hide' });

    const live = { current: { ...defaultSettings, contentModification: true } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );

    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalledOnce();
    });
  });

  it('revokes and recreates the presenter on a UI-language rebuild', async () => {
    const mod = fakeConcealModule();
    const firstPresenter = fakePresenter();
    const secondPresenter = fakePresenter();
    const curtain = {
      createContentPresenter: vi
        .fn<CurtainUiMod['createContentPresenter']>()
        .mockResolvedValueOnce(firstPresenter)
        .mockResolvedValueOnce(secondPresenter),
    };
    installFakeChunks({
      'features/conceal.js': mod,
      'features/curtain-ui.js': curtain,
    });
    await runtime.applyOnce({ ...defaultSettings, contentModification: true });
    expect(curtain.createContentPresenter).toHaveBeenCalledOnce();

    const live = { current: { ...defaultSettings, contentModification: true } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      {
        settings: { newValue: { ...defaultSettings, contentModification: true, uiLanguage: 'uk' } },
      },
      'sync',
    );

    await vi.waitFor(() => {
      expect(firstPresenter.teardown).toHaveBeenCalledOnce();
      expect(curtain.createContentPresenter).toHaveBeenCalledTimes(2);
      expect(curtain.createContentPresenter.mock.calls[1]![0]).toMatchObject({ locale: 'uk' });
    });
  });
});

describe('toggle-off race', () => {
  it('aborts a stale tick when settings toggle off during provisionCapabilities', async () => {
    // Hold the provisionCapabilities promise so the tick is suspended mid-await.
    let release!: (value: ProvisionedCapabilityModules) => void;
    capabilityLoaderMock.provisionCapabilities.mockReturnValue(
      new Promise<ProvisionedCapabilityModules>((r) => {
        release = r;
      }),
    );

    const live = {
      current: { ...defaultSettings, contentModification: true, concealMode: 'curtain' as const },
    };
    runtime.installSettingsListener(live);

    // Start a tick but do NOT await — it will suspend at provisionCapabilities.
    const tick = runtime.applyOnce(live.current);

    // Toggle content modification off, triggering teardown + generation bump.
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );

    // Now resolve the suspended provisionCapabilities with fake modules.
    const conceal = fakeConcealModule();
    const presenter = fakePresenter();
    const curtain = fakeCurtainUiModule(presenter);
    release({ conceal, model: null, presenter: curtain });

    // Wait for the tick to complete.
    await tick;

    // The stale tick must not have applied concealment or created a presenter.
    expect(conceal.applyContentModification).not.toHaveBeenCalled();
    expect(curtain.createContentPresenter).not.toHaveBeenCalled();
  });

  it('tears down the presenter a stale tick created when settings toggle off during presenter provisioning', async () => {
    const conceal = fakeConcealModule();
    const presenter = fakePresenter();
    // A curtain module whose createContentPresenter suspends until released, so the
    // tick is mid-presenter-provisioning — past the post-provisionCapabilities
    // check — when we toggle off. This exercises the second stale-check, which
    // must tear down the presenter the doomed tick just created.
    let releasePresenter!: (value: typeof presenter) => void;
    const curtain = {
      createContentPresenter: vi.fn<CurtainUiMod['createContentPresenter']>(async () => {
        await Promise.resolve();
        return new Promise<typeof presenter>((resolve) => {
          releasePresenter = resolve;
        });
      }),
    };
    installChunkLoader(
      fakeChunkLoader({ 'features/conceal.js': conceal, 'features/curtain-ui.js': curtain }),
    );

    const live = {
      current: { ...defaultSettings, contentModification: true, concealMode: 'curtain' as const },
    };
    runtime.installSettingsListener(live);

    const tick = runtime.applyOnce(live.current);

    // Let the tick advance past provisionCapabilities to the presenter await.
    await vi.waitFor(() => {
      expect(curtain.createContentPresenter).toHaveBeenCalled();
    });

    // Toggle off mid-presenter-provisioning: bumps the generation.
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );

    // Resume: the presenter resolves, but the tick is now stale.
    releasePresenter(presenter);
    await tick;

    // It must not conceal, and must tear down the presenter it created.
    expect(conceal.applyContentModification).not.toHaveBeenCalled();
    expect(presenter.teardown).toHaveBeenCalledOnce();
  });

  it('exposes a staleness predicate that trips when settings change mid-classify', async () => {
    // The deepest async window: the tick reaches applyContentModification, and a
    // settings toggle-off lands while the facade's classify round-trip is in
    // flight. The orchestrator threads ctx.isStale (its generation closure) into
    // the facade; a stale tick must see isStale() === true so its content pass
    // bails before re-concealing. Drive it through a fake facade that suspends.
    let capturedCtx: Parameters<ConcealMod['applyContentModification']>[0] | undefined;
    let releaseClassify!: () => void;
    const apply = vi.fn<ConcealMod['applyContentModification']>(async (ctx) => {
      capturedCtx = ctx;
      await new Promise<void>((resolve) => {
        releaseClassify = resolve;
      });
      return [];
    });
    const mod = { ...fakeConcealModule(), applyContentModification: apply };
    installFakeChunks({ 'features/conceal.js': mod });

    const live = { current: { ...defaultSettings, contentModification: true } };
    runtime.installSettingsListener(live);

    const tick = runtime.applyOnce(live.current);
    await vi.waitFor(() => {
      expect(capturedCtx).toBeDefined();
    });
    // Mid-classify the tick is still current.
    expect(capturedCtx!.isStale?.()).toBe(false);

    // Toggle off — bumps the generation.
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );

    // The suspended tick now reads stale.
    expect(capturedCtx!.isStale?.()).toBe(true);
    releaseClassify();
    await tick;
  });
});

describe('SPA / history location-change re-trigger', () => {
  beforeEach(() => {
    clearAttempt();
  });

  it('re-runs applyOnce on a URL change, even when the body did not mutate', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    const live = { current: { ...defaultSettings, contentModification: true } };

    // First apply runs the content pass once.
    await runtime.applyOnce(live.current);
    expect(mod.applyContentModification).toHaveBeenCalledOnce();

    // A "Show everything" override would normally make applyOnce a no-op...
    runtime.restoreAll();
    expect(await runtime.applyOnce(live.current)).toBe(false);
    expect(mod.applyContentModification).toHaveBeenCalledOnce();

    // ...but an SPA route change is a new page: it resets the override and
    // re-applies, so the content pass fires again.
    runtime.handleLocationChange(
      live,
      new URL('https://example.com/new-route'),
      new URL('https://example.com/old-route'),
    );
    await vi.waitFor(() => {
      expect(mod.applyContentModification).toHaveBeenCalledTimes(2);
    });
  });

  it('clears a prior "Show everything" override on an SPA path change', () => {
    const live = { current: { ...defaultSettings } };
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);

    runtime.handleLocationChange(
      live,
      new URL('https://example.com/b'),
      new URL('https://example.com/a'),
    );
    expect(runtime.getHiddenSummary().userOverride).toBe(false);
  });

  it('does NOT clear the loop guard on a same-path, query-only change (YouTube param strip)', () => {
    const live = { current: { ...defaultSettings } };
    // Arm the loop guard for the bare URL (as an enforce-mode redirect would).
    const bare = 'https://www.youtube.com/results?search_query=test';
    markAttempt(bare);
    expect(getAttemptedUrls()).toContain(bare);

    // YouTube's polymer router strips &hl=uk&gl=UA via replaceState — same path,
    // different query. The guard must survive so the bare→params→bare loop stays
    // broken.
    runtime.handleLocationChange(
      live,
      new URL('https://www.youtube.com/results?search_query=test'),
      new URL('https://www.youtube.com/results?search_query=test&hl=uk&gl=UA'),
    );
    expect(getAttemptedUrls()).toContain(bare);
  });

  it('clears the loop guard when the path actually changes', () => {
    const live = { current: { ...defaultSettings } };
    markAttempt('https://example.com/ru/page');
    expect(getAttemptedUrls()).toHaveLength(1);

    runtime.handleLocationChange(
      live,
      new URL('https://example.com/uk/other'),
      new URL('https://example.com/ru/page'),
    );
    expect(getAttemptedUrls()).toHaveLength(0);
  });

  it('keeps a prior "Show everything" override on a query-only SPA change', () => {
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);
    runtime.handleLocationChange(
      { current: { ...defaultSettings } },
      new URL('https://www.youtube.com/results?search_query=test&hl=uk&gl=UA'),
      new URL('https://www.youtube.com/results?search_query=test'),
    );
    // A same-path query rewrite is not a new page — the override must survive so
    // content the user revealed is not silently re-concealed.
    expect(runtime.getHiddenSummary().userOverride).toBe(true);
  });

  // Reported bug: Google's AI Mode chat calls history.replaceState() on every
  // turn, reissuing ITS OWN opaque `sei` token each time (confirmed live) even
  // though hl/lr are already correct. Before the enforceCheckedOnce fix, the
  // Google rule's `stripParams: ['sei', ...]` forced a fresh `location.replace`
  // on every single turn — a real navigation that aborts the in-progress chat,
  // perceived as the extension crashing and the page refreshing repeatedly.
  it('does not force a fresh navigation on every same-path AI Mode chat turn (Google reissues its own sei token)', async () => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };

    const fakeLocation = {
      href: 'https://www.google.com/search?q=rust&udm=50&sei=SEI1',
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      // Turn 0 (document boot): hl/lr missing and a sei token present — the
      // ladder must still force the one-time enforce + strip cleanup.
      expect(await runtime.applyOnce(settings)).toBe(true);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);
      const settled = new URL(fakeLocation.href);
      expect(settled.searchParams.get('hl')).toBe('uk');
      expect(settled.searchParams.get('lr')).toBe('lang_uk');
      expect(settled.searchParams.has('sei')).toBe(false);

      // Turn 1: AI Mode's OWN history.replaceState reasserts `sei` on this chat
      // turn (its normal per-render bookkeeping) even though hl/lr are still
      // correct — a same-path locationchange would re-enter applyOnce next.
      const turn1 = new URL(fakeLocation.href);
      turn1.searchParams.set('sei', 'SEI1');
      turn1.searchParams.set('mstk', 'T1');
      fakeLocation.href = turn1.toString();
      expect(await runtime.applyOnce(settings)).toBe(false);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);

      // Turn 2: another chat turn, a longer mstk and a different sei value —
      // still must not force a reload that would abort the conversation.
      const turn2 = new URL(fakeLocation.href);
      turn2.searchParams.set('sei', 'SEI2');
      turn2.searchParams.set('mstk', 'T2-longer-conversation-state-token');
      fakeLocation.href = turn2.toString();
      expect(await runtime.applyOnce(settings)).toBe(false);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });

  it('still corrects a genuine hl/lr regression on a repeat tick (flag only silences the strip trigger)', async () => {
    // Guards against an over-broad fix: if the site's OWN script ever drops
    // hl/lr on a later turn, the ladder must still re-add them — the
    // enforceCheckedOnce fix only silences a strip-listed token's mere
    // reappearance, never a real params drift.
    sessionStorage.clear();
    document.body.innerHTML = '';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };

    const fakeLocation = {
      href: 'https://www.google.com/search?q=rust&udm=50&sei=SEI1',
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      expect(await runtime.applyOnce(settings)).toBe(true);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);

      // A later turn's URL is missing `lr` entirely (a real regression, not
      // just a reissued sei) — the loop guard hasn't seen this exact URL
      // before, so the ladder must correct it.
      const regressed = new URL(fakeLocation.href);
      regressed.searchParams.delete('lr');
      regressed.searchParams.set('mstk', 'T1');
      fakeLocation.href = regressed.toString();
      expect(await runtime.applyOnce(settings)).toBe(true);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(2);
      expect(new URL(fakeLocation.href).searchParams.get('lr')).toBe('lang_uk');
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });
});

describe('main() surface guards', () => {
  it('isSupportedProtocol allows only http/https', () => {
    expect(isSupportedProtocol('http:')).toBe(true);
    expect(isSupportedProtocol('https:')).toBe(true);
    for (const p of [
      'file:',
      'ftp:',
      'ws:',
      'wss:',
      'view-source:',
      'chrome-extension:',
      'about:',
    ]) {
      expect(isSupportedProtocol(p)).toBe(false);
    }
  });

  it('bails on a non-http(s) document before reading settings', async () => {
    // Rejecting get proves the proceed-path would have been observable; here it
    // must never be reached because the protocol guard short-circuits first.
    const get = vi.spyOn(browser.storage.sync, 'get').mockRejectedValue(new Error('stop'));
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('file:///Users/me/page.html'),
    });
    try {
      await runtime.main();
      expect(get).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('bails inside a (sub)frame before reading settings', async () => {
    const get = vi.spyOn(browser.storage.sync, 'get').mockRejectedValue(new Error('stop'));
    const originalTop = Object.getOwnPropertyDescriptor(globalThis, 'top');
    Object.defineProperty(globalThis, 'top', { configurable: true, value: {} });
    try {
      // Default jsdom location is http://localhost/ (protocol ok); the top-frame
      // guard is what must trip here.
      await runtime.main();
      expect(get).not.toHaveBeenCalled();
    } finally {
      if (originalTop) Object.defineProperty(globalThis, 'top', originalTop);
      else delete (globalThis as { top?: unknown }).top;
    }
  });

  it('proceeds to read settings on an https top-level page', async () => {
    // get rejects so main() aborts at getSettings — right after the guards —
    // without installing listeners/observer; reaching get proves both guards passed.
    const get = vi.spyOn(browser.storage.sync, 'get').mockRejectedValue(new Error('stop'));
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('https://example.com/'),
    });
    try {
      await expect(runtime.main()).rejects.toThrow('stop');
      expect(get).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
