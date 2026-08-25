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
    // No `ў`, but no Russian context either — current code returns `unknown`
    // because the text is short and `э` alone is not enough to call RU.
    expect(detectCyrillicLanguage('Гэта родная мова').language).toBe('unknown');
  });

  it('isRussian returns false for Belarusian text', () => {
    expect(isRussian('Я кахаю беларускую мову з усім сэрцам, дзякуй за ўсё')).toBe(false);
  });

  it('does not call Belarusian without ў Ukrainian, however many і it has', () => {
    // The reported miss. `і` is Belarusian's letter too, so counting alone
    // elects Ukrainian; `ы`/`э`, which Ukrainian has no letters for, are what
    // says the answer cannot be Ukrainian. langtell withdraws a call its own
    // alphabet cannot account for (>=2% of the Cyrillic letters).
    expect(detectCyrillicLanguage('Мова і культура Беларусі маюць багатую гісторыю').language).toBe(
      'unknown',
    );
    expect(
      detectCyrillicLanguage('Гэта цікавая кніга і добры фільм пра нашу краіну').language,
    ).toBe('unknown');
  });

  it('keeps the uk tally behind a withdrawn call', () => {
    // The verdict is gone, the account of it is not — a caller escalating to the
    // snippet classifier is better served by what the letters said.
    const verdict = detectCyrillicLanguage('Мова і культура Беларусі маюць багатую гісторыю');
    expect(verdict.language).toBe('unknown');
    expect(verdict.ukScore).toBeGreaterThan(0);
  });

  it('does not hold a quotation against the author who quoted it', () => {
    // Movar reads whole articles, and a Ukrainian one quoting Russian at length
    // is still Ukrainian. The quotation is scrubbed before the contradiction is
    // measured — without that, this note (39% quotation) would come back
    // unknown and the page would stop being detectable.
    const text =
      'Бабуся любила повторювати цю фразу щоразу, коли ми збиралися разом за столом ' +
      'у неділю, і кожен онук її пам ятає до сьогодні, бо вона казала це з усмішкою. ' +
      '«Когда я была маленькой, мы жили совсем по-другому, в полном достатке, и всё было проще»';
    expect(detectCyrillicLanguage(text).language).toBe('uk');
  });

  it('judges a text that IS a quotation as itself', () => {
    // A pull-quote or a headline in guillemets is the content, not someone
    // else's aside — so the scrubbing must not disarm the veto there.
    expect(
      detectCyrillicLanguage('«Гэта цікавая кніга і добры фільм пра нашу краіну»').language,
    ).toBe('unknown');
  });

  it('an incidental foreign word is not a contradiction', () => {
    // A Ukrainian article quoting Russian stays Ukrainian: ~0.6% of its letters
    // are ones Ukrainian lacks, well under the line. Movar reads whole articles,
    // and a page that quotes its neighbour must not stop being detectable.
    const text =
      'Сьогодні в Києві відкрилася нова виставка українського мистецтва. Російський ' +
      'критик написав: «Это прекрасно». Експозиція триватиме до кінця літа, кажуть організатори.';
    expect(detectCyrillicLanguage(text).language).toBe('uk');
  });
});

describe('detectCyrillicLanguage — MIN_LEN_FOR_BG boundary', () => {
  // MIN_LEN_FOR_BG = 10: ъ-density is only read as Bulgarian when text.length >= 10.
  // Below the threshold a lone ъ is treated as a Russian compound marker.
  it('length 9 with multiple ъ returns ru (below threshold)', () => {
    // "аъбъвъгъд" — 9 chars, 4 ъ — too short to call BG
    expect(detectCyrillicLanguage('аъбъвъгъд').language).toBe('ru');
  });

  it('length 10 with multiple ъ returns bg (at threshold)', () => {
    // "аъбъвъгъде" — 10 chars, 4 ъ — exactly at MIN_LEN_FOR_BG
    expect(detectCyrillicLanguage('аъбъвъгъде').language).toBe('bg');
  });

  it('length 11 with multiple ъ returns bg (above threshold)', () => {
    // "аъбъвъгъдеж" — 11 chars, 4 ъ
    expect(detectCyrillicLanguage('аъбъвъгъдеж').language).toBe('bg');
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

  it('returns unknown even with cyrillicCount > MIN_CYRILLIC_FOR_FALLBACK when scores are equal', () => {
    // 'і і і і і ы ы ы ы ы' — 5 UA, 5 RU, cyrillicCount == 10 (>= MIN_CYRILLIC_FOR_FALLBACK).
    // The tied-score early-exit must fire before the fallback RU path is reached.
    expect(detectCyrillicLanguage('і і і і і ы ы ы ы ы').language).toBe('unknown');
  });
});
