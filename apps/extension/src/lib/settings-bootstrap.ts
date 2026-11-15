import { ensureSettingsInitialised } from './settings';
import {
  isNativeBridgeAvailable,
  pushSettingsToNative,
  reconcileNativeSettings,
} from './native-settings';

/**
 * The background worker's settings lifecycle — first-run init and the Safari
 * App Group bridge — run one task at a time, in the order they were asked for.
 *
 * Why serialise: on Safari's first launch the worker's wake reconcile and
 * `runtime.onInstalled` start together. Run concurrently, first-run init could
 * read an empty `storage.sync`, let the wake reconcile adopt the host app's blob
 * (recording its rev as seen), then write the defaults over it. The adopted rev
 * is already "seen", so the change is never re-adopted, and the defaults write
 * fires `onSettingsChange` → push, so the host app loses the setting too.
 * `storage` has no compare-and-set, so the only atomicity available is not
 * interleaving the read-then-write with another settings writer in this worker.
 *
 * Why reconcile BEFORE init: when the host app already holds a blob (the user
 * set things up there before opening Safari), the blob is the user's choice and
 * the defaults are not. Adopting first leaves `storage.sync` non-empty, so init
 * is a no-op and no defaults write ever exists to be pushed over the App Group.
 * With an empty App Group the reconcile seeds it from the (default) settings.
 */
let tail: Promise<unknown> = Promise.resolve();

async function serialised(task: () => Promise<void>): Promise<void> {
  const run = tail.then(async () => {
    await task();
  });
  // A failed task must not wedge every later one behind a rejected tail; the
  // caller still sees the rejection through `run` (same shape as the
  // correction-log writer in events.ts).
  tail = run.catch(() => null);
  await run;
}

/** First-run init: fold in the host app's settings (Safari), then fill any gap
 *  with the defaults — never the defaults over a host-app choice. */
export async function initialiseSettings(): Promise<void> {
  await serialised(async () => {
    if (isNativeBridgeAvailable()) await reconcileNativeSettings();
    await ensureSettingsInitialised();
  });
}

/** Pull a newer host-app blob in, or seed an empty App Group (Safari only). */
export async function syncFromNative(): Promise<void> {
  if (!isNativeBridgeAvailable()) return;
  await serialised(reconcileNativeSettings);
}

/** Mirror `storage.sync` out to the App Group after a change (Safari only). */
export async function syncToNative(): Promise<void> {
  if (!isNativeBridgeAvailable()) return;
  await serialised(pushSettingsToNative);
}
