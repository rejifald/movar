/**
 * Native bridge between the React host screen and the Swift host
 * (`Shared (App)/ViewController.swift`).
 *
 * This is the unification of the two channels the old static `Script.js` and
 * the #168 onboarding `bridge.ts` each owned, so the Swift side needs no
 * behavioural change:
 *
 *  1. **Swift → web, one-way state feed (`show()`).** After the WKWebView
 *     finishes loading, Swift calls `evaluateJavaScript("show('ios')")` /
 *     `show('mac', enabled, useSettings)`. We expose a global `show()` that
 *     records the latest state and notifies subscribers the React tree
 *     registers via {@link useHostState}. macOS re-calls `show()` every time the
 *     app regains focus (the `didBecomeActive` observer), so the screen must
 *     treat `show()` as a live state feed, not a one-shot.
 *
 *  2. **web → Swift, request/reply channel (`callNative`).** The web layer
 *     can't touch the shared App Group directly, so it posts a structured
 *     `{ type, id, payload }` message to the `controller`
 *     WKScriptMessageHandler and awaits a reply Swift delivers back via
 *     `window.__movarReply(id, json)`. Used by the Settings tab to
 *     read/write `MovarSettings` (the extension reconciles it) and by the
 *     macOS "Open Safari Settings" button. Absent outside the app (a plain
 *     browser preview, the dev server, unit tests) → `callNative` resolves
 *     `undefined` so the page still renders with defaults.
 *
 * TIMING — why `show()` is installed at MODULE EVAL, not in a React effect.
 * The old `Script.js` (`defer`) defined `show` synchronously, so it existed
 * before Swift's `didFinish` fired `show('mac')`. React's effects run *after*
 * the first commit, which can land after `didFinish`. So this module installs
 * `window.show` the instant it's imported (before React mounts) and buffers the
 * most recent state; subscribing replays it immediately on registration.
 * Without this, the very first state push from the host could be dropped and
 * the screen would sit blank on launch. `window.__movarReply` is installed at
 * the same time for the symmetric reason — a reply could land before any React
 * effect runs.
 *
 * Keeping every `webkit`/global touch behind this module means the rest of the
 * React tree is plain, testable code with no `any`-typed global poking.
 */
import { useEffect, useState } from 'react';
import { defaultSettings, enforceLockedLanguages } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
// `migrateSettings` is the roaming-tolerant coercer; the package exposes it on
// the `/migrate` subpath (not the main barrel), exactly as the extension's
// `lib/settings.ts` imports it.
import { migrateSettings } from '@movar/settings/migrate';

/** Platform the host reports. */
export type Platform = 'ios' | 'mac';

/** A single host-state snapshot pushed from Swift via `show()`. */
export interface HostState {
  platform: Platform;
  /** Extension enabled? `undefined` on iOS (the host can't query it there). */
  enabled: boolean | undefined;
  /** macOS 13+ renamed the pane "Settings" (was "Preferences" on 12 and
   *  earlier). Swift passes the flag; we pick the matching label. `undefined`
   *  on iOS / before the host reports. */
  useSettings: boolean | undefined;
}

type StateListener = (state: HostState) => void;

/** Minimal shape of the `webkit.messageHandlers` bridge WKWebView injects.
 *  Declared locally (not via lib.dom) so the touch point is explicit and the
 *  fallback path is type-checked. The handler accepts the structured
 *  request envelope `callNative` posts. */
interface NativeRequest {
  type: string;
  id: number;
  payload: unknown;
}

interface WebKitBridge {
  messageHandlers?: {
    controller?: { postMessage: (message: NativeRequest) => void };
  };
}

