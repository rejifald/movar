import { browser } from 'wxt/browser';
import { defaultSettings, enforceLockedLanguages, migrateSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

const SETTINGS_KEY = 'settings';

/**
 * Single choke point for turning a raw stored value (any version, possibly
 * malformed — `storage.sync` roams across devices/builds) into a valid,
 * policy-compliant {@link MovarSettings}. Order matters:
 *   1. `migrateSettings` — version ladder + per-element coercion (drops unknown
 *      language codes, dedupes, type-checks scalars), tolerant of future
 *      versions. Also backfills any missing key from `defaultSettings`.
 *   2. `enforceLockedLanguages` — runs LAST so the locked invariant (Russian
 *      blocked, never in priority) always wins, even if coercion reintroduced
 *      or stripped something.
 */
function normalizeSettings(raw: unknown): MovarSettings {
  return enforceLockedLanguages(migrateSettings(raw));
}

export async function getSettings(): Promise<MovarSettings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY];
  const normalized = normalizeSettings(raw);
  // Self-heal: persist the cleaned value back only when normalization actually
  // changed the stored shape, so we don't write on every read (limits sync
  // churn) and don't needlessly race a newer device's value. A migrated
  // (un-versioned) or malformed store thus repairs itself; a clean store is
  // left untouched.
  if (!isStoredValueClean(raw, normalized)) {
    await browser.storage.sync.set({ [SETTINGS_KEY]: normalized });
  }
  return normalized;
}

/** True when the raw stored value already deep-equals the normalized result,
 *  i.e. nothing needs a self-heal write back. */
function isStoredValueClean(raw: unknown, normalized: MovarSettings): boolean {
  return JSON.stringify(raw) === JSON.stringify(normalized);
}

export async function setSettings(next: MovarSettings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_KEY]: enforceLockedLanguages(next) });
}

/** Ensure settings are initialised on first install. */
export async function ensureSettingsInitialised(): Promise<void> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  if (stored[SETTINGS_KEY] == null) await setSettings(defaultSettings);
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChange(handler: (next: MovarSettings) => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'sync' || !(SETTINGS_KEY in changes)) return;
    const change = changes[SETTINGS_KEY];
    if (change.newValue != null) {
      handler(normalizeSettings(change.newValue));
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
