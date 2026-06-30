/**
 * Native bridge between the React onboarding screen and the Swift host
 * (`Shared (App)/ViewController.swift`).
 *
 * Two directions, both preserved verbatim from the old static `Script.js` so
 * the Swift side needs no behavioural change:
 *
 *  1. **Swift → web.** After the WKWebView finishes loading, Swift calls
 *     `evaluateJavaScript("show('ios')")` / `show('mac', enabled, useSettings)`.
 *     We expose a global `show()` that records the latest state and notifies a
 *     subscriber the React root registers. macOS re-calls `show()` every time
 *     the app regains focus (the `didBecomeActive` observer), so the screen
 *     must treat `show()` as a live state feed, not a one-shot.
 *
 *  2. **web → Swift.** The macOS "Open Safari Settings" button posts
 *     `'open-preferences'` to `webkit.messageHandlers.controller`, exactly as
 *     before. Swift opens Safari's Extensions pane; it deliberately does NOT
 *     quit, and the focus-regain observer refreshes us to the "on" state.
 *     The "Send feedback" button posts `'feedback'` the same way, and Swift
 *     opens the support `mailto:` (`FEEDBACK_URL`) via `NSWorkspace` / `UIApp`.
 *     Going through the bridge — rather than a plain `mailto:` anchor — is the
 *     robust path under the WKWebView's `default-src 'self'` CSP, mirroring the
 *     existing preferences hand-off. (The native handler is required; see this
 *     package's AGENTS.md Xcode checklist.)
 *
 * TIMING — why `show()` is installed at MODULE EVAL, not in a React effect.
 * The old `Script.js` (`defer`) defined `show` synchronously, so it existed
 * before Swift's `didFinish` fired `show('mac')`. React's effects run *after*
 * the first commit, which can land after `didFinish`. So this module installs
 * `window.show` the instant it's imported (before React mounts) and buffers the
 * most recent state; `subscribe()` replays it immediately on registration.
 * Without this, the very first state push from the host could be dropped and
 * the screen would sit blank on launch.
 *
 * Keeping every `webkit`/global touch behind this module means the rest of the
 * React tree is plain, testable code with no `any`-typed global poking.
 */

/** Platform the host reports. */
export type Platform = 'ios' | 'mac';

/** A single onboarding-state snapshot pushed from Swift via `show()`. */
export interface OnboardingState {
  platform: Platform;
  /** Extension enabled? `undefined` on iOS (the host can't query it there). */
  enabled: boolean | undefined;
  /** macOS 13+ renamed the pane "Settings" (was "Preferences" on 12 and
   *  earlier). Swift passes the flag; we pick the matching label. `undefined`
   *  on iOS / before the host reports. */
  useSettings: boolean | undefined;
}

type StateListener = (state: OnboardingState) => void;

/** Minimal shape of the `webkit.messageHandlers` bridge WKWebView injects.
 *  Declared locally (not via lib.dom) so the touch point is explicit and the
 *  fallback path is type-checked. */
interface WebKitBridge {
  messageHandlers?: {
    controller?: { postMessage: (message: string) => void };
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
}

/** Latest snapshot the host pushed, or `null` before the first `show()`. */
let latest: OnboardingState | null = null;
/** The single active subscriber (the React root), or `null`. */
let listener: StateListener | null = null;

/** Record a state push and forward it to the subscriber if one is attached.
 *  Mirrors the old `Script.js`: `enabled === true` is the only "on" signal —
 *  `false`/`undefined` both mean "show setup". */
function pushState(platform: Platform, enabled?: boolean, useSettings?: boolean): void {
  latest = { platform, enabled, useSettings };
  listener?.(latest);
}

// Install the global the instant this module is imported — before React mounts
// — so a `show()` Swift fires at `didFinish` is captured, not lost to the
// effect-timing gap described above. Guarded for non-browser test contexts.
if (typeof globalThis !== 'undefined') {
  globalThis.show = pushState;
}

/**
 * Subscribe to host state pushes. Immediately replays the most recent snapshot
 * (if any arrived before this call), then forwards every later `show()`.
 * Returns an unsubscribe; in the app the WebView outlives the subscription, so
 * teardown only matters for hot-reload / tests.
 */
export function subscribe(next: StateListener): () => void {
  listener = next;
  if (latest !== null) next(latest);
  return () => {
    if (listener === next) listener = null;
  };
}

/** Test-only: reset the module-level buffer + subscriber between cases. */
export function resetBridgeForTest(): void {
  latest = null;
  listener = null;
}

/**
 * Post an action string to the native `controller` handler. No-op if the
 * bridge is absent — e.g. the static browser preview / dev server — so a
 * misconfigured host (or a non-WKWebView context) degrades quietly instead of
 * throwing on click. In the shipped app the handler is always present.
 */
function postToHost(action: string): void {
  globalThis.webkit?.messageHandlers?.controller?.postMessage(action);
}

/**
 * Post the macOS "open Safari settings" request to the native side. (Only
 * macOS even renders the button.) Swift opens Safari's Extensions pane.
 */
export function openSafariPreferences(): void {
  postToHost('open-preferences');
}

/**
 * Post the "send feedback" request to the native side. Swift opens the support
 * `mailto:` (`@movar/brand`'s `FEEDBACK_URL`). Routing through the bridge —
 * rather than a `mailto:` anchor the React layer owns — is the robust path
 * under the WKWebView's `default-src 'self'` CSP, and keeps every external
 * hand-off going through the one Swift entry point the preferences button
 * already uses. REQUIRES a native `'feedback'` handler (see AGENTS.md).
 */
export function openFeedback(): void {
  postToHost('feedback');
}
