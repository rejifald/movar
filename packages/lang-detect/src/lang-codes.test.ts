import { describe, expect, it } from 'vitest';
import { normalizeBCP47, normalizeLanguageCode } from './lang-codes';

describe('normalizeLanguageCode (strict)', () => {
  it('looks up canonical ISO codes', () => {
    expect(normalizeLanguageCode('uk')).toBe('uk');
    expect(normalizeLanguageCode('en')).toBe('en');
    expect(normalizeLanguageCode('ru')).toBe('ru');
    expect(normalizeLanguageCode('de')).toBe('de');
  });

  it('maps `ua` → `uk` (URL-common alias for Ukrainian)', () => {
    expect(normalizeLanguageCode('ua')).toBe('uk');
  });

  it('case-insensitive on ASCII and Cyrillic', () => {
    expect(normalizeLanguageCode('UK')).toBe('uk');
    expect(normalizeLanguageCode('Russian')).toBe('ru');
    expect(normalizeLanguageCode('РУССКИЙ')).toBe('ru');
  });

  it('recognizes localized phrase aliases as exact matches', () => {
    expect(normalizeLanguageCode('українською')).toBe('uk');
    expect(normalizeLanguageCode('по-русски')).toBe('ru');
    expect(normalizeLanguageCode('in english')).toBe('en');
    expect(normalizeLanguageCode('auf deutsch')).toBe('de');
  });

  it('recognizes UA-language exonyms — bare adjective (lower + capitalised)', () => {
    // Ukrainian sites name foreign languages with the UA exonym, not just
    // the endonym; a `title="Російська"` or bare-text "Польська" picker
    // item must classify or the whole picker can slip past detection.
    expect(normalizeLanguageCode('російська')).toBe('ru');
    expect(normalizeLanguageCode('Російська')).toBe('ru');
    expect(normalizeLanguageCode('польська')).toBe('pl');
    expect(normalizeLanguageCode('Польська')).toBe('pl');
    expect(normalizeLanguageCode('німецька')).toBe('de');
    expect(normalizeLanguageCode('Німецька')).toBe('de');
    expect(normalizeLanguageCode('французька')).toBe('fr');
    expect(normalizeLanguageCode('Французька')).toBe('fr');
    expect(normalizeLanguageCode('іспанська')).toBe('es');
    expect(normalizeLanguageCode('Іспанська')).toBe('es');
    expect(normalizeLanguageCode('італійська')).toBe('it');
    expect(normalizeLanguageCode('Італійська')).toBe('it');
  });

  it('recognizes UA-language exonyms — "X мова" phrase (lower + capitalised)', () => {
    // CS-Cart/OpenCart templates targeting Ukraine commonly ship
    // `title="Російська мова"` as the only language signal on the
    // switch link — no language class, no localised text.
    expect(normalizeLanguageCode('російська мова')).toBe('ru');
    expect(normalizeLanguageCode('Російська мова')).toBe('ru');
    expect(normalizeLanguageCode('польська мова')).toBe('pl');
    expect(normalizeLanguageCode('Польська мова')).toBe('pl');
    expect(normalizeLanguageCode('німецька мова')).toBe('de');
    expect(normalizeLanguageCode('Німецька мова')).toBe('de');
    expect(normalizeLanguageCode('французька мова')).toBe('fr');
    expect(normalizeLanguageCode('Французька мова')).toBe('fr');
    expect(normalizeLanguageCode('іспанська мова')).toBe('es');
    expect(normalizeLanguageCode('Іспанська мова')).toBe('es');
    expect(normalizeLanguageCode('італійська мова')).toBe('it');
    expect(normalizeLanguageCode('Італійська мова')).toBe('it');
  });

  it('recognizes UA-language exonyms — adverbial "по-X" forms', () => {
    // Bare-text "по-російськи" sits on picker links the same way
    // "по-русски" does, and is just as common on UA-targeted templates.
    expect(normalizeLanguageCode('по-російськи')).toBe('ru');
    expect(normalizeLanguageCode('по російськи')).toBe('ru');
    expect(normalizeLanguageCode('по-польськи')).toBe('pl');
    expect(normalizeLanguageCode('по-німецьки')).toBe('de');
    expect(normalizeLanguageCode('по-французьки')).toBe('fr');
    expect(normalizeLanguageCode('по-іспанськи')).toBe('es');
    expect(normalizeLanguageCode('по-італійськи')).toBe('it');
  });

  it('does NOT split on hyphen — `/ru-return-warranty` must not match (bosch regression)', () => {
    expect(normalizeLanguageCode('ru-return-warranty')).toBeNull();
    expect(normalizeLanguageCode('en-something-else')).toBeNull();
    expect(normalizeLanguageCode('uk-page')).toBeNull();
  });

  it('does NOT split BCP47 region — `en-US` is unknown to strict mode', () => {
    expect(normalizeLanguageCode('en-US')).toBeNull();
    expect(normalizeLanguageCode('zh-CN')).toBeNull();
  });

  it('returns null for empty / unknown input', () => {
    expect(normalizeLanguageCode('')).toBeNull();
    expect(normalizeLanguageCode('   ')).toBeNull();
    expect(normalizeLanguageCode('xx')).toBeNull();
    expect(normalizeLanguageCode('product123')).toBeNull();
    expect(normalizeLanguageCode('Бош Центр')).toBeNull();
  });

  it('tolerates surrounding whitespace from DOM text and attributes', () => {
    // Picker link text and title attributes arrive with the indentation and
    // newlines of the surrounding HTML; the strict lookup must resolve after trim.
    expect(normalizeLanguageCode('  ua  ')).toBe('uk');
    expect(normalizeLanguageCode('\n  Російська мова  \n')).toBe('ru');
    expect(normalizeLanguageCode('\tin english\t')).toBe('en');
  });
});

