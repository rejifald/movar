import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, defaultSettings, enforceLockedLanguages } from './index';
import { coerceDomainList, coerceLanguageList, coerceSettings, migrateSettings } from './migrate';

describe('coerceLanguageList', () => {
  it('drops non-string elements', () => {
    expect(coerceLanguageList(['uk', 1, null, undefined, {}, ['en'], 'en'])).toEqual(['uk', 'en']);
  });

  it('canonicalizes via the roster (ua → uk) and drops unknown codes', () => {
    expect(coerceLanguageList(['ua', 'xx', 'product123', 'de'])).toEqual(['uk', 'de']);
  });

  it('trims and lowercases', () => {
    expect(coerceLanguageList(['  UK  ', 'EN'])).toEqual(['uk', 'en']);
  });

  it('de-dupes while preserving first-seen order (post-canonicalization)', () => {
    // 'ua' and 'uk' both canonicalize to 'uk' — only the first survives.
    expect(coerceLanguageList(['ua', 'uk', 'en', 'en', 'ru'])).toEqual(['uk', 'en', 'ru']);
  });

  it('returns [] for non-array input', () => {
    expect(coerceLanguageList('uk')).toEqual([]);
    expect(coerceLanguageList(null)).toEqual([]);
    expect(coerceLanguageList({ 0: 'uk' })).toEqual([]);
  });
});

describe('coerceDomainList', () => {
  it('drops non-strings and empty/whitespace-only entries, trims, de-dupes', () => {
    expect(
      coerceDomainList(['example.com', '', '  ', 42, null, '  trimmed.com  ', 'example.com']),
    ).toEqual(['example.com', 'trimmed.com']);
  });

  it('returns [] for non-array input', () => {
    expect(coerceDomainList('example.com')).toEqual([]);
    expect(coerceDomainList(null)).toEqual([]);
  });
});

describe('coerceSettings (scalar/enum coercion)', () => {
  it('falls back to defaults for out-of-range concealMode/uiLanguage', () => {
    const result = coerceSettings({ concealMode: 'sparkle', uiLanguage: 'klingon' });
    expect(result.concealMode).toBe(defaultSettings.concealMode);
    expect(result.uiLanguage).toBe(defaultSettings.uiLanguage);
  });

  it('keeps valid enum members', () => {
    const result = coerceSettings({ concealMode: 'hide', uiLanguage: 'uk' });
    expect(result.concealMode).toBe('hide');
    expect(result.uiLanguage).toBe('uk');
  });

  it('coerces non-boolean enabled/contentModification to their defaults', () => {
    const result = coerceSettings({ enabled: 'yes', contentModification: 1 });
    expect(result.enabled).toBe(defaultSettings.enabled);
    expect(result.contentModification).toBe(defaultSettings.contentModification);
  });

  it('respects explicit boolean values', () => {
    const result = coerceSettings({ enabled: false, contentModification: true });
    expect(result.enabled).toBe(false);
    expect(result.contentModification).toBe(true);
  });

  it('always stamps the current schema version', () => {
    expect(coerceSettings({}).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('backfills every field from defaults for an empty object', () => {
    expect(coerceSettings({})).toEqual({ ...defaultSettings });
  });

  it('treats a non-object as an empty record (no throw)', () => {
    expect(coerceSettings(null)).toEqual({ ...defaultSettings });
    expect(coerceSettings('garbage')).toEqual({ ...defaultSettings });
    expect(coerceSettings(42)).toEqual({ ...defaultSettings });
  });
});

describe('migrateSettings — version ladder', () => {
  it('stamps an unversioned (v0) value to the current version', () => {
    const migrated = migrateSettings({ enabled: false, priority: ['uk'], blocked: ['ru'] });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.enabled).toBe(false);
    expect(migrated.priority).toEqual(['uk']);
  });

  it('leaves a current-version value at the current version', () => {
    const migrated = migrateSettings({ ...defaultSettings });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated).toEqual({ ...defaultSettings });
  });

  it('tolerates a future version: clamps down instead of throwing', () => {
    const future = {
      ...defaultSettings,
      schemaVersion: CURRENT_SCHEMA_VERSION + 5,
      // A hypothetical future field we don't understand is simply ignored.
      someFutureField: 'whatever',
      priority: ['en'],
    };
    expect(() => migrateSettings(future)).not.toThrow();
    const migrated = migrateSettings(future);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Fields we still understand are preserved through the clamp.
    expect(migrated.priority).toEqual(['en']);
    expect(migrated).not.toHaveProperty('someFutureField');
  });

  it('coerces malformed array contents during migration', () => {
    const migrated = migrateSettings({
      priority: ['ua', 'xx', 5, 'en', 'en'],
      blocked: ['ru', 'garbage', null],
      allowlist: ['a.com', '', 'a.com', 7],
    });
    expect(migrated.priority).toEqual(['uk', 'en']);
    expect(migrated.blocked).toEqual(['ru']);
    expect(migrated.allowlist).toEqual(['a.com']);
  });

  it('never throws on completely malformed input', () => {
    expect(() => migrateSettings(null)).not.toThrow();
    expect(() => migrateSettings('nonsense')).not.toThrow();
    expect(() => migrateSettings(42)).not.toThrow();
    expect(migrateSettings(null)).toEqual({ ...defaultSettings });
  });
});

describe('migrateSettings composed with enforceLockedLanguages', () => {
  it('re-asserts the Russian lock even when coercion stripped it from blocked', () => {
    // A malformed value with Russian only in priority and absent from blocked.
    const result = enforceLockedLanguages(
      migrateSettings({ priority: ['uk', 'ru', 'en'], blocked: [] }),
    );
    expect(result.blocked).toContain('ru');
    expect(result.priority).not.toContain('ru');
  });

  it('holds the lock after a future-version clamp too', () => {
    const result = enforceLockedLanguages(
      migrateSettings({
        schemaVersion: CURRENT_SCHEMA_VERSION + 1,
        priority: ['ru', 'uk'],
        blocked: [],
      }),
    );
    expect(result.blocked).toContain('ru');
    expect(result.priority).not.toContain('ru');
  });
});
