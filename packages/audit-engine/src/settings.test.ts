import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import { applyIntent, loadSettings } from './settings';

describe('loadSettings', () => {
  it('yields defaults for a store that held nothing', () => {
    expect(loadSettings(null)).toStrictEqual(defaultSettings);
  });

  it('re-asserts the locked block list over a hand-edited blob', () => {
    // The shape a stale sync or an edited App Group value could present.
    const tampered = { ...defaultSettings, blocked: [] };
    expect(loadSettings(tampered).blocked).toContain('ru');
  });
});

describe('applyIntent', () => {
  it('sets the plain scalar fields', () => {
    const next = applyIntent(defaultSettings, { kind: 'enabled.set', value: false });
    expect(next.enabled).toBe(false);
  });

  it('leaves the input untouched', () => {
    applyIntent(defaultSettings, { kind: 'enabled.set', value: false });
    expect(defaultSettings.enabled).toBe(true);
  });

  it('re-derives blocked from priority rather than trusting the caller', () => {
    const next = applyIntent(defaultSettings, { kind: 'priority.set', value: ['uk'] });
    expect(next.priority).toStrictEqual(['uk']);
    expect(next.blocked).toContain('ru');
  });

  it('cannot unblock a locked language through the priority list', () => {
    // The whole reason native emits intents instead of writing settings JSON.
    const next = applyIntent(defaultSettings, { kind: 'priority.set', value: ['ru', 'uk'] });
    expect(next.blocked).toContain('ru');
    expect(next.priority).not.toContain('ru');
  });

  it('normalises an added domain so three native text fields cannot disagree', () => {
    const next = applyIntent(defaultSettings, {
      kind: 'allowlist.add',
      domain: '  HTTPS://Example.COM/path  ',
    });
    expect(next.allowlist).toStrictEqual(['example.com']);
  });

  it('removes a domain regardless of how it was typed', () => {
    const added = applyIntent(defaultSettings, { kind: 'allowlist.add', domain: 'example.com' });
    const removed = applyIntent(added, { kind: 'allowlist.remove', domain: 'EXAMPLE.com' });
    expect(removed.allowlist).toStrictEqual([]);
  });
});
