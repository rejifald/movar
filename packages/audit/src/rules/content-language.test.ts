import { describe, expect, it } from 'vitest';
import type { ClassifiedText } from '../classifier';
import { evaluate } from '../evaluate';
import type {
  Evidence,
  HeadTextField,
  HeadTextSample,
  PageEvidence,
  TextNodeSample,
} from '../evidence';
import type { Finding } from '../finding';
import type { RuleResult } from '../report';
import { createRuleset } from '../ruleset';
import {
  classifiableSnippet,
  classifyHeadTexts,
  isInsideCodeElement,
  isProperNounRun,
  MIN_CLASSIFIABLE_CHARS,
} from '../text-samples';
import { contentLanguageFamily, MIN_CLASSIFIED_SAMPLES } from './content-language';
import { makeDocument, makeHead, makePage, networkEvidence } from '../../test/fixtures';

const RULESET = createRuleset({
  id: 'test/content-language',
  version: '0.0.0-test',
  families: [contentLanguageFamily],
});

const MIXED = 'core/content-language-mixed';
const CONTRADICTS = 'core/content-contradicts-declaration';
const CHROME = 'core/content-chrome-untranslated';
const TITLE = 'core/title-contradicts-declaration';
const HEAD_METADATA = 'core/head-metadata-contradicts-declaration';

/**
 * Real prose, not lorem: these rules are only meaningful against text the
 * shipped classifier actually has an opinion about.
 */
const UK_PARAGRAPH =
  'Ми доставляємо замовлення по всій Україні протягом двох робочих днів, а оплата можлива карткою або готівкою при отриманні.';
const RU_PARAGRAPH =
  'Мы доставляем заказы по всей стране в течение двух рабочих дней, оплата возможна картой или наличными при получении.';
const RU_NAV_ITEMS = ['Главная', 'О нас', 'Доставка и оплата', 'Контакты', 'Корзина'];
const UK_NAV_ITEMS = ['Головна', 'Про нас', 'Доставка та оплата', 'Контакти', 'Кошик'];

interface NodeOptions {
  readonly inheritedLang?: string | null;
  readonly region?: string;
}

function textNode(nodePath: string, text: string, options: NodeOptions = {}): TextNodeSample {
  return {
    nodePath,
    text,
    inheritedLang: options.inheritedLang ?? null,
    ...(options.region === undefined ? {} : { region: options.region }),
  };
}

/** `count` paragraphs of the same prose, each at its own node path. */
function paragraphs(text: string, count: number, region?: string): TextNodeSample[] {
  return Array.from({ length: count }, (_unused, index) =>
    textNode(`main > p:nth-child(${index + 1})`, text, region === undefined ? {} : { region }),
  );
}

function navItems(items: readonly string[]): TextNodeSample[] {
  return items.map((item, index) =>
    textNode(`nav > ul > li:nth-child(${index + 1}) > a`, item, { region: 'nav' }),
  );
}

function pageWith(
  textNodes: readonly TextNodeSample[],
  htmlLang: string | null = 'uk',
): PageEvidence {
  return makePage({ document: makeDocument({ htmlLang, textNodes }) });
}

