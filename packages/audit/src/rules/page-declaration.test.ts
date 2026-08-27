import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type { Evidence, HeadLanguageDeclaration, PageEvidence, TextNodeSample } from '../evidence';
import type { RuleResult } from '../report';
import { createRuleset } from '../ruleset';
import { MIN_CLASSIFIABLE_CHARS } from '../text-samples';
import { pageDeclarationFamily, UNMARKED_PART_FAIL_MIN_CHARS } from './page-declaration';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makeHead,
  makePage,
  makePicker,
  networkEvidence,
} from '../../test/fixtures';

const RULESET = createRuleset({
  id: 'test/page-declaration',
  version: '0.0.0-test',
  families: [pageDeclarationFamily],
});

function resultFor(ruleId: string, evidence: Evidence): RuleResult {
  const result = evaluate(evidence, RULESET).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

function onPage(ruleId: string, page: PageEvidence): RuleResult {
  return resultFor(ruleId, networkEvidence([page]));
}

/**
 * Real prose: `core/lang-part-unmarked` is only meaningful against text the
 * shipped classifier actually has an opinion about.
 */
const UK_PARAGRAPH =
  'Ми доставляємо замовлення по всій Україні протягом двох робочих днів, а оплата можлива карткою або готівкою при отриманні.';
const RU_PARAGRAPH =
  'Мы доставляем заказы по всей стране в течение двух рабочих дней, оплата возможна картой или наличными при получении.';
/** Long enough to classify, short of the length a `fail` demands. */
const RU_FRAGMENT = 'Мы работаем без выходных и отвечаем на все вопросы.';
const EN_PARAGRAPH =
  'Our engineering team publishes a detailed changelog every second week, and you can subscribe to it by email.';

function textNode(
  nodePath: string,
  text: string,
  inheritedLang: string | null = null,
): TextNodeSample {
  return { nodePath, text, inheritedLang };
}

function pageWithText(textNodes: readonly TextNodeSample[], htmlLang = 'uk'): PageEvidence {
  return makePage({ document: makeDocument({ htmlLang, textNodes }) });
}

describe('the family', () => {
  it('ships the nine page-declaration rules, in catalogue order', () => {
    expect(pageDeclarationFamily.rules.map((rule) => rule.id)).toEqual([
      'core/lang-missing',
      'core/lang-malformed',
      'core/lang-contradicts-url',
      'core/lang-contradicts-picker',
      'core/lang-contradicts-og-locale',
      'core/lang-contradicts-content-language',
      'core/og-locale-malformed',
      'core/lang-part-unmarked',
      'core/lang-part-malformed',
    ]);
  });

  it('is entirely declared-grounded, so the site is always the witness', () => {
    for (const rule of pageDeclarationFamily.rules) {
      expect(rule.grounding).toBe('declared');
      expect(rule.capabilities).toEqual(['static']);
    }
  });

  it('has exactly one hybrid — the rule the classifier answers for', () => {
    const hybrids = pageDeclarationFamily.rules.filter((rule) => rule.hybrid === true);
    expect(hybrids.map((rule) => rule.id)).toEqual(['core/lang-part-unmarked']);
  });
});

describe('core/lang-missing', () => {
  const RULE = 'core/lang-missing';

  it('passes when <html lang> is declared', () => {
    expect(onPage(RULE, makePage()).verdict).toBe('pass');
  });

  it('fails when the attribute is absent', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: null }) }));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/carries no lang attribute/);
    expect(result.findings[0]?.grounding).toBe('declared');
  });

  it('fails when the attribute is present but blank', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: '   ' }) }));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/empty lang attribute/);
  });
});

describe('core/lang-malformed', () => {
  const RULE = 'core/lang-malformed';

  it('passes a well-formed tag', () => {
    expect(onPage(RULE, makePage({ document: makeDocument({ htmlLang: 'uk-UA' }) })).verdict).toBe(
      'pass',
    );
  });

  it('fails a tag that is not BCP-47', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: 'uk_UA' }) }));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/not a well-formed BCP-47/);
  });

  it('defers to core/lang-missing when there is nothing to check', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: null }) }));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/core\/lang-missing/);
  });
});

