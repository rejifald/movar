import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { CURRENT_SCHEMA_VERSION, defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { ensureSettingsInitialised, getSettings, onSettingsChange, setSettings } from './settings';

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

  it('migrates an unversioned (pre-schemaVersion) stored value to the current version', async () => {
    // A value written before schemaVersion existed: no version key.
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { enabled: false, priority: ['uk', 'en'], blocked: ['ru'], allowlist: [] },
    });
    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(settings.enabled).toBe(false);
  });

  it('tolerates a future-version stored value without throwing (clamps down)', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: {
        ...defaultSettings,
        schemaVersion: CURRENT_SCHEMA_VERSION + 3,
        priority: ['en'],
      },
    });
    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(settings.priority).toEqual(['en']);
    expect(settings.blocked).toContain('ru');
  });

  it('coerces malformed/typed-wrong array elements on read', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: {
        ...defaultSettings,
        priority: ['ua', 'xx', 5, 'en', 'en'],
        blocked: ['ru', 'garbage', null],
        allowlist: ['a.com', '', 'a.com', 7],
      },
    });
    const settings = await getSettings();
    expect(settings.priority).toEqual(['uk', 'en']);
    expect(settings.blocked).toEqual(['ru']);
    expect(settings.allowlist).toEqual(['a.com']);
  });

  it('canonicalises exempt domains on read (www/scheme/path folded, invalid dropped, deduped)', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: {
        ...defaultSettings,
        allowlist: ['HTTPS://www.Example.com/path', 'example.com', 'localhost', 'news.example.com'],
      },
    });
    const settings = await getSettings();
    // www/scheme/path/case reduce to the bare domain; the duplicate collapses;
    // the bare-label `localhost` (no dot) is dropped; a real subdomain is kept.
    expect(settings.allowlist).toEqual(['example.com', 'news.example.com']);
  });

  it('enforces the ru lock after migration even when coercion stripped it', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { priority: ['uk', 'ru', 'en'], blocked: ['garbage'] },
    });
    const settings = await getSettings();
    expect(settings.blocked).toContain('ru');
    expect(settings.priority).not.toContain('ru');
    expect(settings.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('migrates + coerces on read without mutating storage (read is side-effect-free)', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { priority: ['ua', 'xx'], blocked: [] },
    });
    const setSpy = vi.spyOn(fakeBrowser.storage.sync, 'set');
    const returned = await getSettings();
    // The read normalizes the value (ua→uk, drop unknown xx, re-lock ru)…
    expect(returned.priority).toEqual(['uk']);
    expect(returned.blocked).toContain('ru');
    // …but never writes back: a read must not fire storage.onChanged or churn sync.
    expect(setSpy).not.toHaveBeenCalled();
    const persisted = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
      SETTINGS_KEY
    ] as Partial<MovarSettings>;
    // Storage is left as stored; persistence happens on the next setSettings.
    expect(persisted.priority).toEqual(['ua', 'xx']);
  });
});

describe('setSettings', () => {
  it('persists an enforced copy to sync storage', async () => {
    await setSettings({ ...defaultSettings, blocked: [], priority: ['uk', 'ru'] });
    const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
      SETTINGS_KEY
    ] as MovarSettings;
    expect(stored.blocked).toContain('ru');
    expect(stored.priority).not.toContain('ru');
  });

  it('canonicalises exempt domains before storage', async () => {
    await setSettings({
      ...defaultSettings,
      allowlist: ['WWW.Example.com', 'http://example.com/x', 'bad_domain'],
    });
    const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
      SETTINGS_KEY
    ] as MovarSettings;
    // Both forms fold to `example.com` (one entry); the invalid `bad_domain` is
    // dropped — so the runtime matcher and DNR only ever see canonical domains.
    expect(stored.allowlist).toEqual(['example.com']);
  });
});

describe('ensureSettingsInitialised', () => {
  it('writes the defaults on first install (empty storage)', async () => {
    await ensureSettingsInitialised();
    expect((await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY]).toEqual(
      defaultSettings,
    );
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
    void fakeBrowser.storage.onChanged.trigger(
      { [SETTINGS_KEY]: { newValue: defaultSettings } },
      'local',
    );
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
    void fakeBrowser.storage.onChanged.trigger(
      { [SETTINGS_KEY]: { newValue: defaultSettings } },
      'sync',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