function resultFor(ruleId: string, evidence: Evidence): RuleResult {
  const result = evaluate(evidence, RULESET).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

function onPage(ruleId: string, page: PageEvidence): RuleResult {
  return resultFor(ruleId, networkEvidence([page]));
}

/** A page whose body contradicts its declaration; fires the two page-wide rules. */
const MIXED_PAGE = pageWith([
  ...paragraphs(RU_PARAGRAPH, MIN_CLASSIFIED_SAMPLES + 1),
  textNode('main > footer > p', UK_PARAGRAPH),
]);

/** A page whose chrome is Russian and whose body is Ukrainian. */
const CHROME_PAGE = pageWith([
  ...navItems(RU_NAV_ITEMS),
  textNode('main > article > p', UK_PARAGRAPH, { region: 'main' }),
]);

describe('the family', () => {
  it('ships the five content-language rules', () => {
    expect(contentLanguageFamily.rules.map((rule) => rule.id)).toEqual([
      MIXED,
      CONTRADICTS,
      CHROME,
      TITLE,
      HEAD_METADATA,
    ]);
    expect(contentLanguageFamily.id).toBe('E. Content language');
  });

  it('is entirely classifier-grounded, so no rule may fail a build', () => {
    for (const rule of contentLanguageFamily.rules) {
      expect(rule.grounding).toBe('classified');
      expect(rule.capabilities).toEqual(['static']);
      // A `classified` rule is never hybrid: there is no declaration to fall
      // back to, so `via` would have nothing to record.
      expect(rule.hybrid).toBeUndefined();
    }
  });

  it('cannot produce a fail, whatever the page says', () => {
    for (const page of [MIXED_PAGE, CHROME_PAGE]) {
      const report = evaluate(networkEvidence([page]), RULESET);
      expect(report.brokenPromises).toBe(0);
      for (const finding of report.findings) {
        expect(finding.verdict).not.toBe('fail');
        expect(finding.verdict).toBe('observation');
      }
      for (const result of report.results) {
        expect(result.verdict).not.toBe('fail');
        expect(result.verdict).not.toBe('warn');
      }
    }
  });

  it('states a denominator on every finding, for every rule', () => {
    const found: Finding[] = [MIXED_PAGE, CHROME_PAGE].flatMap((page) => [
      ...evaluate(networkEvidence([page]), RULESET).findings,
    ]);
    expect(new Set(found.map((finding) => finding.rule))).toEqual(
      new Set([MIXED, CONTRADICTS, CHROME]),
    );
    for (const finding of found) {
      const denominator = finding.denominator;
      expect(denominator).toBeDefined();
      expect(denominator?.matched).toBeGreaterThan(0);
      expect(denominator?.examined).toBeGreaterThanOrEqual(denominator?.matched ?? 0);
    }
  });
});

describe('core/content-language-mixed', () => {
  it('observes text nodes that classify against the declaration', () => {
    const result = onPage(MIXED, pageWith([textNode('main > p', RU_PARAGRAPH)]));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('observation');
    expect(result.findings[0]?.grounding).toBe('classified');
    expect(result.findings[0]?.summary).toMatch(/1 of 1 text nodes classified ru/);
    expect(result.findings[0]?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  /**
   * The collector caps text sampling, so on a big page `textNodes` is a floor.
   * Quoting the floor understates the denominator and thereby **inflates** the
   * share the observation publishes — 2 of 40 is a footnote, 2 of 2 is an
   * accusation. The summary must quote the same number the denominator does.
   */
  it('measures a truncated sample against what was examined, not what survived', () => {
    const page = makePage({
      document: makeDocument({
        htmlLang: 'uk',
        textNodes: paragraphs(RU_PARAGRAPH, 2),
        textSampling: { examined: 40, sampled: 2, cappedAt: 2 },
      }),
    });

    const result = onPage(MIXED, page);
    expect(result.findings[0]?.denominator).toEqual({ examined: 40, matched: 2 });
    expect(result.findings[0]?.summary).toMatch(/2 of 40 text nodes classified ru/);
  });

  it('counts each foreign language separately, against every sampled node', () => {
    const result = onPage(
      MIXED,
      pageWith([...paragraphs(RU_PARAGRAPH, 2), textNode('main > aside', UK_PARAGRAPH)]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.denominator).toEqual({ examined: 3, matched: 2 });
  });

  it('passes when every classified node agrees with the declaration', () => {
    expect(onPage(MIXED, pageWith(paragraphs(UK_PARAGRAPH, 2))).verdict).toBe('pass');
  });

  it('never lets a foreign node fail the build', () => {
    expect(onPage(MIXED, pageWith([textNode('main > p', RU_PARAGRAPH)])).verdict).toBe('pass');
  });

  it('defers to core/lang-missing when the page declares nothing', () => {
    const result = onPage(MIXED, pageWith([textNode('main > p', RU_PARAGRAPH)], null));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/core\/lang-missing/);
  });

  it('is not applicable when Movar ships no profile for the declared language', () => {
    const result = onPage(MIXED, pageWith([textNode('main > p', RU_PARAGRAPH)], 'de-DE'));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no detection profile/);
  });

  it('excludes text inside <code>', () => {
    const page = pageWith([textNode('main > pre > code', RU_PARAGRAPH)]);
    const result = onPage(MIXED, page);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/long enough/);
  });

  it('excludes strings under the minimum length', () => {
    const short = RU_PARAGRAPH.slice(0, MIN_CLASSIFIABLE_CHARS - 1);
    expect(onPage(MIXED, pageWith([textNode('main > p', short)])).verdict).toBe('not-applicable');
  });
});

describe('core/content-contradicts-declaration', () => {
  it('observes a dominant classified language that differs from <html lang>', () => {
    const result = onPage(CONTRADICTS, MIXED_PAGE);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('observation');
    expect(result.findings[0]?.summary).toMatch(/largest classified share/);
    // It points at the declaration-grounded rules rather than replacing them.
    expect(result.findings[0]?.summary).toMatch(/core\/lang-contradicts-url/);
    expect(result.findings[0]?.denominator).toEqual({
      examined: MIN_CLASSIFIED_SAMPLES + 2,
      matched: MIN_CLASSIFIED_SAMPLES + 1,
    });
  });

  it('passes when the dominant language is the declared one', () => {
    const page = pageWith(paragraphs(UK_PARAGRAPH, MIN_CLASSIFIED_SAMPLES));
    expect(onPage(CONTRADICTS, page).verdict).toBe('pass');
  });

  it('passes when no language holds a dominant share', () => {
    const half = MIN_CLASSIFIED_SAMPLES - 2;
    const page = pageWith([
      ...paragraphs(RU_PARAGRAPH, half),
      ...Array.from({ length: half }, (_unused, index) =>
        textNode(`main > section:nth-child(${index + 1}) > p`, UK_PARAGRAPH),
      ),
    ]);
    expect(onPage(CONTRADICTS, page).verdict).toBe('pass');
  });

  it('will not call one node a dominant language', () => {
    const result = onPage(CONTRADICTS, pageWith([textNode('main > p', RU_PARAGRAPH)]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/too few to call any language dominant/);
  });
});

describe('core/content-chrome-untranslated', () => {
  it('observes chrome that classifies differently from the body', () => {
    const result = onPage(CHROME, CHROME_PAGE);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('observation');
    expect(result.findings[0]?.summary).toMatch(
      /classified ru where the main region classified uk/,
    );
    expect(result.findings[0]?.denominator).toEqual({
      examined: RU_NAV_ITEMS.length + 1,
      matched: RU_NAV_ITEMS.length,
    });
  });

  it('passes when chrome and body classify alike', () => {
    const page = pageWith([
      ...navItems(UK_NAV_ITEMS),
      textNode('main > article > p', UK_PARAGRAPH, { region: 'main' }),
    ]);
    expect(onPage(CHROME, page).verdict).toBe('pass');
  });

  it('is not applicable when the collector marked no regions', () => {
    const result = onPage(CHROME, pageWith(paragraphs(RU_PARAGRAPH, 2)));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/marked no navigation\/footer region/);
  });

  it('is not applicable when a region carries too little text to classify', () => {
    const page = pageWith([
      textNode('nav > a', 'Меню', { region: 'nav' }),
      textNode('main > p', UK_PARAGRAPH, { region: 'main' }),
    ]);
    expect(onPage(CHROME, page).verdict).toBe('not-applicable');
  });
});

describe('the text-sample exclusions', () => {
  it('matches a code element by name, never by substring', () => {
    expect(isInsideCodeElement('main > pre > code')).toBe(true);
    expect(isInsideCodeElement('article > code:nth-of-type(2)')).toBe(true);
    expect(isInsideCodeElement('main > kbd')).toBe(true);
    expect(isInsideCodeElement('main > samp')).toBe(true);
    // The class of bug this guards: a bare `includes('code')`.
    expect(isInsideCodeElement('main > div.code-sample > p')).toBe(false);
    expect(isInsideCodeElement('main > #barcode > p')).toBe(false);
    expect(isInsideCodeElement('main > p.encoded')).toBe(false);
  });

  it('drops a run of proper nouns and keeps prose', () => {
    expect(isProperNounRun('Nova Poshta Rozetka Ukraine Delivery Service')).toBe(true);
    expect(isProperNounRun(RU_PARAGRAPH)).toBe(false);
  });

  it('collapses whitespace before measuring the minimum length', () => {
    const padded = `\n   ${RU_PARAGRAPH}\t\n`;
    expect(classifiableSnippet(padded)).toBe(RU_PARAGRAPH);
    expect(classifiableSnippet('    ')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The head                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Real head strings, long enough to clear `MIN_CLASSIFIABLE_CHARS`. A title
 * shorter than that is silent by design, which is the honest answer for a
 * single short string — see `HEAD_REPORT_RUNGS` in `../text-samples`.
 */
const RU_TITLE = 'Доставка и оплата заказов по всей стране — интернет-магазин';
const UK_TITLE = 'Доставка та оплата замовлень по всій Україні — інтернет-магазин';
const EN_TITLE = 'Delivery and payment options for orders across the country';
const RU_DESCRIPTION =
  'Мы доставляем заказы по всей стране в течение двух рабочих дней, оплата картой или наличными.';

function headText(field: HeadTextField, text: string): HeadTextSample {
  return { field, text, nodePath: field === 'title' ? 'html > head > title' : `meta[${field}]` };
}

/**
 * A page declaring `uk`, with the given head strings and a body that agrees.
 *
 * The body carries enough nodes for `core/content-contradicts-declaration` to
 * reach a verdict at all, so a test can show that a foreign *head* leaves the
 * body rules at `pass` rather than at `not-applicable` — the weaker claim.
 */
function pageWithHeadText(texts: readonly HeadTextSample[], htmlLang = 'uk'): PageEvidence {
  return makePage({
    document: makeDocument({
      htmlLang,
      textNodes: paragraphs(UK_PARAGRAPH, MIN_CLASSIFIED_SAMPLES + 1),
      head: makeHead({ texts }),
    }),
  });
}

describe('core/title-contradicts-declaration', () => {
  it('observes a title that classifies against the declaration', () => {
    const result = onPage(TITLE, pageWithHeadText([headText('title', RU_TITLE)]));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('observation');
    expect(result.findings[0]?.grounding).toBe('classified');
    expect(result.findings[0]?.summary).toMatch(/classified ru where the page declares uk/);
    expect(result.findings[0]?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('states the string length, since one short string is the weakest input', () => {
    const result = onPage(TITLE, pageWithHeadText([headText('title', RU_TITLE)]));
    expect(result.findings[0]?.summary).toMatch(
      new RegExp(`one string of ${RU_TITLE.length} characters`),
    );
  });

  it('reports an English title exactly as it reports a Russian one', () => {
    // The catalogue's neutrality claim, as a guard. `en` is the lone Latin
    // candidate, so its verdict is non-discriminating — which is the *most*
    // reliable determination the classifier makes, not the least. The
    // `en`-is-lenient tier in core/lang-part-unmarked is about fragments; a
    // title is the whole of its surface, so it does not carry over.
    const result = onPage(TITLE, pageWithHeadText([headText('title', EN_TITLE)]));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('observation');
    expect(result.findings[0]?.summary).toMatch(/classified en where the page declares uk/);
  });

  it('passes a title that agrees with the declaration', () => {
    expect(onPage(TITLE, pageWithHeadText([headText('title', UK_TITLE)])).verdict).toBe('pass');
  });

  it('never lets a title fail the build', () => {
    const report = evaluate(
      networkEvidence([pageWithHeadText([headText('title', RU_TITLE)])]),
      RULESET,
    );
    expect(report.brokenPromises).toBe(0);
  });

  it('is silent on a title too short to classify, rather than speculating', () => {
    const result = onPage(TITLE, pageWithHeadText([headText('title', 'Головна')]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/reportable rung/);
  });

  it('distinguishes a v1 bundle from a page with no title', () => {
    const noHead = makePage({ document: makeDocument({ htmlLang: 'uk' }) });
    expect(onPage(TITLE, noHead).notApplicableReason).toMatch(/schemaVersion 1/);
    expect(onPage(TITLE, pageWithHeadText([])).notApplicableReason).toMatch(/no <title>/);
  });

  it('ignores the head fields the metadata rule owns', () => {
    const result = onPage(TITLE, pageWithHeadText([headText('og:description', RU_DESCRIPTION)]));
    expect(result.verdict).toBe('not-applicable');
  });
});

describe('core/head-metadata-contradicts-declaration', () => {
  it('observes preview fields that classify against the declaration', () => {
    const result = onPage(
      HEAD_METADATA,
      pageWithHeadText([
        headText('meta-description', RU_DESCRIPTION),
        headText('og:description', RU_DESCRIPTION),
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/2 of 2 head preview fields/);
    expect(result.findings[0]?.summary).toMatch(/description.*og:description/);
    expect(result.findings[0]?.denominator).toEqual({ examined: 2, matched: 2 });
  });

  it('groups by language, largest group first', () => {
    const result = onPage(
      HEAD_METADATA,
      pageWithHeadText([
        headText('meta-description', RU_DESCRIPTION),
        headText('og:description', RU_DESCRIPTION),
        headText('og:title', EN_TITLE),
      ]),
    );
    expect(result.findings.map((finding) => finding.denominator?.matched)).toEqual([2, 1]);
  });

  it('never counts the title in its denominator', () => {
    // The two rules partition the head; neither may borrow the other's fields,
    // or both denominators become claims about strings they never examined.
    const result = onPage(
      HEAD_METADATA,
      pageWithHeadText([headText('title', RU_TITLE), headText('og:description', RU_DESCRIPTION)]),
    );
    expect(result.findings[0]?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('passes preview text that agrees with the declaration', () => {
    const result = onPage(HEAD_METADATA, pageWithHeadText([headText('og:title', UK_TITLE)]));
    expect(result.verdict).toBe('pass');
  });

  it('is silent when no preview field is long enough to classify', () => {
    const result = onPage(HEAD_METADATA, pageWithHeadText([headText('og:title', 'Головна')]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/reportable rung/);
  });

  it('breaks a tie between equal-sized groups by code, so the report is stable', () => {
    const result = onPage(
      HEAD_METADATA,
      pageWithHeadText([
        headText('og:description', RU_DESCRIPTION),
        headText('og:title', EN_TITLE),
      ]),
    );
    expect(result.findings.map((finding) => finding.denominator?.matched)).toEqual([1, 1]);
    // `en` before `ru`: equal groups sort by language code, never by input order.
    expect(result.findings[0]?.summary).toMatch(/classified en/);
    expect(result.findings[1]?.summary).toMatch(/classified ru/);
  });
});

describe('the head is never joined to the body', () => {
  /**
   * The structural reason `core/title-contradicts-declaration` exists at all: a
   * title folded into `textNodes` would be one string among a thousand-odd —
   * invisible to the dominance vote, and skewing its denominator on the way
   * past. These guard that the two never contaminate each other.
   */
  const RU_HEAD_UK_BODY = pageWithHeadText([
    headText('title', RU_TITLE),
    headText('og:description', RU_DESCRIPTION),
  ]);

  it('leaves the body rules untouched by a foreign head', () => {
    expect(onPage(MIXED, RU_HEAD_UK_BODY).verdict).toBe('pass');
    expect(onPage(CONTRADICTS, RU_HEAD_UK_BODY).verdict).toBe('pass');
  });

  it("keeps the body out of the head rules' denominators", () => {
    // The body has two sampled nodes; neither may reach a head denominator.
    expect(onPage(TITLE, RU_HEAD_UK_BODY).findings[0]?.denominator).toEqual({
      examined: 1,
      matched: 1,
    });
  });

  it('leaves the head rules untouched by a foreign body', () => {
    const ukHeadRuBody = makePage({
      document: makeDocument({
        htmlLang: 'uk',
        textNodes: paragraphs(RU_PARAGRAPH, MIN_CLASSIFIED_SAMPLES + 1),
        head: makeHead({ texts: [headText('title', UK_TITLE)] }),
      }),
    });
    // The title agrees with the declaration and passes, even though the body
    // is loudly Russian — which the body rule reports, on its own denominator.
    expect(onPage(TITLE, ukHeadRuBody).verdict).toBe('pass');
    expect(onPage(CONTRADICTS, ukHeadRuBody).findings[0]?.denominator).toEqual({
      examined: MIN_CLASSIFIED_SAMPLES + 1,
      matched: MIN_CLASSIFIED_SAMPLES + 1,
    });
  });
});

function verdictAtRung(rung: ClassifiedText['rung']): ClassifiedText {
  return { language: 'ru', margin: 1, rung, discriminating: true };
}

describe('the head-string rung gate', () => {
  /**
   * The gate that decides whether a head string is reportable at all, exercised
   * through a stub classifier because the shipped one cannot reach rung 3
   * without franc injected — and rung 3 is precisely the rung this must refuse.
   */
  const TITLE_SAMPLE: HeadTextSample = {
    field: 'title',
    text: RU_TITLE,
    nodePath: 'html > head > title',
  };

  it('accepts a distinctive-signal rung', () => {
    for (const rung of [1, '2a', '2b'] as const) {
      const classified = classifyHeadTexts(() => verdictAtRung(rung), [TITLE_SAMPLE]);
      expect(classified).toHaveLength(1);
    }
  });

  it('refuses a rung-3 verdict, where franc guessed alone', () => {
    // franc is the weakest engine measured in docs/no-llm-language-detection.md
    // (73.2 %); it cannot carry an observation about a single short string.
    expect(classifyHeadTexts(() => verdictAtRung(3), [TITLE_SAMPLE])).toEqual([]);
  });

  it('refuses an abstention', () => {
    expect(classifyHeadTexts(() => null, [TITLE_SAMPLE])).toEqual([]);
  });

  it('does not require a discriminating verdict, unlike the fragment rule', () => {
    // `en` is the lone Latin candidate, so its verdict is always
    // non-discriminating. Requiring discrimination here would make an English
    // title structurally unreportable — the opposite of what the catalogue says.
    const nonDiscriminating: ClassifiedText = {
      language: 'en',
      margin: 1,
      rung: 1,
      discriminating: false,
    };
    expect(classifyHeadTexts(() => nonDiscriminating, [TITLE_SAMPLE])).toHaveLength(1);
  });
});
