import { describe, expect, it } from 'vitest';
import type { HeadLanguageDeclaration } from './evidence';
import {
  headCarrierLabel,
  headDeclarationLanguages,
  headDeclarationsOf,
  isWellFormedOgLocale,
  ogLocaleTag,
} from './head-declaration';
import { makeDocument, makeHead, makePage } from '../test/fixtures';

function declaration(overrides: Partial<HeadLanguageDeclaration> = {}): HeadLanguageDeclaration {
  return { kind: 'og-locale', value: 'uk_UA', source: 'meta', ...overrides };
}

describe('isWellFormedOgLocale', () => {
  it('accepts the language_TERRITORY form', () => {
    expect(isWellFormedOgLocale('uk_UA')).toBe(true);
    expect(isWellFormedOgLocale('en_GB')).toBe(true);
    expect(isWellFormedOgLocale('  uk_UA  ')).toBe(true);
  });

  it('tolerates casing rather than reporting a preference as a defect', () => {
    expect(isWellFormedOgLocale('uk_ua')).toBe(true);
    expect(isWellFormedOgLocale('UK_UA')).toBe(true);
  });

  it('rejects a BCP-47 hyphen pasted into an Open Graph slot', () => {
    expect(isWellFormedOgLocale('uk-UA')).toBe(false);
  });

  it('rejects a bare language, a bare territory and free text', () => {
    expect(isWellFormedOgLocale('uk')).toBe(false);
    expect(isWellFormedOgLocale('_UA')).toBe(false);
    expect(isWellFormedOgLocale('Ukrainian')).toBe(false);
    expect(isWellFormedOgLocale('')).toBe(false);
  });

  it('rejects a locale carrying more than a language and a territory', () => {
    expect(isWellFormedOgLocale('uk_UA_x')).toBe(false);
  });
});

describe('ogLocaleTag', () => {
  it('bridges the underscore form to BCP-47 and changes nothing else', () => {
    expect(ogLocaleTag('uk_UA')).toBe('uk-UA');
    expect(ogLocaleTag('  en_GB ')).toBe('en-GB');
  });

  it('does not launder a broken value into a plausible one', () => {
    // Only the separator is touched. `Ukrainian` stays `Ukrainian`, so the
    // malformed rule still has something to report.
    expect(ogLocaleTag('Ukrainian')).toBe('Ukrainian');
  });
});

describe('headDeclarationLanguages', () => {
  it('collapses an og:locale to its language, dropping the territory', () => {
    expect(headDeclarationLanguages(declaration({ value: 'uk_UA' }))).toEqual(['uk']);
  });

  it('splits a Content-Language list, because it declares all of them', () => {
    // Collapsing `en, uk` to the first entry would manufacture a contradiction
    // against a page that declared no such thing.
    const decl = declaration({ kind: 'content-language', value: 'en, uk', source: 'header' });
    expect(headDeclarationLanguages(decl)).toEqual(['en', 'uk']);
  });

  it('drops blank entries rather than resolving them', () => {
    const decl = declaration({ kind: 'content-language', value: 'uk,,  ,', source: 'header' });
    expect(headDeclarationLanguages(decl)).toEqual(['uk']);
  });

  it('keeps a language Movar does not act on, so a contradiction still shows', () => {
    // `normalizeBCP47('de-DE')` is null — Movar does not act on German — but a
    // page declaring `de-DE` against `<html lang="uk">` still contradicts itself.
    expect(headDeclarationLanguages(declaration({ value: 'de_DE' }))).toEqual(['de']);
  });

  it('returns nothing for an empty value', () => {
    expect(headDeclarationLanguages(declaration({ value: '   ' }))).toEqual([]);
  });
});

describe('headDeclarationsOf', () => {
  const page = makePage({
    document: makeDocument({
      head: makeHead({
        declarations: [
          declaration({ value: 'uk_UA' }),
          declaration({ kind: 'og-locale-alternate', value: 'en_GB' }),
          declaration({ kind: 'og-locale-alternate', value: 'ru_RU' }),
        ],
      }),
    }),
  });

  it('filters by kind, in document order', () => {
    expect(headDeclarationsOf(page, 'og-locale-alternate').map((d) => d.value)).toEqual([
      'en_GB',
      'ru_RU',
    ]);
  });

  it('is empty — never a throw — on a bundle with no head at all', () => {
    const v1 = makePage({ document: makeDocument() });
    expect(headDeclarationsOf(v1, 'og-locale')).toEqual([]);
  });
});

describe('headCarrierLabel', () => {
  it('names each carrier as a report would', () => {
    expect(headCarrierLabel(declaration())).toBe('<meta property="og:locale">');
    expect(headCarrierLabel(declaration({ kind: 'og-locale-alternate' }))).toBe(
      '<meta property="og:locale:alternate">',
    );
    expect(headCarrierLabel(declaration({ kind: 'content-language', source: 'header' }))).toBe(
      'the Content-Language response header',
    );
    expect(headCarrierLabel(declaration({ kind: 'content-language', source: 'meta' }))).toBe(
      '<meta http-equiv="content-language">',
    );
  });
});
