import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import { parseImportedSettings, serializeSettings, SETTINGS_FILENAME } from './settings-io';

describe('serializeSettings', () => {
  it('produces indented JSON that round-trips to the same settings', () => {
    const json = serializeSettings(defaultSettings);
    expect(json).toContain('\n'); // pretty-printed
    expect(JSON.parse(json)).toEqual(defaultSettings);
  });
});

describe('parseImportedSettings', () => {
  it('round-trips a valid export', () => {
    expect(parseImportedSettings(serializeSettings(defaultSettings))).toEqual(defaultSettings);
  });

  it('re-asserts the locked-language invariant: ru stays blocked, never in priority', () => {
    const blob = JSON.stringify({ ...defaultSettings, priority: ['ru', 'uk'], blocked: [] });
    const result = parseImportedSettings(blob);
    expect(result.blocked).toContain('ru');
    expect(result.priority).not.toContain('ru');
  });

  it('backfills missing keys from defaults (forward-compatible import)', () => {
    const result = parseImportedSettings(JSON.stringify({ priority: ['en'] }));
    expect(result.priority).toEqual(['en']);
    expect(result.blocked).toContain('ru'); // backfilled + locked
    expect(result.contentModification).toBe(defaultSettings.contentModification);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseImportedSettings('{ not json')).toThrow();
  });

  it('exposes the download filename', () => {
    expect(SETTINGS_FILENAME).toBe('movar-settings.json');
  });
});
