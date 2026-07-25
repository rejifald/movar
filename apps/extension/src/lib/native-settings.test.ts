import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import {
  isNativeBridgeAvailable,
  pushSettingsToNative,
  reconcileNativeSettings,
} from './native-settings';

const SETTINGS_KEY = 'settings';
const NATIVE_REV_KEY = 'movar:nativeRev';

interface NativeMessage {
  type: string;
  settings?: unknown;
}

/** fake-browser has no native-messaging surface; install a stub the bridge can
 *  call. Returns the spy so a test can assert the message shape / call count. */
function mockNative(impl: (msg: NativeMessage) => unknown) {
  const fn = vi.fn(async (_app: string, msg: NativeMessage) => await impl(msg));
  // Augment the fake runtime with the Safari-only native-messaging API.
  (fakeBrowser.runtime as { sendNativeMessage?: unknown }).sendNativeMessage = fn;
  return fn;
}

async function storedSync(): Promise<MovarSettings> {
  return (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] as MovarSettings;
}

async function seenRev(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(NATIVE_REV_KEY))[NATIVE_REV_KEY];
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isNativeBridgeAvailable', () => {
  it('reflects the Safari build target', () => {
    expect(isNativeBridgeAvailable()).toBe(import.meta.env['BROWSER'] === 'safari');
  });
});

describe('reconcileNativeSettings', () => {
  it('adopts the App Group blob into storage.sync when its rev advanced', async () => {
    const native = mockNative((msg) =>
      msg.type === 'getSettings'
        ? { rev: 5, settings: { ...defaultSettings, enabled: false } }
        : { ok: true, rev: 6 },
    );

    await reconcileNativeSettings();

    expect((await storedSync()).enabled).toBe(false);
    expect(await seenRev()).toBe(5);
    // Adoption pulls only; it must not push back (that would race its own write).
    expect(native).toHaveBeenCalledTimes(1);
    expect(native).toHaveBeenCalledWith(expect.anything(), { type: 'getSettings' });
  });

  it('re-asserts the locked-language invariant on an adopted blob', async () => {
    mockNative((msg) =>
      msg.type === 'getSettings'
        ? { rev: 2, settings: { ...defaultSettings, blocked: [], priority: ['uk', 'ru', 'en'] } }
        : { ok: true, rev: 3 },
    );

    await reconcileNativeSettings();

    const stored = await storedSync();
    expect(stored.blocked).toContain('ru');
    expect(stored.priority).not.toContain('ru');
  });

  it('seeds an empty App Group from current settings (first run)', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: { ...defaultSettings, enabled: false } });
    const native = mockNative((msg) =>
      msg.type === 'getSettings' ? { rev: 0, settings: null } : { ok: true, rev: 1 },
    );

    await reconcileNativeSettings();

    expect(native).toHaveBeenCalledWith(expect.anything(), {
      type: 'setSettings',
      settings: expect.objectContaining({ enabled: false }),
    });
    expect(await seenRev()).toBe(1);
  });

  it('does nothing when the App Group rev is not newer than what we have seen', async () => {
    await fakeBrowser.storage.local.set({ [NATIVE_REV_KEY]: 5 });
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: { ...defaultSettings, enabled: false } });
    const native = mockNative(() => ({ rev: 5, settings: { ...defaultSettings, enabled: true } }));

    await reconcileNativeSettings();

    // Not adopted — our newer/equal local copy stands.
    expect((await storedSync()).enabled).toBe(false);
    // getSettings only; no push, since the App Group already holds a blob.
    expect(native).toHaveBeenCalledTimes(1);
  });

  it('no-ops when the native host is unreachable', async () => {
    mockNative(() => {
      throw new Error('no native host');
    });

    await expect(reconcileNativeSettings()).resolves.toBeUndefined();
    expect(await seenRev()).toBeUndefined();
  });

  it('re-adopts on the next reconcile when the sync write rejected (no silent drop, #315)', async () => {
    mockNative((msg) =>
      msg.type === 'getSettings'
        ? { rev: 5, settings: { ...defaultSettings, enabled: false } }
        : { ok: true, rev: 6 },
    );
    const setSpy = vi
      .spyOn(fakeBrowser.storage.sync, 'set')
      .mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM'));

    // The sync write rejects mid-adoption. The rejection must be swallowed (not
    // surface as an unhandled rejection) and — the crux of #315 — `seenRev` must
    // NOT advance, or the change is dropped forever.
    await expect(reconcileNativeSettings()).resolves.toBeUndefined();
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(await seenRev()).toBeUndefined();
    expect(await storedSync()).toBeUndefined();

    // Next reconcile: nativeRev (5) still outranks seenRev, so adoption retries —
    // this time the write lands and the host app's change is finally adopted.
    setSpy.mockRestore();
    await reconcileNativeSettings();
    expect((await storedSync()).enabled).toBe(false);
    expect(await seenRev()).toBe(5);
  });

  it('does not re-adopt after its own push-back advances the rev, even if the push-back lands first (loop-safe)', async () => {
    // A stateful App Group: getSettings returns the current blob+rev; a
    // setSettings FROM the extension (the push-back) assigns the next rev —
    // exactly the native side's contract.
    const store = { rev: 5, settings: { ...defaultSettings, enabled: false } as unknown };
    const native = mockNative((msg) => {
      if (msg.type === 'getSettings') return { rev: store.rev, settings: store.settings };
      store.rev += 1;
      store.settings = msg.settings;
      return { ok: true, rev: store.rev };
    });

    // Force the worst-case interleave: the push-back (background.ts
    // onSettingsChange → pushSettingsToNative) completes — recording the higher
    // rev — BEFORE the adopting reconcile records its own. Only a monotonic
    // seenRev keeps this from regressing into a re-adopt loop.
    const realSet = fakeBrowser.storage.sync.set.bind(fakeBrowser.storage.sync);
    const setSpy = vi.spyOn(fakeBrowser.storage.sync, 'set').mockImplementation(async (items) => {
      await realSet(items);
      await pushSettingsToNative();
    });

    await reconcileNativeSettings(); // adopts rev 5; the racing push-back records rev 6

    // seenRev held at 6 (never regressed to 5) and the App Group advanced once.
    expect(await seenRev()).toBe(6);
    expect(store.rev).toBe(6);

    setSpy.mockRestore();
    native.mockClear();
    await reconcileNativeSettings(); // rev 6 == seenRev 6 → nothing to adopt, no push-back
    expect(native).toHaveBeenCalledTimes(1);
    expect(native).toHaveBeenCalledWith(expect.anything(), { type: 'getSettings' });
    expect(await seenRev()).toBe(6);
    expect(store.rev).toBe(6);
  });
});

describe('pushSettingsToNative', () => {
  it('sends current settings and records the rev the app assigned', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: { ...defaultSettings, enabled: false } });
    const native = mockNative(() => ({ ok: true, rev: 9 }));

    await pushSettingsToNative();

    expect(native).toHaveBeenCalledWith(expect.anything(), {
      type: 'setSettings',
      settings: expect.objectContaining({ enabled: false }),
    });
    expect(await seenRev()).toBe(9);
  });

  it('leaves the seen rev untouched when the host is unreachable', async () => {
    mockNative(() => {
      throw new Error('no native host');
    });

    await pushSettingsToNative();
    expect(await seenRev()).toBeUndefined();
  });
});