describe('normalizeBCP47', () => {
  it('strips region suffix: en-US → en, zh_CN → zh', () => {
    expect(normalizeBCP47('en-US')).toBe('en');
    expect(normalizeBCP47('en_US')).toBe('en');
    expect(normalizeBCP47('uk-UA')).toBe('uk');
    expect(normalizeBCP47('ru-RU')).toBe('ru');
  });

  it('treats `ua-ua` as Ukrainian (some sites use `ua` even as primary tag)', () => {
    expect(normalizeBCP47('ua-UA')).toBe('uk');
  });

  it('still works for bare ISO codes', () => {
    expect(normalizeBCP47('uk')).toBe('uk');
    expect(normalizeBCP47('en')).toBe('en');
  });

  it('returns null for unknown tags', () => {
    expect(normalizeBCP47('xx-XX')).toBeNull();
    expect(normalizeBCP47('')).toBeNull();
  });

  it('bosch BCP47 split bug: ru-return-warranty resolves to ru (normalizeBCP47 is intentional, strict mode must reject it)', () => {
    // BCP47 split DOES treat 'ru-return-warranty' as 'ru' — that's expected
    // for documented BCP47 inputs. The whole point of having two normalizers
    // is that callers pick the right one based on input type. URL path
    // segments must use the strict variant, not this one.
    expect(normalizeBCP47('ru-return-warranty')).toBe('ru');
  });

  it('strips script and region subtags down to the leading language subtag', () => {
    // hreflang / <html lang> can carry script + region + variant subtags; only
    // the leading subtag decides the language.
    expect(normalizeBCP47('uk-Latn-UA')).toBe('uk');
    expect(normalizeBCP47('de-AT-1996')).toBe('de');
    expect(normalizeBCP47('fr-CA')).toBe('fr');
  });
});

describe('post-convergence characterization (langtell-backed)', () => {
  // After flipping onto langtell, the ONLY production-output change versus movar's
  // former hand-rolled table is additive: the be/bg aliases now normalize
  // (langtell ships those detection profiles). Everything else — every uk/ru/en/
  // pl/de/fr/es/it alias above, and the unknown-head → null contract below — is
  // preserved. Verified to be the sole delta over the union of both tables.
  it('NEW: Belarusian aliases now normalize (additive gain over the old table)', () => {
    for (const i of ['be', 'bel', 'беларуская', 'беларуская мова', 'belarusian', 'in belarusian']) {
      expect(normalizeLanguageCode(i)).toBe('be');
      expect(normalizeBCP47(i)).toBe('be');
    }
  });

  it('NEW: Bulgarian aliases now normalize (additive gain over the old table)', () => {
    for (const i of ['bg', 'bul', 'български', 'български език', 'bulgarian', 'in bulgarian']) {
      expect(normalizeLanguageCode(i)).toBe('bg');
      expect(normalizeBCP47(i)).toBe('bg');
    }
  });

  it('PRESERVED: an unknown primary subtag is null, not the bare subtag', () => {
    // langtell's permissive default would return 'pt'/'sv'/'zh'; movar opts into
    // unknownHead:"null", so a tag outside the alias set stays unsupported.
    expect(normalizeBCP47('pt-BR')).toBeNull();
    expect(normalizeBCP47('sv')).toBeNull();
    expect(normalizeBCP47('zh-CN')).toBeNull();
    expect(normalizeBCP47('pt')).toBeNull();
    // strict mode never hyphen-splits and still does not resolve these:
    expect(normalizeLanguageCode('pt')).toBeNull();
    expect(normalizeLanguageCode('sv')).toBeNull();
  });
});
