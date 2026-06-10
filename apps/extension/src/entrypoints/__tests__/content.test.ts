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
import { getPickerChoice } from '../../lib/session-choice';
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
