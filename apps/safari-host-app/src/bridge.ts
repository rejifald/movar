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
import { SOURCE_URL, changelogUrl } from '@movar/brand';
import { defaultSettings, enforceLockedLanguages } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
// `migrateSettings` is the roaming-tolerant coercer; the package exposes it on
// the `/migrate` subpath (not the main barrel), exactly as the extension's
// `lib/settings.ts` imports it.
import { migrateSettings } from '@movar/settings/migrate';
import type { HostLocale } from './i18n';

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
  /** iOS major version (e.g. `18`), passed by the iOS host so the About banner
   *  can show the version-correct Settings path — Apple only added the "Apps"
   *  grouping (Settings ▸ Apps ▸ Safari) in iOS 18; earlier iOS puts Safari at
   *  the Settings root. `undefined` on macOS / before the host reports / from an
   *  older host build that doesn't send it (treated as "modern" by the banner). */
  iosMajor: number | undefined;
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
   *  `evaluateJavaScript`. Signature extends the legacy `Script.js` with a
   *  trailing `iosMajor` — macOS keeps calling `show('mac', enabled,
   *  useSettings)`; iOS calls `show('ios', undefined, undefined, major)`. */
  // eslint-disable-next-line no-var -- `var` is required for a globalThis augmentation
  var show:
    | ((platform: Platform, enabled?: boolean, useSettings?: boolean, iosMajor?: number) => void)
    | undefined;
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
function pushState(
  platform: Platform,
  enabled?: boolean,
  useSettings?: boolean,
  iosMajor?: number,
): void {
  latest = { platform, enabled, useSettings, iosMajor };
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
 * server, tests) or the reply is dropped past `timeoutMs`, so a misconfigured
 * host degrades quietly instead of hanging. `T` is the caller's expectation of
 * the parsed JSON reply; callers must treat it as untrusted.
 *
 * `timeoutMs` defaults to {@link REPLY_TIMEOUT_MS}, which is right for the
 * actions that answer from local state (settings, an `open-url` hand-off). It
 * is a parameter because `probe` is not one of those: it makes real network
 * requests and walks a redirect chain, so it can legitimately take far longer
 * than a settings read ever should — see {@link PROBE_TIMEOUT_MS}. Timing a
 * probe out at 4s would abandon a request the native side is still making and
 * report the site as unreachable when it is merely slow.
 */
export async function callNative<T = unknown>(
  type: string,
  payload?: unknown,
  timeoutMs: number = REPLY_TIMEOUT_MS,
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
    }, timeoutMs);
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

/**
 * Post the "send feedback" request to the native side — the About footer's
 * "Send feedback" link, on every platform. Swift opens the support `mailto:`
 * (`@movar/brand`'s `FEEDBACK_URL`) via `UIApplication.open` /
 * `NSWorkspace.open`.
 *
 * Routing through the bridge — rather than a `mailto:` anchor the React layer
 * owns — is deliberate: under the WKWebView's `default-src 'self'` CSP a Swift
 * hand-off is the robust path, and it keeps every external escape going through
 * the one native entry point the preferences button already uses. Posts the
 * same structured `{ type: 'feedback', … }` envelope as every other
 * `callNative` action. Fire-and-forget; no-op when the bridge is absent (dev
 * server / preview / tests).
 *
 * Handled by `ViewController`'s `feedback` case, which opens its own copy of the
 * `mailto:` — this action carries no payload precisely so the address can't be
 * chosen by the page.
 */
export function openFeedback(): void {
  void callNative('feedback');
}

/**
 * Post an "open the source repository" request to the native side — the About
 * footer's "Source code" link (`@movar/brand`'s {@link SOURCE_URL}, the public
 * GitHub repo), on every platform.
 *
 * Routed through the bridge rather than a plain `<a href>` for the same reason
 * as {@link openFeedback}: under the WKWebView's `default-src 'self'` CSP — and
 * with no external-navigation handling in `ViewController` — a Swift hand-off
 * (`UIApplication.open` / `NSWorkspace.open`) is the robust way to open an
 * external URL, and it keeps every escape going through the one native entry
 * point. Posts `{ type: 'open-url', payload: SOURCE_URL }`; fire-and-forget,
 * no-op when the bridge is absent (dev server / preview / tests).
 *
 * Handled by `ViewController`'s `open-url` case, which validates the payload as
 * an `https` URL before handing it to `NSWorkspace` / `UIApplication` — see
 * `apps/safari-host-app/AGENTS.md`.
 */
export function openSourceCode(): void {
  void callNative('open-url', SOURCE_URL);
}

/**
 * Post an "open the public changelog" request — the About footer's version
 * stamp, which links to this build's release notes on movar.fyi (English at
 * `/changelog`, Ukrainian at `/uk/changelog`, anchored at `#v<version>`).
 *
 * Same `open-url` action, and the same reason for it, as {@link openSourceCode}:
 * the CSP makes a Swift hand-off the only working escape. The URL shape is
 * {@link changelogUrl}'s — a `dev` build (no build-time version define) gets the
 * un-anchored changelog rather than a fragment that matches nothing.
 * Fire-and-forget; no-op when the bridge is absent (dev server / preview /
 * tests).
 */
