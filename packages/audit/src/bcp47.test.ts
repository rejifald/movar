import { describe, expect, it } from 'vitest';
import { declaredLanguageOf, isWellFormedBCP47, primarySubtag } from './bcp47';

describe('isWellFormedBCP47', () => {
  it.each([
    'uk',
    'ru',
    'en-US',
    'uk-UA',
    'uk-Latn-UA',
    'de-DE-1901',
    'sl-rozaj-biske',
    'zh-yue-HK',
    'en-a-bbb-x-a-ccc',
    'x-private',
    'qaa-Qaaa-QM-x-southern',
  ])('accepts the well-formed tag %s', (tag) => {
    expect(isWellFormedBCP47(tag)).toBe(true);
  });

  it.each([
    ['', 'the empty string'],
    ['e', 'a one-letter primary subtag'],
    ['12', 'digits where a language belongs'],
    ['uk_UA', 'an underscore separator'],
    ['en-', 'a trailing separator'],
    ['-en', 'a leading separator'],
    ['en--US', 'an empty subtag'],
    ['українська', 'a non-ASCII label'],
    ['en us', 'a space'],
    ['toolongsubtag', 'a subtag over eight characters'],
    ['en-us-us-us', 'a trailing subtag that fits no production'],
    ['en-a', 'an extension singleton with no subtag'],
    ['x', 'a bare private-use singleton'],
  ])('rejects %s (%s)', (tag) => {
    expect(isWellFormedBCP47(tag)).toBe(false);
  });

  it('is case-insensitive, as BCP-47 requires', () => {
    expect(isWellFormedBCP47('UK-ua')).toBe(true);
  });

  it('checks grammar, not registration — well-formed is not valid', () => {
    // `english-language` matches the langtag ABNF (5*8ALPHA + variant) even
    // though neither subtag is registered. That is the correct bar for
    // `core/lang-malformed`: the assertion is "this is not a BCP-47 tag".
    expect(isWellFormedBCP47('english-language')).toBe(true);
  });
});

describe('primarySubtag', () => {
  it('lowercases and strips everything after the first hyphen', () => {
    expect(primarySubtag('UK-Latn-UA')).toBe('uk');
  });

  it('returns the empty string for an empty tag', () => {
    expect(primarySubtag('')).toBe('');
  });
});

describe('declaredLanguageOf', () => {
  it('canonicalizes a tag Movar knows', () => {
    expect(declaredLanguageOf('uk-UA')).toBe('uk');
    expect(declaredLanguageOf('ukr')).toBe('uk');
  });

  it('falls back to the primary subtag for a language Movar does not act on', () => {
    // `normalizeBCP47('de-DE')` is null — Movar has no German alias. Refusing
    // to compare would silently pass `<html lang="de-DE">` served at `/uk/`.
    expect(declaredLanguageOf('de-DE')).toBe('de');
  });
});