declare global {
  // Declared as `var` (not just on `interface Window`) so they're typed on
  // `globalThis` itself — the repo lints `window` → `globalThis`, and a
  // `Window`-only augmentation isn't visible through `globalThis`.
  // eslint-disable-next-line no-var -- `var` is required for a globalThis augmentation
  var webkit: WebKitBridge | undefined;
  /** Installed at module eval by this file; invoked by Swift's
   *  `evaluateJavaScript`. Signature matches the legacy `Script.js`. */
  // eslint-disable-next-line no-var -- `var` is required for a globalThis augmentation
  var show: ((platform: Platform, enabled?: boolean, useSettings?: boolean) => void) | undefined;
  /** Installed at module eval by this file; invoked by Swift to deliver a
   *  reply to a pending `callNative` request, keyed by its `id`. The legacy
   *  `Script.js` owned the same global. */
  // eslint-disable-next-line no-var -- `var` is required for a globalThis augmentation
  var __movarReply: ((id: number, json: string | null) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Channel 1 — Swift → web one-way state feed (`show()` + subscribers).
// ---------------------------------------------------------------------------

/** Latest snapshot the host pushed, or `null` before the first `show()`. */
let latest: HostState | null = null;
/** Active subscribers (each `useHostState` mount). A Set so multiple tabs /
 *  components can read the same live feed. */
const listeners = new Set<StateListener>();

/** Record a state push and forward it to every subscriber. Mirrors the old
 *  `Script.js`: `enabled === true` is the only "on" signal — `false`/
 *  `undefined` both mean "show setup". */
function pushState(platform: Platform, enabled?: boolean, useSettings?: boolean): void {
  latest = { platform, enabled, useSettings };
  for (const listener of listeners) listener(latest);
}

/**
 * Subscribe to host state pushes. Immediately replays the most recent snapshot
 * (if any arrived before this call), then forwards every later `show()`.
 * Returns an unsubscribe; in the app the WebView outlives the subscription, so
 * teardown only matters for hot-reload / tests.
 */
export function subscribe(next: StateListener): () => void {
  listeners.add(next);
  if (latest !== null) next(latest);
  return () => {
    listeners.delete(next);
  };
}

// ---------------------------------------------------------------------------
// Channel 2 — web → Swift request/reply (`callNative` + `__movarReply`).
// ---------------------------------------------------------------------------

/** Is the native message handler present? False in a plain browser / tests, so
 *  `callNative` short-circuits to `undefined` and the page renders with
 *  defaults. */
function hasBridge(): boolean {
  return Boolean(globalThis.webkit?.messageHandlers?.controller);
}

let seq = 0;
/** In-flight requests, keyed by `id`; the resolver is called by `__movarReply`
 *  (or by the timeout). */
const pending = new Map<number, (value: unknown) => void>();

/** Maximum time to wait for a native reply before resolving `undefined`. A
 *  dropped reply must not wedge the Settings form forever. Matches the legacy
 *  `Script.js` (4000ms). */
const REPLY_TIMEOUT_MS = 4000;

/**
 * Post a structured request to the native `controller` handler and await its
 * reply. Resolves `undefined` when the bridge is absent (browser preview, dev
 * server, tests) or the reply is dropped past {@link REPLY_TIMEOUT_MS}, so a
 * misconfigured host degrades quietly instead of hanging. `T` is the caller's
 * expectation of the parsed JSON reply; callers must treat it as untrusted.
 */
export async function callNative<T = unknown>(
  type: string,
  payload?: unknown,
): Promise<T | undefined> {
  if (!hasBridge()) return;
  return new Promise<T | undefined>((resolve) => {
    const id = ++seq;
    pending.set(id, resolve as (value: unknown) => void);
    globalThis.webkit?.messageHandlers?.controller?.postMessage({
      type,
      id,
      payload: payload ?? null,
    });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        // Settle with "no reply" — the dropped-reply fallback. `void 0` rather
        // than the `undefined` literal keeps `unicorn/no-useless-undefined`
        // happy while still resolving the promise.
        resolve(void 0);
      }
    }, REPLY_TIMEOUT_MS);
  });
}

/** Deliver a native reply to its pending request. Installed on `globalThis`
 *  for Swift's `evaluateJavaScript("window.__movarReply(id, json)")`. Tolerates
 *  an unknown / already-timed-out id (no-op) and a malformed JSON body
 *  (resolves `null`), exactly as the legacy `Script.js`. */
function deliverReply(id: number, json: string | null): void {
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  let value: unknown;
  try {
    value = json == null || json === '' ? null : JSON.parse(json);
  } catch {
    value = null;
  }
  resolve(value);
}

