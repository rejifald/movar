import { describe, expect, it } from 'vitest';
import type { Classifier } from './classifier';
import type { PageEvidence, TextNodeSample } from './evidence';
import type { Determination } from './served-language';
import {
  classifiedPageLanguage,
  declaredPageLanguage,
  mergedDenominator,
  servedLanguage,
} from './served-language';
import { makeDocument, makePage } from '../test/fixtures';
import type { LanguageCode } from '@movar/lang-detect';

const CANDIDATES: readonly LanguageCode[] = ['uk', 'ru'];

/** The classifier seam, stubbed: the kernel's arithmetic is what is under test. */
function alwaysClassifies(language: LanguageCode): Classifier {
  return () => ({ language, margin: 4, rung: 1, discriminating: true });
}

/**
 * Two passages that clear the shared gates in `text-samples.ts` — over the
 * 40-character floor, not a run of proper nouns, not inside `<code>`. The
 * arithmetic below is what is under test, and it never runs at all on text the
 * catalogue excludes: see `the shared text-sample gates` at the foot of this
 * file for that half.
 */
const SAMPLES: readonly TextNodeSample[] = [
  {
    nodePath: 'main > h1',
    text: 'Дрель ударная с металлическим патроном и регулировкой оборотов',
    inheritedLang: null,
  },
  {
    nodePath: 'main > p',
    text: 'Доставка по всей стране за три рабочих дня, оплата при получении',
    inheritedLang: null,
  },
];

function pageWith(
  textNodes: readonly TextNodeSample[],
  textSampling?: { examined: number; sampled: number; cappedAt?: number },
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
  it('refuses to answer with fewer than two candidates', () => {
    expect(classifiedPageLanguage(pageWith(SAMPLES), alwaysClassifies('ru'), ['ru'])).toBeNull();
  });

  it('is null when no text was sampled at all', () => {
    expect(classifiedPageLanguage(pageWith([]), alwaysClassifies('ru'), CANDIDATES)).toBeNull();
  });

  it('is null when the classifier had no confident answer for any sample', () => {
    expect(classifiedPageLanguage(pageWith(SAMPLES), () => null, CANDIDATES)).toBeNull();
  });

  it('reports the dominant language as a classified determination', () => {
    const determination = classifiedPageLanguage(
      pageWith(SAMPLES),
      alwaysClassifies('ru'),
      CANDIDATES,
    );
    expect(determination?.language).toBe('ru');
    expect(determination?.via).toBe('classified');
  });

  /**
   * The denominator is the population the walker examined, never the sample
   * that reached the bundle. The collector caps text sampling at 1500 nodes
   * (`MAX_TEXT_NODE_SAMPLES`), so on a capped page the two differ by the whole
   * truncation — and every rule downstream publishes that share against a named
   * company. See `text-samples.ts` § `textNodeDenominator`.
   */
  describe('the denominator', () => {
    it('counts the population the collector examined, not the truncated sample', () => {
      const page = pageWith(SAMPLES, { examined: 4000, sampled: 2, cappedAt: 2 });
      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);
      expect(determination?.denominator).toEqual({ examined: 4000, matched: 2 });
    });

    /**
     * `textSampling` arrived in `schemaVersion` 3. A bundle stored before it
     * carries no counts, so the denominator falls back to the sample length it
     * did quote — which is what that bundle meant when it was written. Old
     * evidence must still replay rather than crash or read zero.
     */
    it('falls back to the sample length on a bundle stored before schemaVersion 3', () => {
      const page = pageWith(SAMPLES);
      expect(page.document.textSampling).toBeUndefined();
      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);
      expect(determination?.denominator).toEqual({ examined: 2, matched: 2 });
    });

    /** An uncapped page: population and sample agree, so nothing moves. */
    it('agrees with the sample length when the cap never bit', () => {
      const page = pageWith(SAMPLES, { examined: 2, sampled: 2 });
      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);
      expect(determination?.denominator).toEqual({ examined: 2, matched: 2 });
    });

    /**
     * `matched` stays a count of the sample, because that is the only text the
     * bundle carries. Only the denominator widens — which is what makes the
     * published share a floor rather than an overstatement.
     */
    it('counts matches within the sample even as examined states the population', () => {
      const mixed: readonly TextNodeSample[] = [
        ...SAMPLES,
        {
          nodePath: 'main > footer',
          text: 'Мы доставляем заказы по всей стране в течение трёх рабочих дней',
          inheritedLang: null,
        },
      ];
      const page = pageWith(mixed, { examined: 9000, sampled: 3, cappedAt: 3 });
      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);
      expect(determination?.denominator).toEqual({ examined: 9000, matched: 3 });
    });
  });

  /**
   * This seam used to hand the classifier raw `sample.text`, so families C, D
   * and F asked "what language is this?" of text `text-samples.ts` refuses to
   * classify at all — the whole point of that module being that two copies of
   * the question must not drift into two answers (#435). What it published was
   * not a near-miss: `via: 'classified'` costs a finding its failing power, but
   * the observation still names a site and still rests on nothing, and in
   * `core/switch-no-effect` a determination naming *any* other language is what
   * suppresses a real draft.
   *
   * The gates themselves are pinned in `rules/content-language.test.ts`
   * § `the text-sample exclusions`; these cases pin that this seam is behind
   * them.
   */
  describe('the shared text-sample gates', () => {
    /** The issue's own reproduction: two two-character words and one `<code>` node. */
    it('classifies nothing when every passage is excluded', () => {
      const page = pageWith([
        { nodePath: 'main > p.a', text: 'Ні', inheritedLang: null },
        { nodePath: 'main > p.b', text: 'Це', inheritedLang: null },
        { nodePath: 'main > pre > code', text: SAMPLES[0]?.text ?? '', inheritedLang: null },
      ]);
      expect(classifiedPageLanguage(page, alwaysClassifies('uk'), CANDIDATES)).toBeNull();
      expect(servedLanguage(page, alwaysClassifies('uk'), CANDIDATES)).toBeNull();
    });

    it('drops a passage under the minimum length from the vote and keeps the denominator whole', () => {
      const page = pageWith(
        [...SAMPLES, { nodePath: 'main > p.short', text: 'Ні', inheritedLang: null }],
        { examined: 3, sampled: 3 },
      );
      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);
      expect(determination?.denominator).toEqual({ examined: 3, matched: 2 });
    });

    it('drops a run of proper nouns, which is a brand and not prose', () => {
      const page = pageWith([
        {
          nodePath: 'main > h1',
          text: 'Nova Poshta Rozetka Ukraine Delivery Service Limited',
          inheritedLang: null,
        },
      ]);
      expect(classifiedPageLanguage(page, alwaysClassifies('uk'), CANDIDATES)).toBeNull();
    });

    it('drops a code element even when its text would otherwise classify', () => {
      const page = pageWith([
        { nodePath: 'main > pre > code', text: SAMPLES[0]?.text ?? '', inheritedLang: null },
        { nodePath: 'main > samp', text: SAMPLES[1]?.text ?? '', inheritedLang: null },
      ]);
      expect(classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES)).toBeNull();
    });
  });
});

