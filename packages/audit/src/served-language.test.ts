import { describe, expect, it } from 'vitest';
import type { Classifier } from './classifier';
import type { PageEvidence, TextNodeSample, TextSampling } from './evidence';
import type { Determination } from './served-language';
import {
  classifiedPageLanguage,
  declaredPageLanguage,
  mergedDenominator,
  servedLanguage,
} from './served-language';
import type { LanguageCode } from '@movar/lang-detect';
import { makeDocument, makePage } from '../test/fixtures';

/** Two candidates, so distinctiveness has something to be relative to. */
const CANDIDATES: readonly LanguageCode[] = ['uk', 'ru'];

/** The classifier seam, stubbed: no franc, no trigram tables, no surprises. */
function alwaysClassifies(language: LanguageCode): Classifier {
  return () => ({ language, margin: 4, rung: 1, discriminating: true });
}

/** Answers about one snippet and abstains on every other — `null` is "no evidence". */
function classifiesOnly(text: string, language: LanguageCode): Classifier {
  return (snippet) =>
    snippet === text ? { language, margin: 4, rung: 1, discriminating: true } : null;
}

/** What a collector writes when its sampling ceiling, not the page, ended the walk. */
function capped(examined: number, sampled: number): TextSampling {
  return { examined, sampled, cappedAt: sampled };
}

function node(text: string): TextNodeSample {
  return { nodePath: 'main > p', text, inheritedLang: null };
}

const SAMPLES: readonly TextNodeSample[] = [node('Доставка по всей стране'), node('Дрель ударная')];

/**
 * A page carrying no `<html lang>` — the only shape that reaches the
 * classifier at all, since a declaration always wins.
 */
function undeclaredPage(
  textNodes: readonly TextNodeSample[] = SAMPLES,
  textSampling?: TextSampling,
): PageEvidence {
  return makePage({
    document: makeDocument({
      htmlLang: null,
      textNodes,
      ...(textSampling === undefined ? {} : { textSampling }),
    }),
  });
}

describe('classifiedPageLanguage', () => {
  it('answers with the dominant language and says the classifier decided it', () => {
    const determination = classifiedPageLanguage(
      undeclaredPage(),
      alwaysClassifies('ru'),
      CANDIDATES,
    );

    expect(determination?.language).toBe('ru');
    expect(determination?.via).toBe('classified');
  });

  it('refuses a candidate set it cannot discriminate within', () => {
    expect(classifiedPageLanguage(undeclaredPage(), alwaysClassifies('ru'), ['ru'])).toBeNull();
  });

  it('has nothing to classify when the bundle carries no text nodes', () => {
    expect(
      classifiedPageLanguage(undeclaredPage([]), alwaysClassifies('ru'), CANDIDATES),
    ).toBeNull();
  });

  it('answers null rather than guessing when the classifier abstained throughout', () => {
    expect(classifiedPageLanguage(undeclaredPage(), () => null, CANDIDATES)).toBeNull();
  });

  /**
   * `textNodes` is what fitted in the bundle; `textSampling.examined` is what
   * the walker saw. Quoting the sample as the page understates M by the whole
   * truncation and so inflates the share the finding publishes — in the
   * direction of the accusation. This determination is the kernel's, shared by
   * `core/switch-no-effect` and family C, so it is the widest blast radius the
   * mistake has.
   */
  describe('the denominator', () => {
    it('quotes the population the collector examined, not the sample it kept', () => {
      const page = undeclaredPage(SAMPLES, capped(4000, 2));

      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);

      expect(determination?.denominator).toEqual({ examined: 4000, matched: 2 });
    });

    /** "2 of 4000" is the finding; "2 of 2" is the smear that page can't argue with. */
    it('never lets a truncated page read as unanimous', () => {
      const page = undeclaredPage(SAMPLES, capped(4000, 2));

      const { examined = 0, matched = 0 } =
        classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES)?.denominator ?? {};

      expect(matched).toBeLessThan(examined);
    });

    /**
     * A node the classifier abstained on is not an excluded node — it stays in
     * the denominator. Exclusions never narrow M; that is what keeps the share
     * honest rather than flattering to whichever verdict won.
     */
    it('keeps a node the classifier abstained on in the denominator', () => {
      const page = undeclaredPage(SAMPLES, { examined: 2, sampled: 2 });

      const determination = classifiedPageLanguage(
        page,
        classifiesOnly('Дрель ударная', 'ru'),
        CANDIDATES,
      );

      expect(determination?.denominator).toEqual({ examined: 2, matched: 1 });
    });

    /**
     * A stored `schemaVersion` 2 bundle carries no counts at all, so it falls
     * back to the sample length it did quote — an old bundle replays with the
     * denominator it was published with rather than with an empty one.
     */
    it('falls back to the sample length on a bundle collected before the counts existed', () => {
      const page = undeclaredPage();
      expect(page.document.textSampling).toBeUndefined();

      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);

      expect(determination?.denominator).toEqual({ examined: 2, matched: 2 });
    });
  });
});

describe('servedLanguage', () => {
  it('lets the declaration win, and carries no denominator when it does', () => {
    const page = makePage({ document: makeDocument({ htmlLang: 'uk', textNodes: [...SAMPLES] }) });

    const determination = servedLanguage(page, alwaysClassifies('ru'), CANDIDATES);

    expect(determination).toEqual({ language: 'uk', via: 'declared' });
    expect(declaredPageLanguage(page)).toBe('uk');
  });

  it('hands the classifier fallback the population as its denominator', () => {
    const page = undeclaredPage(SAMPLES, capped(4000, 2));

    const determination = servedLanguage(page, alwaysClassifies('ru'), CANDIDATES);

    expect(determination?.via).toBe('classified');
    expect(determination?.denominator).toEqual({ examined: 4000, matched: 2 });
  });
});

describe('mergedDenominator', () => {
  /**
   * The sum is where a per-page understatement stops being per-page: family C
   * cites every leg of a serving comparison in one finding, so two truncated
   * pages quoted at the cap would publish "4 of 3000" for a site with 8000
   * examined nodes.
   */
  it('sums the populations, so a truncation cannot compound across pages', () => {
    const legs: readonly Determination[] = [
      classifiedPageLanguage(
        undeclaredPage(SAMPLES, capped(4000, 2)),
        alwaysClassifies('ru'),
        CANDIDATES,
      ),
      classifiedPageLanguage(
        undeclaredPage(SAMPLES, capped(4000, 2)),
        alwaysClassifies('ru'),
        CANDIDATES,
      ),
    ].flatMap((determination) => (determination === null ? [] : [determination]));

    expect(mergedDenominator(legs)).toEqual({ examined: 8000, matched: 4 });
  });

  it('stays undefined when every determination came from a declaration', () => {
    expect(mergedDenominator([{ language: 'uk', via: 'declared' }])).toBeUndefined();
  });
});
