import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import {
  ensureSettingsInitialised,
  getSettings,
  onSettingsChange,
  setSettings,
} from './settings';

const SETTINGS_KEY = 'settings';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSettings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(defaultSettings);
  });

  it('merges a stored partial over the defaults (forward-compatible upgrade)', async () => {
    // An install from before `contentModification` shipped: the key is absent.
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { enabled: false, priority: ['en'] },
    });
    const merged = await getSettings();
    expect(merged.enabled).toBe(false);
    expect(merged.priority).toEqual(['en']);
    // Missing keys fall back to their default.
    expect(merged.contentModification).toBe(defaultSettings.contentModification);
    expect(merged.uiLanguage).toBe(defaultSettings.uiLanguage);
  });

  it('re-asserts the locked-language invariant on a tampered stored value', async () => {
    // Stored copy left Russian out of `blocked` and in `priority`.
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { ...defaultSettings, blocked: [], priority: ['uk', 'ru', 'en'] },
    });
    const settings = await getSettings();
    expect(settings.blocked).toContain('ru');
    expect(settings.priority).not.toContain('ru');
  });
});

describe('setSettings', () => {
  it('persists an enforced copy to sync storage', async () => {
    await setSettings({ ...defaultSettings, blocked: [], priority: ['uk', 'ru'] });
    const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] as MovarSettings;
    expect(stored.blocked).toContain('ru');
    expect(stored.priority).not.toContain('ru');
  });
});

describe('ensureSettingsInitialised', () => {
  it('writes the defaults on first install (empty storage)', async () => {
    await ensureSettingsInitialised();
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual(defaultSettings);
  });

  it('leaves an existing stored value untouched', async () => {
    const existing = { ...defaultSettings, enabled: false };
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: existing });
    await ensureSettingsInitialised();
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual(existing);
  });
});

describe('onSettingsChange', () => {
  it('fires with the enforced new value on a sync change to the settings key', () => {
    const handler = vi.fn();
    onSettingsChange(handler);
    void fakeBrowser.storage.onChanged.trigger(
      { [SETTINGS_KEY]: { newValue: { ...defaultSettings, blocked: [], priority: ['ru', 'uk'] } } },
      'sync',
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const next = handler.mock.calls[0]![0] as MovarSettings;
    expect(next.blocked).toContain('ru');
    expect(next.priority).not.toContain('ru');
  });

  it('ignores changes in other storage areas', () => {
    const handler = vi.fn();
    onSettingsChange(handler);
    void fakeBrowser.storage.onChanged.trigger({ [SETTINGS_KEY]: { newValue: defaultSettings } }, 'local');
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores changes to unrelated keys', () => {
    const handler = vi.fn();
    onSettingsChange(handler);
    void fakeBrowser.storage.onChanged.trigger({ 'movar:events': { newValue: [] } }, 'sync');
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops firing after the returned unsubscribe is called', () => {
    const handler = vi.fn();
    const unsubscribe = onSettingsChange(handler);
    unsubscribe();
    void fakeBrowser.storage.onChanged.trigger({ [SETTINGS_KEY]: { newValue: defaultSettings } }, 'sync');
    expect(handler).not.toHaveBeenCalled();
  });
});