export function openChangelog(locale: HostLocale, version: string): void {
  void callNative('open-url', changelogUrl(locale, version));
}

// ---------------------------------------------------------------------------
// Movar Audit — the probe channel.
// ---------------------------------------------------------------------------

/**
 * How long to wait for one `probe` reply.
 *
 * A probe is not one request: it walks a redirect chain by hand, up to
 * `maxHops` (10) requests at a 15s timeout each, so the native worst case is
 * around 150s. This is deliberately just past that, because a JS-side timeout
 * fires while Swift is still working — the request is not cancelled, only
 * abandoned — and reporting "unreachable" for a site that answered in 20s would
 * be a false observation about a named company.
 */
const PROBE_TIMEOUT_MS = 180_000;

/** One matrix leg the Audit tab asks the native side to fetch. */
export interface ProbeRequest {
  readonly url: string;
  /** The `Accept-Language` to send, or `null` for the no-preference leg. */
  readonly acceptLanguage: string | null;
  /** Groups probes into one audit for the native request budget. */
  readonly runId: string;
  readonly budget?: number;
  /** Defaults to cold. A warm run is an explicit, evidence-stamped choice. */
  readonly cookieState?: 'cold' | 'warm';
}

/**
 * What the native prober observed. The **untrusted** shape of a JSON reply —
 * every field is validated in `audit/collect.ts` before it reaches `Evidence`,
 * so this interface documents the contract rather than guaranteeing it.
 *
 * Mirrors what `packages/audit/src/collect/probe.ts` emits, with two
 * differences that belong to the caller rather than to the network: the probe
 * `id` and the `vantage` are stamped web-side, because the native tier reports
 * only what the network did.
 */
export interface ProbeReply {
  readonly status?: number;
  readonly outcome?: string;
  /** The FIRST response's headers — see `AuditProbe.swift`. */
  readonly responseHeaders?: Record<string, string>;
  readonly redirectChain?: readonly { url: string; status: number; location: string }[];
  readonly finalUrl?: string;
  readonly bodyHash?: string;
  /** Present only for an `ok` outcome; a blocked body is withheld natively. */
  readonly body?: string;
  readonly cookieState?: string;
  /** Set when the native side refused: `budget-exhausted`, `invalid-url`, … */
  readonly refused?: string;
}

/**
 * Fetch one matrix leg through the native prober.
 *
 * This is the ONLY way the host screen reaches the network. The WebView runs
 * under `default-src 'self'` from a `file://` URL, so `fetch` here would be
 * blocked by CSP — which is the design, not an obstacle: it forces every byte
 * of egress through one auditable Swift file that owns the declared
 * `User-Agent`, the cold cookie state, the manual redirect walk and the request
 * budget (see `Shared (App)/AuditProbe.swift`).
 *
 * Resolves `undefined` outside the app (dev server, preview, tests), where the
 * Audit tab reports that it cannot run rather than pretending to have audited.
 */
export async function probe(request: ProbeRequest): Promise<ProbeReply | undefined> {
  return callNative<ProbeReply>(
    'probe',
    {
      url: request.url,
      acceptLanguage: request.acceptLanguage,
      runId: request.runId,
      cookieState: request.cookieState ?? 'cold',
      ...(request.budget === undefined ? {} : { budget: request.budget }),
    },
    PROBE_TIMEOUT_MS,
  );
}

// ---------------------------------------------------------------------------
// Movar Audit — exporting a report.
// ---------------------------------------------------------------------------

/**
 * How long to wait for an export reply.
 *
 * Longer than an ordinary action because the reply does not come back until the
 * PERSON is done: iOS resolves it when the share sheet closes, macOS when the
 * save panel is dismissed. Someone picking a folder, or getting distracted
 * mid-save, is not a dropped reply — so this is generous enough that the button
 * does not un-stick itself while the sheet is still open.
 */
const EXPORT_TIMEOUT_MS = 300_000;

/** What the native side did with an export request. */
export interface ExportReply {
  readonly saved?: boolean;
  /** `invalid-request` | `write-failed` | `cancelled`. */
  readonly reason?: string;
}

/**
 * Hand a finished report to the system to save or share.
 *
 * `html` is the self-contained artifact — the readable report, the embedded
 * evidence and the replay command in one file, per `docs/movar-audit.md` §8.
 * The WebView cannot write a file or raise a share sheet, so this is another
 * capability that lives in Swift; see `ViewController.exportReport`.
 *
 * Resolves `undefined` outside the app, where the caller reports that exporting
 * needs the real app rather than silently doing nothing.
 */
export async function exportReport(
  filename: string,
  html: string,
): Promise<ExportReply | undefined> {
  return callNative<ExportReply>('exportReport', { filename, html }, EXPORT_TIMEOUT_MS);
}
