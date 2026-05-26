import { browser } from 'wxt/browser';
import { defaultSettings, type MovarSettings } from '@movar/shared';

const SETTINGS_KEY = 'settings';

export async function getSettings(): Promise<MovarSettings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return (stored[SETTINGS_KEY] as MovarSettings | undefined) ?? defaultSettings;
}

export async function setSettings(next: MovarSettings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_KEY]: next });
}

/** Ensure settings are initialised on first install. */
export async function ensureSettingsInitialised(): Promise<void> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  if (!stored[SETTINGS_KEY]) await setSettings(defaultSettings);
}
