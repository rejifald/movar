import { describe, expect, it } from 'vitest';
import { classifyBySnippet } from './classify';
import { francRung3Resolver } from './classify-franc';
import { be, bg, en, ru, uk } from './profiles';

/**
 * The candidate set a **default user actually gets**, not the full profile roster.
 *
 * The extension derives candidates as `priority ∪ blocked`
 * (`apps/extension/src/lib/content-modification.ts`), so a default UA profile
 * classifies against `{uk, en, ru}` — `be` and `bg` ship profiles but are never
 * candidates. The always-on be/bg overlay that would have added them was reverted
 * in #103 (it diluted franc's Russian margin below the conceal gate and made Movar
 * miss a real Russian card), and re-adding it stays a non-goal.
 *
 * These tests characterize what that costs, so the docs asserting it stay honest:
 * `docs/store-policy-stance.md` tells store reviewers which fellow Cyrillic
 * languages are safe from concealment, and it must not drift from the code.
 * Calibration is tracked in #401.
 */
const SHIPPED_CANDIDATES = [uk, en, ru];

/** The conceal gate in `content-conceal.ts`: `minHideMargin(1) = minHideMargin('2a') = 1`. */
const RUNG_1_HIDE_MARGIN = 1;

describe('classifyBySnippet — shipped candidate set {uk, en, ru} (default user)', () => {
  describe('Belarusian is held back by the accounting veto (#523)', () => {
    // langtell 0.6.1 withdraws a winner whose own alphabet cannot account for 2%
    // of the text's letters. `і` and `ў` are letters `ru` does not have, so a `ru`
    // verdict over Belarusian prose is vetoed to `unknown` — and `unknown` is
    // never concealed, whatever the margin.
    it.each([
      ['ў-carrying', 'Я ведаю беларускую мову, дзякуй за ўсё, што ў нас ёсць'],
      ['і + ы, no ў', 'Мова і культура Беларусі маюць багатую гісторыю і жывую сучасную традыцыю.'],
      ['э + ы', 'Гэта цікавая кніга і добры фільм пра нашу краіну, пра яе людзей і мову.'],
      ['short headline', 'Беларускія навіны сёння'],
    ])('%s Belarusian abstains rather than reading ru', (_label, text) => {
      const v = classifyBySnippet(text, SHIPPED_CANDIDATES, francRung3Resolver);
      expect(v.language).not.toBe('ru');
      expect(v.language).toBe('unknown');
    });
  });

  describe('Bulgarian is NOT held — it still conceals as ru', () => {
    // Every letter of the `bg` alphabet is in `ru`'s, so the accounting veto can
    // never fire on Bulgarian's behalf and `ъ` is free to carry a rung-1 `ru`
    // verdict. This is the accepted #103 tradeoff, pinned here so it cannot
    // regress silently in either direction — and so the store-policy doc, which
    // states it plainly, has something to drift against.
    it('has no letter ru cannot account for', () => {
      const ruLetters = new Set((ru.alphabet + (ru.marks ?? '')).toLowerCase());
      const unaccounted = [...new Set((bg.alphabet + (bg.marks ?? '')).toLowerCase())].filter(
        (letter) => !ruLetters.has(letter),
      );
      expect(unaccounted).toEqual([]);
      // Belarusian, by contrast, has exactly the letters that make the veto work.
      const beUnaccounted = [...new Set((be.alphabet + (be.marks ?? '')).toLowerCase())].filter(
        (letter) => !ruLetters.has(letter),
      );
      expect(beUnaccounted).toEqual(expect.arrayContaining(['і', 'ў']));
    });

    it.each([
      ['prose', 'Аз съм българин и това е защото обичам родния си език'],
      ['short title', 'Това е български език'],
    ])('%s Bulgarian reads ru above the conceal gate', (_label, text) => {
      const v = classifyBySnippet(text, SHIPPED_CANDIDATES, francRung3Resolver);
      expect(v.language).toBe('ru');
      expect(v.rung).toBe(1);
      expect(v.margin).toBeGreaterThanOrEqual(RUNG_1_HIDE_MARGIN);
    });
  });

  it('still reads genuine Russian as ru — the core mission is unaffected', () => {
    const v = classifyBySnippet(
      'Собака медленно бежала домой по дороге',
      SHIPPED_CANDIDATES,
      francRung3Resolver,
    );
    expect(v.language).toBe('ru');
    expect(v.margin).toBeGreaterThanOrEqual(RUNG_1_HIDE_MARGIN);
  });
});