describe('servedLanguage', () => {
  it('prefers the response’s own declaration over the classifier', () => {
    const page = makePage({ document: makeDocument({ htmlLang: 'uk', textNodes: SAMPLES }) });
    const determination = servedLanguage(page, alwaysClassifies('ru'), CANDIDATES);
    expect(determination).toEqual({ language: 'uk', via: 'declared' });
  });

  /** A declared determination owes no denominator — the markup is the witness. */
  it('carries no denominator when the declaration decided it', () => {
    const page = makePage({
      document: makeDocument({
        htmlLang: 'uk',
        textNodes: SAMPLES,
        textSampling: { examined: 4000, sampled: 2, cappedAt: 2 },
      }),
    });
    expect(servedLanguage(page, alwaysClassifies('ru'), CANDIDATES)?.denominator).toBeUndefined();
  });

  it('falls back to the classifier, population denominator and all, when nothing is declared', () => {
    const page = pageWith(SAMPLES, { examined: 4000, sampled: 2, cappedAt: 2 });
    expect(servedLanguage(page, alwaysClassifies('ru'), CANDIDATES)).toEqual({
      language: 'ru',
      via: 'classified',
      denominator: { examined: 4000, matched: 2 },
    });
  });

  it('is null when there is no page to read', () => {
    expect(servedLanguage(null, alwaysClassifies('ru'), CANDIDATES)).toBeNull();
  });
});

describe('mergedDenominator', () => {
  /**
   * The sum is where a per-page understatement stops being per-page. Family C
   * cites every leg of a serving comparison in one finding, so two pages each
   * held at their cap published *"4 of 4 text nodes"* about a site whose
   * collector examined 8000 passages — the understatement compounding once per
   * leg, in the direction of a finding that names a company.
   */
  it('sums the populations, so a truncation cannot compound across pages', () => {
    const legs: readonly Determination[] = [
      pageWith(SAMPLES, { examined: 4000, sampled: 2, cappedAt: 2 }),
      pageWith(SAMPLES, { examined: 4000, sampled: 2, cappedAt: 2 }),
    ].flatMap((page) => {
      const determination = classifiedPageLanguage(page, alwaysClassifies('ru'), CANDIDATES);
      return determination === null ? [] : [determination];
    });

    expect(mergedDenominator(legs)).toEqual({ examined: 8000, matched: 4 });
  });

  it('stays undefined when every determination came from a declaration', () => {
    expect(mergedDenominator([{ language: 'uk', via: 'declared' }])).toBeUndefined();
  });
});

describe('declaredPageLanguage', () => {
  it('is null for an absent, empty, or whitespace-only lang', () => {
    for (const htmlLang of [null, '', '   ']) {
      expect(declaredPageLanguage(makePage({ document: makeDocument({ htmlLang }) }))).toBeNull();
    }
  });

  it('normalizes the tag it does find', () => {
    const page = makePage({ document: makeDocument({ htmlLang: ' uk-UA ' }) });
    expect(declaredPageLanguage(page)).toBe('uk');
  });
});
