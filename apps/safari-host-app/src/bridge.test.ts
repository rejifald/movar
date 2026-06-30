import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import {
  callNative,
  hostSettingsSource,
  openSafariPreferences,
  resetBridgeForTest,
  subscribe,
} from './bridge';
import type { HostState, Platform } from './bridge';

/** Drive the state feed the way Swift's `evaluateJavaScript("show(...)")` does. */
function nativeShow(platform: Platform, enabled?: boolean, useSettings?: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- installed at module eval
  globalThis.show!(platform, enabled, useSettings);
}

/** Deliver a native reply the way Swift's `window.__movarReply(id, json)` does. */
function nativeReply(id: number, json: string | null): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- installed at module eval
  globalThis.__movarReply!(id, json);
}

/** Install a fake `webkit.controller` that records the posted request envelopes
 *  so a test can grab the auto-assigned `id` and reply to it. */
function installBridge(): { posts: { type: string; id: number; payload: unknown }[] } {
  const posts: { type: string; id: number; payload: unknown }[] = [];
  (globalThis as unknown as { webkit: unknown }).webkit = {
    messageHandlers: {
      controller: {
        postMessage: (message: { type: string; id: number; payload: unknown }) =>
          posts.push(message),
      },
    },
  };
  return { posts };
}

function removeBridge(): void {
  delete (globalThis as unknown as { webkit?: unknown }).webkit;
}

beforeEach(() => {
  resetBridgeForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  removeBridge();
});

// ===========================================================================
// Channel 1 — show() state feed
// ===========================================================================

describe('global show install', () => {
  it('installs window.show and window.__movarReply at module eval', () => {
    expect(typeof globalThis.show).toBe('function');
    expect(typeof globalThis.__movarReply).toBe('function');
  });
});

describe('subscribe — timing buffer', () => {
  it('replays a show() that arrived BEFORE subscribe (the didFinish race)', () => {
    // Swift fires show('mac') at didFinish, which can land before React mounts.
    nativeShow('mac', true, true);

    const states: HostState[] = [];
    subscribe((s) => states.push(s));

    expect(states).toEqual([{ platform: 'mac', enabled: true, useSettings: true }]);
  });

  it('forwards later show() calls as a live feed (focus-regain refresh)', () => {
    const states: HostState[] = [];
    subscribe((s) => states.push(s));

    nativeShow('mac', false, true); // fresh install / disabled
    nativeShow('mac', true, true); // user enabled, app regained focus

    expect(states).toEqual([
      { platform: 'mac', enabled: false, useSettings: true },
      { platform: 'mac', enabled: true, useSettings: true },
    ]);
  });

  it('fans a single push out to multiple subscribers', () => {
    const a: HostState[] = [];
    const b: HostState[] = [];
    subscribe((s) => a.push(s));
    subscribe((s) => b.push(s));

    nativeShow('ios');

    const expected = [{ platform: 'ios', enabled: undefined, useSettings: undefined }];
    expect(a).toEqual(expected);
    expect(b).toEqual(expected);
  });

  it('stops delivering to a subscriber after it unsubscribes', () => {
    const states: HostState[] = [];
    const unsubscribe = subscribe((s) => states.push(s));
    nativeShow('mac', true, true);
    unsubscribe();
    nativeShow('mac', false, true);

    expect(states).toHaveLength(1);
  });
});

// ===========================================================================
// Channel 2 — callNative request/reply
// ===========================================================================

describe('callNative — request/reply', () => {
  it('posts a structured {type,id,payload} envelope and resolves via __movarReply', async () => {
    const { posts } = installBridge();

    const promise = callNative<{ ok: boolean }>('readSettings', { foo: 1 });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ type: 'readSettings', payload: { foo: 1 } });

    // Swift replies with JSON keyed by the auto-assigned id.
    nativeReply(posts[0]!.id, JSON.stringify({ ok: true }));
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('normalizes an omitted payload to null in the envelope', async () => {
    const { posts } = installBridge();
    const promise = callNative('open-preferences');
    expect(posts[0]).toMatchObject({ type: 'open-preferences', payload: null });
    nativeReply(posts[0]!.id, null);
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null for a malformed JSON reply body', async () => {
    const { posts } = installBridge();
    const promise = callNative('readSettings');
    nativeReply(posts[0]!.id, '{not valid json');
    await expect(promise).resolves.toBeNull();
  });

  it('ignores a reply for an unknown / already-settled id', async () => {
    const { posts } = installBridge();
    const promise = callNative('readSettings');
    nativeReply(9999, '{}'); // unknown id — must not settle the real request
    nativeReply(posts[0]!.id, JSON.stringify({ real: true }));
    await expect(promise).resolves.toEqual({ real: true });
  });

  it('resolves undefined when the reply is dropped past the 4000ms timeout', async () => {
    vi.useFakeTimers();
    installBridge();
    const promise = callNative('readSettings');
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves undefined immediately (no post) when the native bridge is absent', async () => {
    removeBridge();
    await expect(callNative('readSettings')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// SettingsSource — the bridge-backed read/write port
// ===========================================================================

describe('hostSettingsSource.read', () => {
  it('unwraps {settings} from readSettings and normalizes it', async () => {
    const { posts } = installBridge();
    const promise = hostSettingsSource.read();
    expect(posts[0]).toMatchObject({ type: 'readSettings' });

    // A partial/legacy record: missing fields fill from defaults, and the
    // locked-language invariant ('ru' blocked) is re-asserted by normalization.
    nativeReply(posts[0]!.id, JSON.stringify({ settings: { enabled: false, priority: ['uk'] } }));

    const result = await promise;
    expect(result.enabled).toBe(false);
    expect(result.priority).toEqual(['uk']);
    expect(result.blocked).toContain('ru');
    expect(typeof result.schemaVersion).toBe('number');
  });

  it('falls back to defaults when the bridge is absent (browser preview)', async () => {
    removeBridge();
    await expect(hostSettingsSource.read()).resolves.toEqual(defaultSettings);
  });
});

describe('hostSettingsSource.write', () => {
  it('posts writeSettings with the normalized settings payload', async () => {
    const { posts } = installBridge();
    // A settings object that violates the locked invariant: 'ru' in priority.
    const dirty = { ...defaultSettings, priority: ['ru', 'uk'] as MovarSettings['priority'] };

    const promise = hostSettingsSource.write(dirty);
    expect(posts[0]).toMatchObject({ type: 'writeSettings' });
    const payload = posts[0]!.payload as MovarSettings;
    // normalize() must have stripped 'ru' from priority and kept it blocked.
    expect(payload.priority).not.toContain('ru');
    expect(payload.blocked).toContain('ru');

    nativeReply(posts[0]!.id, null);
    await expect(promise).resolves.toBeUndefined();
  });

  it('is a no-op that resolves when the bridge is absent', async () => {
    removeBridge();
    await expect(hostSettingsSource.write(defaultSettings)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// Fire-and-forget actions
// ===========================================================================

describe('openSafariPreferences', () => {
  it('posts an open-preferences request to the native controller handler', () => {
    const { posts } = installBridge();
    openSafariPreferences();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ type: 'open-preferences', payload: null });
  });

  it('is a no-op when the native bridge is absent (e.g. browser preview)', () => {
    removeBridge();
    expect(() => {
      openSafariPreferences();
    }).not.toThrow();
  });
});
