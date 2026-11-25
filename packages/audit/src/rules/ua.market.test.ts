import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type { PageEvidence } from '../evidence';
import { ruleCitation } from '../rule';
import { UA_CITATION, UA_VERSION_VOLUME_DELTA_THRESHOLD, uaPackFamily } from './ua';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  LOCAL_VANTAGE,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';
import { RULESET, resultFor, ukMarketPage, UK_ALTERNATE } from './ua.test-utils';

/** A page that declares no Ukrainian-market signal at all. */
function foreignPage(overrides: Partial<PageEvidence> = {}): PageEvidence {
  return makePage({
    id: 'page-1',
    url: 'https://example.com/',
    document: makeDocument({ htmlLang: 'en' }),
    ...overrides,
  });
}

describe('the family', () => {
  it('ships the six ua jurisdiction-pack rules in catalogue order', () => {
    expect(uaPackFamily.rules.map((rule) => rule.id)).toEqual([
      'ua/market-determination',
      'ua/state-language-absent',
      'ua/state-language-not-default',
      'ua/state-language-not-default-by-ip',
      'ua/state-language-version-lesser',
      'ua/state-language-interface-elements',
    ]);
  });

  it('carries the exact catalogue citation on every rule, all declared-grounded', () => {
    for (const rule of uaPackFamily.rules) {
      expect(ruleCitation(rule)).toEqual(UA_CITATION);
      expect(rule.grounding).toBe('declared');
    }
  });

  it('marks exactly ua/state-language-not-default as hybrid', () => {
    const hybridIds = uaPackFamily.rules
      .filter((rule) => rule.hybrid === true)
      .map((rule) => rule.id);
    expect(hybridIds).toEqual(['ua/state-language-not-default']);
  });

  it('declares capabilities verbatim from the catalogue Needs column', () => {
    const byId = new Map(uaPackFamily.rules.map((rule) => [rule.id, rule]));
    expect(byId.get('ua/market-determination')?.capabilities).toEqual(['static']);
    expect(byId.get('ua/state-language-absent')?.capabilities).toEqual(['http']);
    expect(byId.get('ua/state-language-not-default')?.capabilities).toEqual(['http']);
    expect(byId.get('ua/state-language-not-default-by-ip')?.capabilities).toEqual([
      'multi-vantage',
    ]);
    expect(byId.get('ua/state-language-version-lesser')?.capabilities).toEqual(['site']);
    expect(byId.get('ua/state-language-interface-elements')?.capabilities).toEqual(['static']);
  });
});