// Install both globals the instant this module is imported — before React
// mounts — so a `show()` or a `__movarReply()` Swift fires before any effect
// runs is captured, not lost to the effect-timing gap described above. Guarded
// for non-browser test contexts.
if (typeof globalThis !== 'undefined') {
  globalThis.show = pushState;
  globalThis.__movarReply = deliverReply;
}

/** Test-only: reset every module-level buffer (state feed + in-flight
 *  requests + seq) between cases. */
export function resetBridgeForTest(): void {
  latest = null;
  listeners.clear();
  pending.clear();
  seq = 0;
}

// ---------------------------------------------------------------------------
// React surface — the host-state hook.
// ---------------------------------------------------------------------------

/**
 * Subscribe a component to the native `show()` state feed. Returns the latest
 * snapshot, or `null` before the host has reported a platform (the pre-`show()`
 * window — Swift reveals the real platform/state asynchronously). Re-renders on
 * every later push (the macOS app re-pushes on each focus-regain, so this is a
 * live feed, not a one-shot).
 */
export function useHostState(): HostState | null {
  const [state, setState] = useState<HostState | null>(null);
  useEffect(() => subscribe(setState), []);
  return state;
}

// ---------------------------------------------------------------------------
// Settings port — the Settings tab's read/write adapter over `callNative`.
// ---------------------------------------------------------------------------

/**
 * Storage-agnostic settings port the Settings tab drives. The host
 * implementation round-trips `MovarSettings` through the App Group via the
 * native bridge; both directions normalize through
 * `enforceLockedLanguages(migrateSettings(raw))` so a value roaming in from an
 * older/newer build (or a partial/garbage payload) is always coerced to the
 * current schema with the locked-language invariant ('ru' blocked) re-asserted.
 *
 * Shaped as an injectable interface (not a bare function pair) so Phase C's
 * Settings tab and its tests depend on the port, not on `webkit` — a fake that
 * keeps an in-memory `MovarSettings` satisfies it.
 */
export interface SettingsSource {
  /** Load the current settings from the host (defaults when none / standalone). */
  read: () => Promise<MovarSettings>;
  /** Persist the given settings to the host (fire-and-forget for the caller;
   *  the returned promise resolves once the write request has been posted /
   *  acknowledged). */
  write: (settings: MovarSettings) => Promise<void>;
}

/** Normalize an untrusted stored value into a valid `MovarSettings`. Pure;
 *  shared by `read` and `write` so the same invariant is enforced on the way in
 *  and the way out. */
function normalizeSettings(raw: unknown): MovarSettings {
  return enforceLockedLanguages(migrateSettings(raw));
}

/**
 * The production {@link SettingsSource} backed by the native bridge.
 *
 * `read` posts `readSettings`; the legacy host wraps the stored record as
 * `{ settings: <raw> }`, so we unwrap `.settings` (falling back to
 * `defaultSettings` when the bridge is absent or the host has nothing stored).
 * `write` posts `writeSettings` with the normalized value — re-normalized first
 * so a caller can never persist a settings object that violates the
 * locked-language invariant.
 */
export const hostSettingsSource: SettingsSource = {
  async read(): Promise<MovarSettings> {
    const res = await callNative<{ settings?: unknown }>('readSettings');
    // The legacy host wraps the stored record as `{ settings: <raw> }`; fall
    // back to defaults when the bridge is absent or nothing is stored.
    const raw = res?.settings ?? defaultSettings;
    return normalizeSettings(raw);
  },
  async write(settings: MovarSettings): Promise<void> {
    await callNative('writeSettings', normalizeSettings(settings));
  },
};

// ---------------------------------------------------------------------------
// Fire-and-forget host actions.
// ---------------------------------------------------------------------------

/**
 * Post the macOS "open Safari settings" request to the native side. (Only
 * macOS even renders the button.) Swift opens Safari's Extensions pane; it
 * deliberately does NOT quit, and the focus-regain observer refreshes us to the
 * "on" state. Fire-and-forget — we don't await the reply. No-op when the bridge
 * is absent.
 */
export function openSafariPreferences(): void {
  void callNative('open-preferences');
}
