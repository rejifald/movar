/**
 * The runtime's live listeners at their edges: storage changes that don't
 * concern this tab, messages it doesn't own, and route changes that aren't new
 * pages. Each case is the "nothing should happen" half of a behaviour whose
 * positive half is pinned in src/entrypoints/__tests__/content.*.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { CapabilityChunk } from './capabilities';
import {
  fakeConcealModule,
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

const hide: MovarSettings = { ...defaultSettings, contentModification: true, concealMode: 'hide' };

function installConceal(): ReturnType<typeof fakeConcealModule> {
  const mod = fakeConcealModule();
  installFakeChunks({ 'features/conceal.js': mod });
  return mod;
}

describe('pause listener', () => {
  it('does not re-apply on a "resume" write when the tab was never paused', async () => {
    const mod = installConceal();
    const live = { current: hide };
    h.runtime.installPauseListener(live);
    await h.runtime.applyOnce(hide);
    mod.applyContentModification.mockClear();

    // A redundant resume (e.g. the background clearing an expired timer)...
    await fakeBrowser.storage.local.set({
      'movar:pausedIndefinitely': false,
      'movar:pausedUntil': null,
    });
    // ...followed by a real pause. Both reactions read storage in order, so
    // once the pause has torn the page down, the resume has been handled too.
    await fakeBrowser.storage.local.set({ 'movar:pausedIndefinitely': true });
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalledOnce();
    });

    expect(mod.applyContentModification).not.toHaveBeenCalled();
  });
});

describe('snooze listener', () => {
  it('ignores a snooze of some other host', async () => {
    const mod = installConceal();
    const live = { current: hide };
    h.runtime.installSnoozeListener(live);
    await h.runtime.applyOnce(hide);
    mod.applyContentModification.mockClear();

    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { 'other.example': Date.now() + 3_600_000 },
    });
    // Same ordering trick as the pause case: snoozing THIS host afterwards
    // proves the first change was already handled — without a teardown or a
    // spurious re-apply.
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': {
        'other.example': Date.now() + 3_600_000,
        [location.hostname]: Date.now() + 3_600_000,
      },
    });
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalledOnce();
    });

    expect(mod.applyContentModification).not.toHaveBeenCalled();
  });
});

describe('message bridge', () => {
  it('ignores an empty message instead of answering it', () => {
    h.runtime.installMessageBridge();
    const sendResponse = vi.fn();
    (
      fakeBrowser.runtime.onMessage.trigger as unknown as (
        message: unknown,
        sender: unknown,
        reply: (response?: unknown) => void,
      ) => void
    )(undefined, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('route changes that are not new pages', () => {
  it('leaves the tick in flight alone when the reported URL did not change', async () => {
    // A route change invalidates the running tick (it was keyed to the old URL);
    // a report naming the page we're already on must not cost that tick its
    // concealment.
    const mod = fakeConcealModule();
    let release: (() => void) | undefined;
    const chunkLoaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    installChunkLoader(
      vi.fn(async (path: CapabilityChunk) => {
        await chunkLoaded;
        return path === 'features/conceal.js' ? mod : {};
      }),
    );
    const live = { current: hide };
    const here = 'https://example.com/watch?v=a';
    stubLocation(here);

    const tick = h.runtime.applyOnce(hide);
    h.runtime.handleLocationChange(live, new URL(here), new URL(here));
    release?.();
    await tick;

    expect(mod.applyContentModification).toHaveBeenCalledOnce();
  });

  it('treats any query change as new content on a host whose rule never touches the query', () => {
    // electrica-shop switches by cookie + hreflang; `lang` there is the site's
    // own param, not one Movar manages, so a change to it is a different page.
    const live = { current: hide };
    const next = 'https://electrica-shop.com.ua/catalog?lang=ua';
    stubLocation(next);
    h.runtime.restoreAll();

    h.runtime.handleLocationChange(
      live,
      new URL(next),
      new URL('https://electrica-shop.com.ua/catalog?lang=ru'),
    );

    expect(h.runtime.getHiddenSummary().userOverride).toBe(false);
  });

  it('keeps "Show everything" when a same-path nav only reorders the query', () => {
    // The same content params in a different order are the same page.
    const live = { current: hide };
    const next = 'https://example.com/search?tbm=isch&q=hammer';
    stubLocation(next);
    h.runtime.restoreAll();

    h.runtime.handleLocationChange(
      live,
      new URL(next),
      new URL('https://example.com/search?q=hammer&tbm=isch'),
    );

    expect(h.runtime.getHiddenSummary().userOverride).toBe(true);
  });
});
