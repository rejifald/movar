import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingState, Platform } from './bridge';
import { openSafariPreferences, resetBridgeForTest, subscribe } from './bridge';

/** Drive the bridge the way Swift's `evaluateJavaScript("show(...)")` does. */
function nativeShow(platform: Platform, enabled?: boolean, useSettings?: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- installed at module eval
  globalThis.show!(platform, enabled, useSettings);
}

beforeEach(() => {
  resetBridgeForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('global show install', () => {
  it('is installed at module eval, before any subscribe', () => {
    expect(typeof globalThis.show).toBe('function');
  });
});

describe('subscribe — timing buffer', () => {
  it('replays a show() that arrived BEFORE subscribe (the didFinish race)', () => {
    // Swift fires show('mac') at didFinish, which can land before React mounts.
    nativeShow('mac', true, true);

    const states: OnboardingState[] = [];
    subscribe((s) => states.push(s));

    // The buffered snapshot must be delivered on subscription, not dropped.
    expect(states).toEqual([{ platform: 'mac', enabled: true, useSettings: true }]);
  });

  it('forwards later show() calls as a live feed (focus-regain refresh)', () => {
    const states: OnboardingState[] = [];
    subscribe((s) => states.push(s));

    nativeShow('mac', false, true); // fresh install / disabled
    nativeShow('mac', true, true); // user enabled, app regained focus

    expect(states).toEqual([
      { platform: 'mac', enabled: false, useSettings: true },
      { platform: 'mac', enabled: true, useSettings: true },
    ]);
  });

  it('passes iOS state through with enabled/useSettings undefined', () => {
    const states: OnboardingState[] = [];
    subscribe((s) => states.push(s));

    nativeShow('ios');

    expect(states).toEqual([{ platform: 'ios', enabled: undefined, useSettings: undefined }]);
  });

  it('stops delivering after unsubscribe', () => {
    const states: OnboardingState[] = [];
    const unsubscribe = subscribe((s) => states.push(s));
    nativeShow('mac', true, true);
    unsubscribe();
    nativeShow('mac', false, true);

    expect(states).toHaveLength(1);
  });
});

describe('openSafariPreferences', () => {
  it('posts open-preferences to the native controller handler', () => {
    const postMessage = vi.fn();
    (globalThis as unknown as { webkit: unknown }).webkit = {
      messageHandlers: { controller: { postMessage } },
    };

    openSafariPreferences();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith('open-preferences');
    delete (globalThis as unknown as { webkit?: unknown }).webkit;
  });

  it('is a no-op when the native bridge is absent (e.g. browser preview)', () => {
    delete (globalThis as unknown as { webkit?: unknown }).webkit;
    expect(() => {
      openSafariPreferences();
    }).not.toThrow();
  });
});
