import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { MovarMessage } from '../../lib/messaging';
import type { CapabilityChunk } from '../../lib/capabilities';
import type { ChunkLoader } from '../../lib/capability-loader';
import { createCapabilityLoader, provisionCapabilities } from '../../lib/capability-loader';
import { appendCorrectionEventsSerialized } from '../../lib/events';
import type * as ConcealFeatureModule from '../../dynamic/features/conceal';
import type * as CurtainUiFeatureModule from '../../dynamic/features/curtain-ui';

/** Background stand-in for the correction funnel: events.ts now sends
 *  `movar:logCorrections` to the single background serialized writer (fix for
 *  #310) instead of writing storage in-tab, so a receiver must exist for the
 *  end-to-end retry test's write to land. Returning the append promise makes the
 *  content-side `sendMessage` await the write. Registered per-test (fakeBrowser
 *  clears listeners each beforeEach). */
export function correctionSink(raw: unknown): unknown {
  const msg = raw as MovarMessage;
  return msg.type === 'movar:logCorrections'
    ? appendCorrectionEventsSerialized(msg.events)
    : undefined;
}

/** Stand-ins for lazily-loaded dynamic capability chunks. The real modules
 *  resolve from web-accessible files via runtime.getURL, which jsdom can't
 *  import. vi.fn()s keep call assertions precise. */
export type ConcealMod = typeof ConcealFeatureModule;
export type CurtainUiMod = typeof CurtainUiFeatureModule;

export function fakeConcealModule() {
  return {
    applyContentModification: vi.fn<ConcealMod['applyContentModification']>(async () => {
      await Promise.resolve();
      return [];
    }),
    teardownContentModification: vi.fn<ConcealMod['teardownContentModification']>(),
    revealAllContent: vi.fn<ConcealMod['revealAllContent']>(),
  };
}

export interface FakePresenter {
  hasVisiblePresentation: boolean;
  attachContentCurtain: Mock<() => null>;
  detachCurtains: Mock<() => void>;
  attachPickerContainerCurtain: Mock<() => null>;
  attachPickerEntryCurtain: Mock<() => null>;
  pickerHiddenOptionLabel: Mock<() => string>;
  copyRevision: Mock<() => string>;
  attachPickerSurvivorTooltip: Mock<() => null>;
  detachAllTooltips: Mock<() => void>;
  setLocale: Mock<() => Promise<void>>;
  setColorScheme: Mock<() => void>;
  teardown: Mock<() => void>;
}

export function fakePresenter(): FakePresenter {
  return {
    hasVisiblePresentation: true,
    attachContentCurtain: vi.fn(() => null),
    detachCurtains: vi.fn(),
    attachPickerContainerCurtain: vi.fn(() => null),
    attachPickerEntryCurtain: vi.fn(() => null),
    pickerHiddenOptionLabel: vi.fn(() => 'Movar: hidden'),
    copyRevision: vi.fn(() => 'en'),
    attachPickerSurvivorTooltip: vi.fn(() => null),
    detachAllTooltips: vi.fn(),
    setLocale: vi.fn(async () => {
      await Promise.resolve();
    }),
    setColorScheme: vi.fn(),
    teardown: vi.fn(),
  };
}

export function fakeCurtainUiModule(presenter = fakePresenter()) {
  return {
    createContentPresenter: vi.fn<CurtainUiMod['createContentPresenter']>(async () => {
      await Promise.resolve();
      return presenter;
    }),
  };
}

function defaultFakeChunks(): Partial<Record<CapabilityChunk, object>> {
  return {
    'features/conceal.js': fakeConcealModule(),
    'features/curtain-ui.js': fakeCurtainUiModule(),
  };
}

export function fakeChunkLoader(
  modules: Partial<Record<CapabilityChunk, object>> = defaultFakeChunks(),
) {
  const loader = vi.fn<ChunkLoader>(async (path) => {
    await Promise.resolve();
    return modules[path] ?? {};
  });
  return loader;
}

export function installChunkLoader(loader: ReturnType<typeof fakeChunkLoader>) {
  const capabilityLoader = createCapabilityLoader(loader);
  vi.mocked(provisionCapabilities).mockImplementation(capabilityLoader.provisionCapabilities);
  return loader;
}

export function installFakeChunks(
  modules: Partial<Record<CapabilityChunk, object>> = defaultFakeChunks(),
) {
  return installChunkLoader(fakeChunkLoader(modules));
}
