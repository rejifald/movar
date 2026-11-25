import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { MovarMessage } from '../../lib/messaging';
import { contentStringsUk } from '../../lib/i18n/content-strings-uk';
import type { CapabilityNeeds } from '../../lib/capabilities';
import type { ModelFeatureModule, ProvisionedCapabilityModules } from '../../lib/capability-loader';
import type { ContentRuntime } from '../../lib/content-runtime';
import {
  fakeConcealModule,
  fakePresenter,
  fakeCurtainUiModule,
  fakeChunkLoader,
  installChunkLoader,
  installFakeChunks,
} from './content.test-utils';
import type { ConcealMod, CurtainUiMod } from './content.test-utils';

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

const SETTINGS_KEY = 'settings';

function fakeModelModule() {
  return {
    extract: vi.fn((root?: ParentNode) => {
      void root;
      return { extractor: 'test', nodes: [] };
    }),
  } satisfies ModelFeatureModule;
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

afterEach(async () => {
  // restoreAll / a concealing applyOnce schedule the debounced live-region
  // announcement on a real 600ms timer; clear it so it can't fire after jsdom
  // is torn down (`document is not defined` crashing whatever file runs next).
  // Dynamic import on purpose: resetModules in beforeEach gives each test a
  // fresh live-region instance, and a static import would tear down a stale one.
  (await import('../../lib/live-region')).teardownLiveRegion();
  vi.restoreAllMocks();
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

    // Asserted on the paths, not the whole call: the loader also receives a
    // retry-attempt counter (capability-loader), and an arg-exact matcher would
    // start passing vacuously if that signature moves again.
    expect(loader.mock.calls.map(([path]) => path)).toEqual(['features/conceal.js']);
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
        'Movar hid content in blocked languages on this page',
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

describe('content-locale retry (#316)', () => {
  it('retries loadContentMessages after a transient failure instead of pinning hide-mode live-region strings to English', async () => {
    // Simulate the reported trigger: a mid-lifecycle SW transition makes the
    // FIRST movar:contentStrings request fail; every later request succeeds.
    // Cast is the same widening the i18n content.test.ts suite uses — fakeBrowser
    // types sendMessage narrower than the ContentStrings reply we stub here.
    const sendMessage = vi.spyOn(browser.runtime, 'sendMessage') as unknown as MockInstance<
      (message: unknown) => Promise<unknown>
    >;
    let contentStringsAttempts = 0;
    sendMessage.mockImplementation(async (message) => {
      // Matches the file's other async mock stand-ins (fakeConcealModule et al.):
      // an explicit await keeps this a genuine microtask hop, not a disguised
      // sync return, satisfying both require-await and promise-function-async.
      await Promise.resolve();
      const msg = message as MovarMessage;
      if (msg.type === 'movar:contentStrings') {
        contentStringsAttempts += 1;
        if (contentStringsAttempts === 1) throw new Error('service worker unreachable');
        return contentStringsUk;
      }
      return;
    });

    const apply = vi.fn<ConcealMod['applyContentModification']>(async () => {
      await Promise.resolve();
      return [{ fromLang: 'ru', toLang: 'uk' }];
    });
    const mod = { ...fakeConcealModule(), applyContentModification: apply };
    installFakeChunks({ 'features/conceal.js': mod });
    // Dynamic import so this resolves to the SAME freshly-reset module instance
    // that content-runtime.ts (re-imported in beforeEach) reads from — a static
    // top-of-file import would bind to the pre-reset instance instead.
    const { getContentMessages } = await import('../../lib/i18n/content');

    const settings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide' as const,
      uiLanguage: 'uk' as const,
    };

    // First tick: the fetch fails — the catalogue stays on the bundled English
    // fallback for this pass (expected; nothing to retry from yet).
    await runtime.applyOnce(settings);
    await vi.waitFor(() => {
      expect(contentStringsAttempts).toBe(1);
    });
    expect(getContentMessages().liveRegion.concealed).toBe(
      'Movar hid content in blocked languages on this page',
    );

    // Second tick, same (unchanged) locale: pre-fix, ensureContentLocale's memo
    // treated 'uk' as already "applied" from the first (failed) attempt and
    // never called loadContentMessages again — permanently pinning the
    // live-region strings to English. Post-fix, a failed load isn't memoized as
    // final, so this tick retries and the catalogue localizes.
    await runtime.applyOnce(settings);
    await vi.waitFor(() => {
      expect(contentStringsAttempts).toBe(2);
    });
    await vi.waitFor(() => {
      expect(getContentMessages().liveRegion.concealed).toBe(
        'Мовар приховав вміст заблокованими мовами на цій сторінці',
      );
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

describe('UI-language change mid-classify re-conceals (#288)', () => {
  it('re-applies concealment once the in-flight tick clears, instead of leaving the page revealed', async () => {
    // A fake facade whose applyContentModification suspends until released —
    // stands in for a real tick parked at its classify round-trip.
    const releases: (() => void)[] = [];
    const apply = vi.fn<ConcealMod['applyContentModification']>(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return [];
    });
    const mod = { ...fakeConcealModule(), applyContentModification: apply };
    installFakeChunks({ 'features/conceal.js': mod });

    const settings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide' as const,
      uiLanguage: 'en' as const,
    };
    const live = { current: settings };
    runtime.installSettingsListener(live);

    // Tick A (e.g. a MutationObserver tick) parks mid-classify.
    const tickA = runtime.applyOnce(live.current);
    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalledTimes(1);
    });

    // A UI-language change lands while tick A is still in flight: the settings
    // listener tears down (revealing everything already concealed) and tries
    // to re-apply — but applyOnce's concurrency guard is still held by tick A.
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...settings, uiLanguage: 'uk' } } },
      'sync',
    );
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalledOnce();
    });
    // Pre-fix, the follow-up apply is silently dropped here, and nothing short
    // of an unrelated DOM mutation would ever re-run it.
    expect(apply).toHaveBeenCalledTimes(1);

    // Tick A's classify round-trip resolves; it is now stale (the settings
    // change bumped the generation), so it contributes no concealment.
    releases[0]!();
    await tickA;

    // The dropped re-apply must still run once tick A clears: the page gets
    // re-concealed — in the new locale's settings — instead of staying
    // revealed until an unrelated mutation happens to retrigger the observer.
    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalledTimes(2);
    });
    expect(apply.mock.calls[1]![0]).toMatchObject({ settings: { uiLanguage: 'uk' } });

    // Let the re-applied tick's own classify settle so it doesn't dangle past
    // this test.
    releases[1]!();
  });
});
