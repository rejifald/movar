/**
 * The content-filter layer's capability wiring as `applyOnce` drives it: the
 * curtain presenter's lifetime across ticks and conceal modes, and what happens
 * when a chunk fails to load.
 */
import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { CapabilityChunk } from './capabilities';
import { CAPABILITY_GAP_ATTR } from './movar-markers';
import { getAttemptedUrls } from './loop-guard';
import { RETRY_SETTLE_DELAY_MS } from './empty-results-retry';
import {
  fakeConcealModule,
  fakeCurtainUiModule,
  fakePresenter,
  installChunkLoader,
  installFakeChunks,
} from '../entrypoints/__tests__/content.test-utils';
import { stubLocation, useContentRuntime } from './content-runtime.test-utils';

vi.mock('./page-text', () => ({ sampleVisibleText: () => '' }));
vi.mock('./capability-loader', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  provisionCapabilities: vi.fn(),
}));

const h = useContentRuntime();

const curtain: MovarSettings = {
  ...defaultSettings,
  contentModification: true,
  concealMode: 'curtain',
};
const hide: MovarSettings = { ...curtain, concealMode: 'hide' };

/** The context each content pass was handed, in call order. */
function contexts(mod: ReturnType<typeof fakeConcealModule>) {
  return mod.applyContentModification.mock.calls.map(([ctx]) => ctx);
}

describe('curtain presenter lifetime', () => {
  it('keeps one presenter across ticks and refreshes its locale instead of rebuilding it', async () => {
    const mod = fakeConcealModule();
    const presenter = fakePresenter();
    const ui = fakeCurtainUiModule(presenter);
    installFakeChunks({ 'features/conceal.js': mod, 'features/curtain-ui.js': ui });

    await h.runtime.applyOnce(curtain);
    await h.runtime.applyOnce(curtain);

    expect(ui.createContentPresenter).toHaveBeenCalledOnce();
    expect(presenter.setLocale).toHaveBeenCalledWith('en');
    expect(contexts(mod).map((ctx) => ctx.presenter)).toEqual([presenter, presenter]);
  });

  it('hands a switch to hide mode the old presenter to clean up, then revokes it', async () => {
    const mod = fakeConcealModule();
    const presenter = fakePresenter();
    const ui = fakeCurtainUiModule(presenter);
    installFakeChunks({ 'features/conceal.js': mod, 'features/curtain-ui.js': ui });

    await h.runtime.applyOnce(curtain);
    await h.runtime.applyOnce(hide);

    const [, hideCtx] = contexts(mod);
    expect(hideCtx?.presenter).toBeUndefined();
    expect(hideCtx?.cleanupPresenter).toBe(presenter);
    expect(presenter.teardown).toHaveBeenCalledOnce();
    // Hide mode never loads curtain UI of its own.
    expect(ui.createContentPresenter).toHaveBeenCalledOnce();
  });

  it('still conceals, presenter-less, when the curtain chunk fails to load', async () => {
    // A missing curtain degrades to a hard hide: a working outcome, so the page
    // carries no capability-gap mark either.
    const mod = fakeConcealModule();
    installChunkLoader(
      vi.fn(async (path: CapabilityChunk) => {
        await Promise.resolve();
        if (path === 'features/curtain-ui.js') throw new Error('chunk fetch failed');
        return path === 'features/conceal.js' ? mod : {};
      }),
    );

    await h.runtime.applyOnce(curtain);

    expect(mod.applyContentModification).toHaveBeenCalledOnce();
    expect(contexts(mod)[0]?.presenter).toBeUndefined();
    expect(document.documentElement.hasAttribute(CAPABILITY_GAP_ATTR)).toBe(false);
  });
});

describe('conceal chunk outage', () => {
  it('marks the gap on <html>, conceals nothing, and recovers on the next tick', async () => {
    const mod = fakeConcealModule();
    let failNext = true;
    installChunkLoader(
      vi.fn(async (path: CapabilityChunk) => {
        await Promise.resolve();
        if (path !== 'features/conceal.js') return {};
        if (failNext) {
          failNext = false;
          throw new Error('service worker asleep');
        }
        return mod;
      }),
    );

    await h.runtime.applyOnce(hide);

    expect(document.documentElement.getAttribute(CAPABILITY_GAP_ATTR)).toBe('features/conceal.js');
    expect(mod.applyContentModification).not.toHaveBeenCalled();

    await h.runtime.applyOnce(hide);

    expect(document.documentElement.hasAttribute(CAPABILITY_GAP_ATTR)).toBe(false);
    expect(mod.applyContentModification).toHaveBeenCalledOnce();
  });
});

describe('empty-SERP retry settle gate', () => {
  it('waits for the window load before confirming the results area is empty', async () => {
    // Counting cards while the SERP is still streaming would read a page that
    // is about to fill as empty and reload it.
    vi.useFakeTimers();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    document.body.innerHTML = '<div id="search"><div id="rso"></div></div>';
    const loc = stubLocation('https://www.google.com/search?q=test&hl=uk&lr=lang_uk');

    expect(
      await h.runtime.applyOnce({
        ...defaultSettings,
        priority: ['uk'],
        contentModification: false,
      }),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS * 2);
    expect(loc.replace).not.toHaveBeenCalled();

    globalThis.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);

    expect(loc.replace).toHaveBeenCalledOnce();
    expect(new URL(loc.href).searchParams.has('lr')).toBe(false);
    expect(getAttemptedUrls()).toHaveLength(2);
  });
});
