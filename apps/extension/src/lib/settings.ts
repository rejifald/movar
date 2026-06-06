import { browser } from 'wxt/browser';
import { defaultSettings, enforceLockedLanguages } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

const SETTINGS_KEY = 'settings';

export async function getSettings(): Promise<MovarSettings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  // Merge with defaults so keys added in newer versions (e.g. contentModification)
  // resolve to their default for installs upgraded from older schemas.
  const merged = {
    ...defaultSettings,
    ...(stored[SETTINGS_KEY] as Partial<MovarSettings> | undefined),
  };
  // Re-assert locked-language invariants in case an older client (or a
  // hand-edited storage value) left the stored copy out of policy.
  return enforceLockedLanguages(merged);
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
    if (change.newValue != null) handler(enforceLockedLanguages(change.newValue as MovarSettings));
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
