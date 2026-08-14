import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type { Evidence, PageEvidence, TextNodeSample } from '../evidence';
import type { Finding } from '../finding';
import type { RuleResult } from '../report';
import { createRuleset } from '../ruleset';
import {
  classifiableSnippet,
  isInsideCodeElement,
  isProperNounRun,
  MIN_CLASSIFIABLE_CHARS,
} from '../text-samples';
import { contentLanguageFamily, MIN_CLASSIFIED_SAMPLES } from './content-language';
import { makeDocument, makePage, networkEvidence } from '../../test/fixtures';

const RULESET = createRuleset({
  id: 'test/content-language',
  version: '0.0.0-test',
  families: [contentLanguageFamily],
});

const MIXED = 'core/content-language-mixed';
const CONTRADICTS = 'core/content-contradicts-declaration';
const CHROME = 'core/content-chrome-untranslated';

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
  it('ships the three content-language rules', () => {
    expect(contentLanguageFamily.rules.map((rule) => rule.id)).toEqual([
      MIXED,
      CONTRADICTS,
      CHROME,
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
    expect(result.findings[0]?.summary).toMatch(/1 of 1 sampled text nodes classified ru/);
    expect(result.findings[0]?.denominator).toEqual({ examined: 1, matched: 1 });
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