describe('core/lang-contradicts-url', () => {
  const RULE = 'core/lang-contradicts-url';

  it('passes when the path prefix agrees with the declaration', () => {
    expect(onPage(RULE, makePage()).verdict).toBe('pass');
  });

  it('fails <html lang="ru"> served at /uk/', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: 'ru' }) }));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/contradicts its own URL/);
  });

  it('fails a language subdomain that disagrees with the declaration', () => {
    const result = onPage(
      RULE,
      makePage({ url: 'https://ru.example.com/products', document: makeDocument() }),
    );
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/subdomain marker/);
  });

  it('fails a declaration Movar does not act on but the URL contradicts', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: 'de-DE' }) }));
    expect(result.verdict).toBe('fail');
  });

  it('reads a build path when there is no URL', () => {
    const page = makeBuildPage({ document: makeDocument({ htmlLang: 'ru' }) });
    expect(resultFor(RULE, filesystemEvidence([page])).verdict).toBe('fail');
  });

  it('does not fire on a slug that merely starts with a language code', () => {
    // The Bosch regression, as a rule-level guard: `/ru-return-warranty` is a
    // product slug. Strict alias matching never hyphen-splits.
    const page = makePage({ url: 'https://example.com/ru-return-warranty' });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no language marker/);
  });

  it('defers to core/lang-malformed when the declaration is not a tag', () => {
    const result = onPage(RULE, makePage({ document: makeDocument({ htmlLang: 'uk_UA' }) }));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/core\/lang-malformed/);
  });
});

