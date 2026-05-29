import { describe, expect, it } from 'vitest';
import { detectCyrillicLanguage, isRussian } from './index';

describe('detectCyrillicLanguage', () => {
  it('detects Ukrainian via distinctive letters', () => {
    expect(detectCyrillicLanguage('Слава Україні, її мова').language).toBe('uk');
  });

  it('detects Russian via distinctive letters', () => {
    expect(detectCyrillicLanguage('Это русский язык, объём').language).toBe('ru');
  });

  it('returns unknown when no distinctive letters are present', () => {
    expect(detectCyrillicLanguage('hello world').language).toBe('unknown');
  });

  it('isRussian convenience helper works', () => {
    expect(isRussian('подъезд')).toBe(true);
    expect(isRussian('під’їзд')).toBe(false);
  });

  it('isRussian returns true for a Russian sentence without ы/ё/ъ/э (fallback path)', () => {
    // Exercises the `cyrillicCount >= 10 && eOborot === 0` fallback in
    // detectCyrillicLanguage. Without this test the fallback could silently
    // be removed and only `detectCyrillicLanguage` tests would catch it —
    // isRussian's contract for everyday Russian prose would slip past.
    expect(isRussian('Здравствуйте, меня зовут Алексей')).toBe(true);
  });
});

describe('detectCyrillicLanguage — Belarusian disambiguation', () => {
  // Belarusian shares 'і' with Ukrainian and 'э/ё' with Russian — a naive
  // 4-letter heuristic flips it one way or the other depending on the text.
  it('classifies text containing ў (uniquely Belarusian) as be', () => {
    expect(detectCyrillicLanguage('Я ведаю беларускую мову, дзякуй за ўсё').language).toBe('be');
  });

  it('does not misclassify "Гэта родная мова" as Russian', () => {
    // No `ў`, but no Russian context either — current code calls this `ru`
    // because of the `э` in `гэта`. Anything but `ru` is acceptable.
    expect(detectCyrillicLanguage('Гэта родная мова').language).not.toBe('ru');
  });

  it('isRussian returns false for Belarusian text', () => {
    expect(isRussian('Я кахаю беларускую мову з усім сэрцам, дзякуй за ўсё')).toBe(false);
  });
});

describe('detectCyrillicLanguage — Bulgarian disambiguation', () => {
  // Bulgarian uses `ъ` as a vowel (in nearly every word) but has no
  // `ы/ё/э`. The current detector reads any `ъ` as a vote for Russian.
  it('classifies Bulgarian text with `ъ` as bg', () => {
    expect(detectCyrillicLanguage('Аз съм българин и обичам родния си език').language).toBe('bg');
  });

  it('does not misclassify "Това е дълъг ден" as Russian', () => {
    expect(detectCyrillicLanguage('Това е дълъг ден').language).not.toBe('ru');
  });

  it('isRussian returns false for Bulgarian text', () => {
    expect(isRussian('Аз съм българин и обичам родния си език')).toBe(false);
  });
});

describe('detectCyrillicLanguage — Russian without classic distinctives', () => {
  // 'Привет, мир' has zero `ыъэё` but is unambiguously Russian. Substantial
  // Cyrillic content with no Ukrainian/Belarusian/Bulgarian markers should
  // lean Russian rather than `unknown`.
  it('classifies "Привет, мир, как дела?" as ru', () => {
    expect(detectCyrillicLanguage('Привет, мир! Как дела сегодня?').language).toBe('ru');
  });

  it('classifies a Russian sentence with only common letters as ru', () => {
    expect(detectCyrillicLanguage('Здравствуйте, меня зовут Алексей').language).toBe('ru');
  });
});

describe('detectCyrillicLanguage — tie-break', () => {
  // When UA and RU evidence are tied, biasing toward UA causes Belarusian
  // and other Cyrillic-language text to silently classify as Ukrainian.
  // A tie should be `unknown` rather than a silent UA call.
  it('returns unknown when ukScore === ruScore (both > 0)', () => {
    // 'і' (UA) + 'ы' (RU) — perfectly tied.
    expect(detectCyrillicLanguage('і ы').language).toBe('unknown');
  });
});
