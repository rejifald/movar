import { browser } from 'wxt/browser';
import { enforceLockedLanguages } from '@movar/settings';
import { migrateSettings } from '@movar/settings/migrate';
import { getSettings, setSettings } from './settings';

/**
 * Safari-only bridge that keeps the host app's settings panel and the
 * extension's `storage.sync` in sync through a shared App Group.
 *
 * The extension can't reach the App Group directly, and the host app can't
 * reach `storage.sync`. So the host app writes a `MovarSettings` blob (+ a
 * monotonic `rev`) into the App Group via native code (ViewController.swift),
 * and the extension talks to the same store over native messaging
 * (SafariWebExtensionHandler.swift): pull on wake, push on change. There is no
 * native→extension push, so adoption is latency-bound to the next worker wake —
 * fine for settings, which aren't real-time.
 *
 * Conflict model: last writer wins by `rev`. `getSettings` reports the App
 * Group's current rev; we adopt only when it's advanced past the rev we last
 * reconciled (stored in `storage.local`). The app and Safari are rarely both
 * foregrounded, so genuine concurrent edits are vanishingly unlikely and
 * resolve deterministically to the higher rev.
 */

// Safari ignores the application identifier and routes sendNativeMessage to the
// containing app's SafariWebExtensionHandler — but the API requires an argument.
const NATIVE_APP = 'fyi.movar.safari';

// Highest App Group rev this extension has already folded into storage.sync.
// Lives in (device-local) storage.local — it tracks this install, not the user.
const NATIVE_REV_KEY = 'movar:nativeRev';

/** Only the Safari build has a native host app / App Group to talk to. */
export function isNativeBridgeAvailable(): boolean {
  return import.meta.env['BROWSER'] === 'safari';
}

interface NativeGetResult {
  rev?: number;
  settings?: unknown;
}

interface NativeSetResult {
  ok?: boolean;
  rev?: number;
}

async function sendNative<T>(message: Record<string, unknown>): Promise<T | null> {
  try {
    return (await browser.runtime.sendNativeMessage(NATIVE_APP, message)) as T;
  } catch {
    // No native host reachable (non-Safari, or the handler is unavailable).
    // The bridge is best-effort; storage.sync remains the working source of truth.
    return null;
  }
}

async function readSeenRev(): Promise<number> {
  const stored = (await browser.storage.local.get(NATIVE_REV_KEY))[NATIVE_REV_KEY];
  return typeof stored === 'number' ? stored : 0;
}

async function writeSeenRev(rev: number): Promise<void> {
  // Monotonic — the seen rev must never regress. Adopting a host-app change
  // writes storage.sync, which fires onSettingsChange → pushSettingsToNative
  // (background.ts); that push-back's native round-trip can record a HIGHER rev
  // before the adopting reconcile records its own. Clamping here keeps the
  // advance and stops the next reconcile from re-adopting in a loop — the guard
  // the pre-#315 write-order gave implicitly by recording the rev before the
  // sync write.
  if (rev <= (await readSeenRev())) return;
  await browser.storage.local.set({ [NATIVE_REV_KEY]: rev });
}

/**
 * Push the extension's current settings into the App Group so the host app's
 * panel reflects them. Records the rev the native side assigned, so the next
 * reconcile doesn't mistake our own write for an app-originated change.
 */
export async function pushSettingsToNative(): Promise<void> {
  const settings = await getSettings();
  const result = await sendNative<NativeSetResult>({ type: 'setSettings', settings });
  if (result && typeof result.rev === 'number') {
    await writeSeenRev(result.rev);
  }
}

/**
 * Fold one host-app blob into `storage.sync`, then record its rev.
 *
 * Order matters: the rev advances ONLY after the sync write resolves. A
 * `storage.sync.set` on Safari can reject (QUOTA_BYTES_PER_ITEM, the sync
 * write-rate limit, or transient iCloud unavailability); recording the rev
 * first would strand `seenRev` ahead of a write that never landed, so every
 * later reconcile would treat the change as already adopted and silently drop
 * it (#315). On rejection we swallow and return with `seenRev` untouched, so
 * the next reconcile re-adopts.
 *
 * The adopted write fires `onSettingsChange` → `pushSettingsToNative`
 * (background.ts), which lands a rev above this one; `writeSeenRev` is monotonic
 * so recording `rev` here can't clobber that push-back into a re-adopt loop.
 */
async function adoptNativeSettings(settings: unknown, rev: number): Promise<void> {
  try {
    await setSettings(enforceLockedLanguages(migrateSettings(settings)));
  } catch {
    // storage.sync unavailable / over quota — leave `seenRev` behind and retry
    // on the next reconcile rather than dropping the host app's change (#315).
    return;
  }
  await writeSeenRev(rev);
}

/**
 * Reconcile the App Group with `storage.sync`:
 *   - app wrote a newer blob (rev advanced)  → adopt it into storage.sync
 *   - App Group is empty (first run)          → seed it from current settings
 *   - otherwise (we're current or ahead)      → nothing to do
 */
export async function reconcileNativeSettings(): Promise<void> {
  const native = await sendNative<NativeGetResult>({ type: 'getSettings' });
  if (!native) return;

  const nativeRev = typeof native.rev === 'number' ? native.rev : 0;
  const seenRev = await readSeenRev();

  if (native.settings != null && nativeRev > seenRev) {
    await adoptNativeSettings(native.settings, nativeRev);
    return;
  }

  if (native.settings == null) {
    await pushSettingsToNative();
  }
}
