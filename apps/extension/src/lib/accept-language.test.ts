import { describe, expect, it } from 'vitest';
import { buildAcceptLanguage, enrichWithRegions } from './accept-language';

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

  it('preserves BCP47 region tags when present (uk-UA, en-GB)', () => {
    // Pinned to prevent regression; buildAcceptLanguage treats inputs as
    // opaque strings, so this works today.
    expect(buildAcceptLanguage(['uk-UA', 'en-GB'])).toBe('uk-UA,en-GB;q=0.9');
  });
});

describe('enrichWithRegions', () => {
  // New helper: adds a sensible region tag to each bare ISO code while
  // keeping the bare code as fallback (e.g. uk → uk-UA, uk). Some servers
  // do strict region matching and ignore bare codes; this lets us send the
  // richer hint without breaking sites that only accept bare codes.
  it('adds a default region for bare uk and en', () => {
    expect(enrichWithRegions(['uk', 'en'])).toEqual(['uk-UA', 'uk', 'en-US', 'en']);
  });

  it('passes through codes that already have a region', () => {
    expect(enrichWithRegions(['en-GB', 'fr'])).toEqual(['en-GB', 'fr-FR', 'fr']);
  });

  it('returns codes without a default region untouched', () => {
    // We only have defaults for the languages we ship rules for; anything
    // else should pass through as-is rather than guess at a region.
    expect(enrichWithRegions(['xx'])).toEqual(['xx']);
  });
});