describe('core/lang-contradicts-picker', () => {
  const RULE = 'core/lang-contradicts-picker';

  it('passes when the active entry agrees with the declaration', () => {
    const page = makePage({
      document: makeDocument({ picker: makePicker({ activeLabel: 'UA' }) }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('fails when the picker marks another language active', () => {
    const page = makePage({
      document: makeDocument({ picker: makePicker({ activeLabel: 'ru' }) }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/contradicts its own switcher/);
    expect(result.findings[0]?.subject.node).toBe('body > nav > ul.lang');
  });

  it('is not applicable when the page exposes no picker', () => {
    expect(onPage(RULE, makePage()).verdict).toBe('not-applicable');
  });

  it('is not applicable when no entry is marked active', () => {
    const page = makePage({
      document: makeDocument({ picker: makePicker({ activeLabel: null }) }),
    });
    expect(onPage(RULE, page).verdict).toBe('not-applicable');
  });

  it('is not applicable when the active label is not a language Movar knows', () => {
    const page = makePage({
      document: makeDocument({ picker: makePicker({ activeLabel: 'Klingon' }) }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/not a language Movar recognises/);
  });
});

describe('core/lang-part-unmarked', () => {
  const RULE = 'core/lang-part-unmarked';

  it('passes when every passage is the language the page declares', () => {
    expect(onPage(RULE, pageWithText([textNode('main > p', UK_PARAGRAPH)])).verdict).toBe('pass');
  });

  it('passes an element that DOES declare the other language — the correct markup', () => {
    const page = pageWithText([textNode('main > blockquote', RU_PARAGRAPH, 'ru')]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });

  it('reads the language in effect, not the page declaration', () => {
    // The mirror image: a passage declared `ru` whose text classifies `uk`.
    const page = pageWithText([textNode('main > blockquote', UK_PARAGRAPH, 'ru')]);
    expect(onPage(RULE, page).findings).toHaveLength(1);
  });

  it('grades ru inside uk as a fail — which the kernel then downgrades', () => {
    const page = pageWithText([textNode('main > p', RU_PARAGRAPH)]);
    const finding = onPage(RULE, page).findings[0];
    expect(finding?.grounding).toBe('declared');
    expect(finding?.via).toBe('classified');
    // The rule drafts `fail`; the classifier answered, so the kernel strips its
    // failing power and says so on the face of the finding. That downgrade is
    // unconditional here, which is why the catalogue grades it `warn` /
    // `observation` rather than `fail`.
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.verdict).toBe('observation');
    expect(finding?.summary).toMatch(/WCAG 2\.1 SC 3\.1\.2/);
    expect(finding?.summary).toMatch(/1 of 1 text nodes/);
    expect(finding?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('never fails a build, whatever the classifier said', () => {
    const report = evaluate(
      networkEvidence([pageWithText([textNode('p', RU_PARAGRAPH)])]),
      RULESET,
    );
    expect(report.brokenPromises).toBe(0);
  });

  it('grades en inside uk as a warn at most — English fragments are deliberate', () => {
    const page = pageWithText([textNode('main > p', EN_PARAGRAPH)]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.verdict).toBe('warn');
    expect(result.findings[0]?.downgradedFrom).toBeUndefined();
    expect(result.findings[0]?.denominator).toBeDefined();
  });

  it('grades a passage below the fail length as a warn', () => {
    expect(RU_FRAGMENT.length).toBeLessThan(UNMARKED_PART_FAIL_MIN_CHARS);
    const result = onPage(RULE, pageWithText([textNode('main > p', RU_FRAGMENT)]));
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.verdict).toBe('warn');
  });

  it('excludes strings under the minimum length', () => {
    const short = RU_PARAGRAPH.slice(0, MIN_CLASSIFIABLE_CHARS - 1);
    expect(onPage(RULE, pageWithText([textNode('main > p', short)])).verdict).toBe('pass');
  });

  it('excludes text inside <code>', () => {
    const page = pageWithText([textNode('main > pre > code', RU_PARAGRAPH)]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('counts every mismatching passage in the denominator, not just the cited one', () => {
    const page = pageWithText([
      textNode('main > p:nth-child(1)', RU_PARAGRAPH),
      textNode('main > p:nth-child(2)', RU_PARAGRAPH),
      textNode('main > p:nth-child(3)', UK_PARAGRAPH),
    ]);
    const result = onPage(RULE, page);
    expect(result.findings).toHaveLength(2);
    for (const finding of result.findings) {
      expect(finding.denominator).toEqual({ examined: 3, matched: 2 });
    }
  });

  it('defers to core/lang-missing and core/lang-malformed', () => {
    const missing = onPage(RULE, pageWithText([textNode('p', RU_PARAGRAPH)], ''));
    expect(missing.notApplicableReason).toMatch(/core\/lang-missing/);
    const malformed = onPage(RULE, pageWithText([textNode('p', RU_PARAGRAPH)], 'uk_UA'));
    expect(malformed.notApplicableReason).toMatch(/core\/lang-malformed/);
  });

  it('is not applicable when Movar ships no profile for the declared language', () => {
    const result = onPage(RULE, pageWithText([textNode('p', RU_PARAGRAPH)], 'de-DE'));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no detection profile/);
  });
});

describe('core/lang-part-malformed', () => {
  const RULE = 'core/lang-part-malformed';

  it('passes when no element carries lang', () => {
    expect(onPage(RULE, makePage()).verdict).toBe('pass');
  });

  it('passes a well-formed element lang', () => {
    const page = makePage({
      document: makeDocument({ langAttributes: [{ nodePath: 'main > p', value: 'en-GB' }] }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('fails once per malformed attribute, citing the node', () => {
    const page = makePage({
      document: makeDocument({
        langAttributes: [
          { nodePath: 'main > p:nth-child(1)', value: 'en_GB' },
          { nodePath: 'main > p:nth-child(2)', value: 'uk' },
          { nodePath: 'main > blockquote', value: '???' },
        ],
      }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((finding) => finding.subject.node)).toEqual([
      'main > p:nth-child(1)',
      'main > blockquote',
    ]);
  });

  it('accepts lang="" — legal HTML for "the language is unknown"', () => {
    const page = makePage({
      document: makeDocument({ langAttributes: [{ nodePath: 'main > p', value: '' }] }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });
});

/** A page declaring `uk` in `<html lang>`, with the given head declarations. */
function pageWithHead(
  declarations: readonly HeadLanguageDeclaration[],
  htmlLang = 'uk',
): PageEvidence {
  return makePage({
    document: makeDocument({ htmlLang, head: makeHead({ declarations }) }),
  });
}

function ogLocale(value: string): HeadLanguageDeclaration {
  return {
    kind: 'og-locale',
    value,
    source: 'meta',
    nodePath: 'html > head > meta:nth-of-type(2)',
  };
}

describe('the head declaration surface', () => {
  describe('core/lang-contradicts-og-locale', () => {
    const RULE = 'core/lang-contradicts-og-locale';

    it('fails an og:locale naming a different language', () => {
      const result = onPage(RULE, pageWithHead([ogLocale('ru_RU')]));
      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/contradicts its own head/);
      expect(result.findings[0]?.subject.node).toBe('html > head > meta:nth-of-type(2)');
    });

    it('passes when og:locale merely adds a region the page did not name', () => {
      // `<html lang="uk">` beside `og:locale="uk_UA"` is a language plus a
      // market, not a contradiction. Region is compared only when both carry one.
      expect(onPage(RULE, pageWithHead([ogLocale('uk_UA')])).verdict).toBe('pass');
    });

    it('passes when both carry a region', () => {
      expect(onPage(RULE, pageWithHead([ogLocale('uk_UA')], 'uk-UA')).verdict).toBe('pass');
    });

    it('reports a head that was collected but declares no og:locale', () => {
      const result = onPage(RULE, pageWithHead([]));
      expect(result.verdict).toBe('not-applicable');
      expect(result.notApplicableReason).toMatch(/no og:locale/);
    });

    it('does not manufacture a contradiction from a blank declaration', () => {
      // An `og:locale` with no value declares nothing, so there is nothing for
      // `<html lang>` to disagree with. Treating "declares nothing" as
      // "declares something else" is exactly the false accusation to avoid.
      expect(onPage(RULE, pageWithHead([ogLocale('   ')])).verdict).toBe('pass');
    });

    it('distinguishes a v1 bundle from a head with nothing in it', () => {
      // A `schemaVersion` 1 bundle carries no `head` at all. Saying so is the
      // difference between "nothing was collected" and "nothing was there" —
      // and a `pass` here would destroy it.
      const page = makePage({ document: makeDocument({ htmlLang: 'uk' }) });
      const result = onPage(RULE, page);
      expect(result.verdict).toBe('not-applicable');
      expect(result.notApplicableReason).toMatch(/schemaVersion 1/);
    });
  });

  describe('core/lang-contradicts-content-language', () => {
    const RULE = 'core/lang-contradicts-content-language';

    it('fails a Content-Language response header naming a different language', () => {
      const result = onPage(
        RULE,
        pageWithHead([{ kind: 'content-language', value: 'ru', source: 'header' }]),
      );
      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/Content-Language response header/);
      // The header has no element, so the finding cites the page alone.
      expect(result.findings[0]?.subject.node).toBeUndefined();
    });

    it('fails the obsolete meta carrier too, citing its element', () => {
      const result = onPage(
        RULE,
        pageWithHead([
          {
            kind: 'content-language',
            value: 'ru',
            source: 'meta',
            nodePath: 'html > head > meta:nth-of-type(3)',
          },
        ]),
      );
      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/http-equiv/);
      expect(result.findings[0]?.subject.node).toBe('html > head > meta:nth-of-type(3)');
    });

    it('passes a comma-separated list that includes the declared language', () => {
      // `Content-Language: en, uk` says the response is in both, and it is.
      // Collapsing it to the first entry would manufacture a contradiction.
      const result = onPage(
        RULE,
        pageWithHead([{ kind: 'content-language', value: 'en, uk', source: 'header' }]),
      );
      expect(result.verdict).toBe('pass');
    });

    it('fails a list that omits the declared language', () => {
      const result = onPage(
        RULE,
        pageWithHead([{ kind: 'content-language', value: 'en, ru', source: 'header' }]),
      );
      expect(result.verdict).toBe('fail');
    });
  });

  describe('core/og-locale-malformed', () => {
    const RULE = 'core/og-locale-malformed';

    it('passes the language_TERRITORY form', () => {
      expect(onPage(RULE, pageWithHead([ogLocale('uk_UA')])).verdict).toBe('pass');
    });

    it('tolerates casing rather than reporting a preference as a defect', () => {
      expect(onPage(RULE, pageWithHead([ogLocale('uk_ua')])).verdict).toBe('pass');
    });

    it('warns — never fails — on a BCP-47 hyphen pasted into an Open Graph slot', () => {
      const result = onPage(RULE, pageWithHead([ogLocale('uk-UA')]));
      expect(result.verdict).toBe('warn');
      expect(result.findings[0]?.verdict).toBe('warn');
      expect(result.findings[0]?.summary).toMatch(/language_TERRITORY/);
    });

    it('warns on a bare language with no territory', () => {
      expect(onPage(RULE, pageWithHead([ogLocale('uk')])).verdict).toBe('warn');
    });

    it('checks og:locale:alternate under the same grammar', () => {
      const result = onPage(
        RULE,
        pageWithHead([
          ogLocale('uk_UA'),
          { kind: 'og-locale-alternate', value: 'ru', source: 'meta', nodePath: 'meta' },
        ]),
      );
      expect(result.verdict).toBe('warn');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.summary).toMatch(/og:locale:alternate/);
    });
  });
});

describe('the report the family produces', () => {
  it('counts broken promises rather than scoring', () => {
    const page = makePage({
      document: makeDocument({ htmlLang: null, langAttributes: [{ nodePath: 'p', value: 'q_q' }] }),
    });
    const report = evaluate(networkEvidence([page]), RULESET);
    expect(report.brokenPromises).toBe(2);
    expect(report.coverage.failed).toBe(2);
    expect(report.coverage.rules).toBe(9);
    expect(report.coverage.notCollected).toBe(0);
  });

  it('merges per-page outcomes for the whole page set', () => {
    const clean = makePage();
    const broken = makePage({
      id: 'page-2',
      url: 'https://example.com.ua/uk/about',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    const result = resultFor('core/lang-contradicts-url', networkEvidence([clean, broken]));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject.url).toBe('https://example.com.ua/uk/about');
  });
});
