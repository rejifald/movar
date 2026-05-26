import { describe, expect, it } from 'vitest';
import { buildAcceptLanguage } from './accept-language';

describe('buildAcceptLanguage', () => {
  it('gives the first language implicit q=1', () => {
    expect(buildAcceptLanguage(['uk'])).toBe('uk');
  });

  it('steps q down for each subsequent language', () => {
    expect(buildAcceptLanguage(['uk', 'en'])).toBe('uk,en;q=0.9');
    expect(buildAcceptLanguage(['uk', 'en', 'pl'])).toBe('uk,en;q=0.9,pl;q=0.8');
  });

  it('floors q at 0.1 for long lists', () => {
    const value = buildAcceptLanguage(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
    expect(value.endsWith('k;q=0.1')).toBe(true);
  });

  it('returns empty string for an empty list', () => {
    expect(buildAcceptLanguage([])).toBe('');
  });
});