describe('ua/market-determination', () => {
  const RULE = 'ua/market-determination';

  it('reports the .ua TLD signal', () => {
    const page = foreignPage({ url: 'https://example.com.ua/' });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/\.ua top-level domain/);
    expect(result.findings[0]?.summary).toMatch(/example\.com\.ua/);
  });

  it('reports the UAH currency signal', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [{ nodePath: 'main > p.price', text: 'Ціна: 499 грн', inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/UAH pricing/);
  });

  it('reports the ЄДРПОУ signal', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [{ nodePath: 'footer > p', text: 'Код ЄДРПОУ 12345678', inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/ЄДРПОУ/);
  });

  it('reports the Ukrainian legal-entity signal', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [{ nodePath: 'footer > p', text: 'ТОВ «Приклад»', inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/legal-entity/);
  });

  it('reports the uk-UA hreflang signal', () => {
    const page = foreignPage({
      document: makeDocument({ htmlLang: 'en', alternates: [UK_ALTERNATE] }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/uk-UA hreflang/);
  });

  it('reports the Ukrainian postal-address signal', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [
          { nodePath: 'footer > address', text: 'Київ, 01001, Україна', inheritedLang: null },
        ],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/postal address/);
  });

  it('reports that no signal fired when the market is undeterminable, without going not-applicable', () => {
    const page = foreignPage();
    const result = resultFor(RULE, networkEvidence([page]));
    // info never fails or warns, so the rule-level verdict reads pass.
    expect(result.verdict).toBe('pass');
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/No Ukrainian-market signal/);
  });

  it('does not crash on a malformed URL, and reports no TLD signal from it', () => {
    const page = foreignPage({ url: 'not-a-valid-url' });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/No Ukrainian-market signal/);
  });

  it('reports no market signal for a filesystem-collected page, which carries a build path but no URL', () => {
    const page = makeBuildPage({ document: makeDocument({ htmlLang: 'en' }) });
    const result = resultFor(RULE, filesystemEvidence([page]));
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/No Ukrainian-market signal/);
    // subjectOf omits `url` entirely rather than sending `undefined` — and
    // still carries the build `path`, which is all this page has.
    expect(result.findings[0]?.subject).toEqual({ path: 'uk/index.html' });
  });

  it('reports the ЄДРПОУ signal when the code sits in the text node following the label', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [
          { nodePath: 'table > tr > td.label', text: 'ЄДРПОУ', inheritedLang: null },
          { nodePath: 'table > tr > td.value', text: '87654321', inheritedLang: null },
        ],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/ЄДРПОУ/);
    expect(result.findings[0]?.evidence).toContainEqual({
      kind: 'node',
      pageId: page.id,
      nodePath: 'table > tr > td.label',
    });
  });

  it('does not report an ЄДРПОУ signal when the label is not followed by a code anywhere', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [{ nodePath: 'footer > p', text: 'Реквізити: ЄДРПОУ', inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/No Ukrainian-market signal/);
  });

  it('truncates a long signal-bearing passage to a safe excerpt in the report', () => {
    const longText =
      'Ласкаво просимо до нашого інтернет-магазину, тут ви знайдете все необхідне, а ціна вказана в ₴ для зручності клієнтів.';
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.summary).toMatch(/UAH pricing/);
    expect(result.findings[0]?.summary).toContain('…');
    expect(result.findings[0]?.summary).not.toContain(longText);
  });

  it('cites the alternate’s own node path when the uk-UA hreflang signal declares one', () => {
    const page = foreignPage({
      document: makeDocument({
        htmlLang: 'en',
        alternates: [
          {
            hreflang: 'uk-UA',
            href: 'https://example.com.ua/uk/',
            source: 'link',
            nodePath: 'head > link.alt-uk',
          },
        ],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.findings[0]?.evidence).toContainEqual({
      kind: 'node',
      pageId: page.id,
      nodePath: 'head > link.alt-uk',
    });
  });
});

describe('an undeterminable market', () => {
  const page1 = foreignPage({ id: 'page-1', url: 'https://example.com/' });
  const page2 = foreignPage({ id: 'page-2', url: 'https://example.com/about' });
  const probes = [
    makeProbe({
      id: 'probe-1',
      pageId: 'page-1',
      url: 'https://example.com/',
      vantage: LOCAL_VANTAGE,
    }),
    makeProbe({
      id: 'probe-2',
      pageId: 'page-2',
      url: 'https://example.com/about',
      vantage: CLAIMED_DE_VANTAGE,
    }),
  ];
  const evidence = networkEvidence([page1, page2], probes);

  it.each([
    'ua/state-language-absent',
    'ua/state-language-not-default',
    'ua/state-language-not-default-by-ip',
    'ua/state-language-version-lesser',
    'ua/state-language-interface-elements',
  ] as const)('reports %s as not-applicable, never fail — the pack safety property', (ruleId) => {
    const result = resultFor(ruleId, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/Ukrainian-market signal/);
  });

  it('still lets ua/market-determination report, rather than going not-applicable itself', () => {
    const result = resultFor('ua/market-determination', evidence);
    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((finding) => finding.verdict === 'info')).toBe(true);
  });
});

describe('citation coverage', () => {
  it('stamps the exact catalogue citation on every finding this pack emits', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: 'ru',
        textNodes: [
          { nodePath: 'body > footer', text: 'x', inheritedLang: 'en', region: 'footer' },
        ],
      }),
    });
    const evidence = networkEvidence([page], [makeProbe({ pageId: page.id, url: page.url ?? '' })]);
    const report = evaluate(evidence, RULESET);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(finding.citation).toEqual(UA_CITATION);
    }
  });
});

describe('the volume-delta threshold', () => {
  it('is exposed as a named, sane constant', () => {
    expect(UA_VERSION_VOLUME_DELTA_THRESHOLD).toBeGreaterThan(0);
    expect(UA_VERSION_VOLUME_DELTA_THRESHOLD).toBeLessThan(1);
  });
});
