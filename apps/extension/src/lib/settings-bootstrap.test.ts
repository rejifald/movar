import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import { initialiseSettings, syncFromNative, syncToNative } from './settings-bootstrap';

const SETTINGS_KEY = 'settings';

interface NativeMessage {
  type: string;
  settings?: unknown;
}

/** Install a native-messaging stub whose FIRST call waits for `release()`. */
function gatedNative(reply: (msg: NativeMessage) => unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = vi.fn(async (_app: string, msg: NativeMessage) => {
    if (send.mock.calls.length === 1) await gate;
    return reply(msg);
  });
  (fakeBrowser.runtime as { sendNativeMessage?: unknown }).sendNativeMessage = send;
  return { send, release };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubEnv('BROWSER', 'safari');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('settings bootstrap queue', () => {
  it('starts first-run init only after an in-flight reconcile has finished', async () => {
    const hostChoice = { ...defaultSettings, contentModification: true };
    const { send, release } = gatedNative((msg) =>
      msg.type === 'getSettings' ? { rev: 1, settings: hostChoice } : { ok: true, rev: 2 },
    );

    const wake = syncFromNative();
    const install = initialiseSettings();
    // Let every unqueued step run: init must not have read, written or messaged.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(send).toHaveBeenCalledTimes(1);
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toBeUndefined();

    release();
    await Promise.all([wake, install]);

    const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] as {
      contentModification: boolean;
    };
    expect(stored.contentModification).toBe(true);
  });

  it('keeps running later tasks after one rejects', async () => {
    vi.spyOn(fakeBrowser.storage.sync, 'set').mockRejectedValueOnce(new Error('quota'));
    (fakeBrowser.runtime as { sendNativeMessage?: unknown }).sendNativeMessage = vi.fn(
      (_app: string, msg: NativeMessage) =>
        msg.type === 'getSettings' ? { rev: 0, settings: null } : { ok: true, rev: 1 },
    );

    await expect(initialiseSettings()).rejects.toThrow('quota');
    await expect(initialiseSettings()).resolves.toBeUndefined();
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual(
      defaultSettings,
    );
  });

  it('skips the App Group outside Safari', async () => {
    vi.stubEnv('BROWSER', 'chrome');
    const send = vi.fn();
    (fakeBrowser.runtime as { sendNativeMessage?: unknown }).sendNativeMessage = send;

    await initialiseSettings();
    await syncFromNative();
    await syncToNative();

    expect(send).not.toHaveBeenCalled();
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual(
      defaultSettings,
    );
  });
});
