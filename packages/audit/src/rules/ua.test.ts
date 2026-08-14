import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type { AlternateLink, Evidence, PageEvidence } from '../evidence';
import type { RuleResult } from '../report';
import { ruleCitation } from '../rule';
import type { Ruleset } from '../ruleset';
import { CORE_RULESET, createRuleset, UA_PACK_FAMILIES, withPack } from '../ruleset';
import { UA_CITATION, UA_VERSION_VOLUME_DELTA_THRESHOLD, uaPackFamily } from './ua';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  LOCAL_VANTAGE,
  makeBuildPage,
  makeDocument,
  makePage,
  makePicker,
  makeProbe,
  networkEvidence,
  VERIFIED_UA_VANTAGE,
} from '../../test/fixtures';

const RULESET = createRuleset({ id: 'test/ua', version: '0.0.0-test', families: [uaPackFamily] });

/** The pack as a caller actually composes it — the neutral core plus family F. */
const COMPOSED_RULESET = withPack(CORE_RULESET, ...UA_PACK_FAMILIES);

function resultFor(ruleId: string, evidence: Evidence, ruleset: Ruleset = RULESET): RuleResult {
  const result = evaluate(evidence, ruleset).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

/** One page, with a single probe attached so `http` capability is satisfied. */
function evidenceFor(page: PageEvidence): Evidence {
  return networkEvidence([page], [makeProbe({ pageId: page.id, url: page.url ?? '' })]);
}

function pageIn(
  id: string,
  path: string,
  htmlLang: string,
  overrides: Partial<PageEvidence> = {},
): PageEvidence {
  return makePage({
    id,
    url: `https://example.com.ua${path}`,
    document: makeDocument({ htmlLang }),
    ...overrides,
  });
}

/** A page whose URL alone declares the Ukrainian market (the `.ua` TLD signal). */
function ukMarketPage(overrides: Partial<PageEvidence> = {}): PageEvidence {
  return makePage({ url: 'https://example.com.ua/', ...overrides });
}

/** A page that declares no Ukrainian-market signal at all. */
function foreignPage(overrides: Partial<PageEvidence> = {}): PageEvidence {
  return makePage({
    id: 'page-1',
    url: 'https://example.com/',
    document: makeDocument({ htmlLang: 'en' }),
    ...overrides,
  });
}

const UK_ALTERNATE: AlternateLink = {
  hreflang: 'uk-UA',
  href: 'https://example.com.ua/uk/',
  source: 'link',
};

// Real, classifier-distinguishable prose for the majority-vote tests below —
// gibberish never classifies at all, so the "which language won" branches
// need text the snippet classifier actually has an opinion about.
const RU_TEXT_A =
  'Мы принимаем заказы через сайт и по телефону, служба поддержки работает без выходных для наших клиентов по всей стране.';
const RU_TEXT_B =
  'Каждый заказ проверяется перед отправкой, а вернуть товар можно в течение четырнадцати дней без объяснения причин.';
const UK_TEXT_A =
  'Ми приймаємо замовлення через сайт і по телефону, служба підтримки працює без вихідних для наших клієнтів по всій країні.';

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

describe('ua/state-language-absent', () => {
  const RULE = 'ua/state-language-absent';

  it('fires when nothing declares Ukrainian and nothing serves it by default', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: 'ru' }) });
    const result = resultFor(RULE, evidenceFor(page));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.grounding).toBe('declared');
    expect(result.findings[0]?.citation).toEqual(UA_CITATION);
    expect(result.findings[0]?.summary).toMatch(/No Ukrainian-language version is declared/);
  });

  it('passes when a Ukrainian version is declared elsewhere, even though this page serves another language', () => {
    const page = ukMarketPage({
      document: makeDocument({ htmlLang: 'ru', alternates: [UK_ALTERNATE] }),
    });
    expect(resultFor(RULE, evidenceFor(page)).verdict).toBe('pass');
  });

  it('passes when the page already serves Ukrainian by default', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: 'uk' }) });
    expect(resultFor(RULE, evidenceFor(page)).verdict).toBe('pass');
  });

  it('passes when a Ukrainian version is declared only via a link target, not an alternate or picker', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: 'ru',
        links: [{ href: 'https://example.com.ua/uk/', nodePath: 'nav > a.uk', hreflang: 'uk' }],
      }),
    });
    expect(resultFor(RULE, evidenceFor(page)).verdict).toBe('pass');
  });

  it('fires when the page carries no <html lang> attribute at all, not just a non-Ukrainian one', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: null }) });
    const result = resultFor(RULE, evidenceFor(page));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/No Ukrainian-language version is declared/);
  });
});

describe('ua/state-language-not-default', () => {
  const RULE = 'ua/state-language-not-default';

  it('defers to ua/state-language-absent when no Ukrainian version is declared', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: 'ru' }) });
    const result = resultFor(RULE, evidenceFor(page));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/ua\/state-language-absent/);
  });

  it('fires (declared) when a Ukrainian version is declared but another language loads by default', () => {
    const page = ukMarketPage({
      document: makeDocument({ htmlLang: 'ru', alternates: [UK_ALTERNATE] }),
    });
    const result = resultFor(RULE, evidenceFor(page));
    expect(result.verdict).toBe('fail');
    const finding = result.findings[0];
    expect(finding?.grounding).toBe('declared');
    expect(finding?.via).toBeUndefined();
    expect(finding?.citation).toEqual(UA_CITATION);
    expect(finding?.summary).toMatch(/<html lang="ru">/);
  });

  it('passes (declared) when the Ukrainian version is itself what loads by default', () => {
    const page = ukMarketPage({
      document: makeDocument({ htmlLang: 'uk', alternates: [UK_ALTERNATE] }),
    });
    expect(resultFor(RULE, evidenceFor(page)).verdict).toBe('pass');
  });

  it('fires (hybrid, classified) and the kernel downgrades it to an observation when there is no <html lang>', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: null,
        alternates: [UK_ALTERNATE],
        textNodes: [
          {
            nodePath: 'main > p',
            text: 'Welcome to our online store. Browse our latest products and enjoy free shipping.',
            inheritedLang: null,
          },
        ],
      }),
    });
    const result = resultFor(RULE, evidenceFor(page));
    // The rule-level verdict never shows fail: the kernel strips failing
    // power from a classifier-grounded finding automatically.
    expect(result.verdict).toBe('pass');
    const finding = result.findings[0];
    expect(finding?.verdict).toBe('observation');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.via).toBe('classified');
    expect(finding?.denominator).toEqual({ examined: 1, matched: 1 });
    expect(finding?.citation).toEqual(UA_CITATION);
  });

  it('passes (hybrid) when the classified default language is Ukrainian', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: null,
        alternates: [UK_ALTERNATE],
        textNodes: [
          {
            nodePath: 'main > p',
            text: 'Ще не вмерла України і слава, і воля, ще нам, браття молодії, усміхнеться доля.',
            inheritedLang: null,
          },
        ],
      }),
    });
    expect(resultFor(RULE, evidenceFor(page)).verdict).toBe('pass');
  });

  it('is not-applicable when the page has no <html lang> and no text was sampled at all', () => {
    const page = ukMarketPage({
      document: makeDocument({ htmlLang: null, alternates: [UK_ALTERNATE], textNodes: [] }),
    });
    const result = resultFor(RULE, evidenceFor(page));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no <html lang> and no sampled text/);
  });

  it('is not-applicable when text was sampled but none of it is classifiable', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: null,
        alternates: [UK_ALTERNATE],
        textNodes: [
          { nodePath: 'main > p.a', text: '12345', inheritedLang: null },
          { nodePath: 'main > p.b', text: '...', inheritedLang: null },
        ],
      }),
    });
    const result = resultFor(RULE, evidenceFor(page));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no sampled text could be classified/);
  });

  it('reports the majority classified language, discounting unclassifiable text and the minority vote', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: null,
        alternates: [UK_ALTERNATE],
        textNodes: [
          { nodePath: 'main > p.junk', text: '12345', inheritedLang: null },
          { nodePath: 'main > p.ru1', text: RU_TEXT_A, inheritedLang: null },
          { nodePath: 'main > p.ru2', text: RU_TEXT_B, inheritedLang: null },
          { nodePath: 'main > p.uk1', text: UK_TEXT_A, inheritedLang: null },
        ],
      }),
    });
    const result = resultFor(RULE, evidenceFor(page));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.denominator).toEqual({ examined: 4, matched: 2 });
    expect(finding?.summary).toMatch(/classifies as ru/);
    expect(finding?.summary).toMatch(/2 of 4 sampled text nodes/);
  });

  it('builds the classifier candidate set from every declared alternate and picker language, skipping unprofiled ones', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: null,
        alternates: [
          UK_ALTERNATE,
          { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
          { hreflang: 'sv', href: 'https://example.com.ua/sv/', source: 'link' },
        ],
        picker: makePicker({
          options: [
            {
              label: 'ru',
              href: 'https://example.com.ua/ru/',
              active: false,
              nodePath: 'nav > a.ru',
            },
            {
              label: 'Deutsch',
              href: 'https://example.com.ua/de/',
              active: false,
              nodePath: 'nav > a.de',
            },
          ],
        }),
        textNodes: [{ nodePath: 'main > p', text: RU_TEXT_A, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, evidenceFor(page));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.summary).toMatch(/classifies as ru/);
  });
});

describe('ua/state-language-not-default-by-ip', () => {
  const RULE = 'ua/state-language-not-default-by-ip';
  const URL = 'https://example.com.ua/';

  function pageAt(id: string, htmlLang: string): PageEvidence {
    return makePage({ id, url: URL, document: makeDocument({ htmlLang }) });
  }

  it('fires when Ukrainian loads by default from one vantage but not another', () => {
    const ukVisit = pageAt('p-ua', 'uk');
    const otherVisit = pageAt('p-de', 'ru');
    const probes = [
      makeProbe({ id: 'probe-ua', pageId: 'p-ua', url: URL, vantage: VERIFIED_UA_VANTAGE }),
      makeProbe({ id: 'probe-de', pageId: 'p-de', url: URL, vantage: CLAIMED_DE_VANTAGE }),
    ];
    const result = resultFor(RULE, networkEvidence([ukVisit, otherVisit], probes));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.subject.url).toBe(URL);
    expect(result.findings[0]?.summary).toMatch(/claiming country UA/);
    expect(result.findings[0]?.summary).toMatch(/claiming country DE/);
    expect(result.findings[0]?.citation).toEqual(UA_CITATION);
  });

  it('passes when Ukrainian loads by default from every vantage', () => {
    const ukVisit = pageAt('p-ua', 'uk');
    const otherVisit = pageAt('p-de', 'uk');
    const probes = [
      makeProbe({ id: 'probe-ua', pageId: 'p-ua', url: URL, vantage: VERIFIED_UA_VANTAGE }),
      makeProbe({ id: 'probe-de', pageId: 'p-de', url: URL, vantage: CLAIMED_DE_VANTAGE }),
    ];
    const result = resultFor(RULE, networkEvidence([ukVisit, otherVisit], probes));
    expect(result.verdict).toBe('pass');
  });

  it('is not-applicable when no single URL was observed from more than one vantage', () => {
    const pageA = makePage({
      id: 'p-a',
      url: 'https://example.com.ua/a',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    const pageB = makePage({
      id: 'p-b',
      url: 'https://example.com.ua/b',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    const probes = [
      makeProbe({
        id: 'probe-a',
        pageId: 'p-a',
        url: pageA.url ?? '',
        vantage: VERIFIED_UA_VANTAGE,
      }),
      makeProbe({
        id: 'probe-b',
        pageId: 'p-b',
        url: pageB.url ?? '',
        vantage: CLAIMED_DE_VANTAGE,
      }),
    ];
    const result = resultFor(RULE, networkEvidence([pageA, pageB], probes));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toBe(
      'no single URL was observed from more than one vantage',
    );
  });

  it('ignores a page with no matching probe when comparing vantages, without crashing the comparison', () => {
    const ukVisit = pageAt('p-ua', 'uk');
    const otherVisit = pageAt('p-de', 'ru');
    // Has its own URL (so it survives grouping-by-URL as a singleton group)
    // but no probe references it, so it can never be attributed a vantage.
    const strayPage = makePage({
      id: 'p-stray',
      url: 'https://example.com.ua/stray',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    // Carries no URL at all, so it cannot even be grouped by URL.
    const unlocatablePage: PageEvidence = {
      id: 'p-unlocatable',
      reach: 'requested',
      rendered: false,
      document: makeDocument({ htmlLang: 'uk' }),
    };
    const probes = [
      makeProbe({ id: 'probe-ua', pageId: 'p-ua', url: URL, vantage: VERIFIED_UA_VANTAGE }),
      makeProbe({ id: 'probe-de', pageId: 'p-de', url: URL, vantage: CLAIMED_DE_VANTAGE }),
    ];
    const result = resultFor(
      RULE,
      networkEvidence([ukVisit, otherVisit, strayPage, unlocatablePage], probes),
    );
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject.url).toBe(URL);
  });

  it('labels a vantage with no claimed country generically, rather than inventing one', () => {
    const ukVisit = pageAt('p-ua', 'uk');
    const otherVisit = pageAt('p-local', 'ru');
    const probes = [
      makeProbe({ id: 'probe-ua', pageId: 'p-ua', url: URL, vantage: VERIFIED_UA_VANTAGE }),
      makeProbe({ id: 'probe-local', pageId: 'p-local', url: URL, vantage: LOCAL_VANTAGE }),
    ];
    const result = resultFor(RULE, networkEvidence([ukVisit, otherVisit], probes));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/the vantage "local"/);
    expect(result.findings[0]?.summary).toMatch(/claiming country UA/);
  });
});

describe('ua/state-language-version-lesser', () => {
  const RULE = 'ua/state-language-version-lesser';
  const shortText = 'Короткий текст.';
  const longText =
    'Це значно довший текст із набагато більшою кількістю деталей про товар, доставку, оплату ' +
    'та все інше, що тут перелічено як приклад достатньої довжини для порівняння обсягу контенту.';

  it('fires on a sitewide page-count deficit', () => {
    const pages = [
      pageIn('uk-1', '/uk/', 'uk'),
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/1 Ukrainian-language page/);
    expect(result.findings[0]?.summary).toMatch(/3 declaring ru/);
    expect(result.findings[0]?.citation).toEqual(UA_CITATION);
  });

  it('fires on a per-page content-volume deficit across an hreflang pair', () => {
    const shortText = 'Короткий текст.';
    const longText =
      'Це значно довший текст із набагато більшою кількістю деталей про товар, доставку, оплату ' +
      'та все інше, що тут перелічено як приклад достатньої довжини для порівняння обсягу контенту.';
    const uk = pageIn('uk-1', '/uk/', 'uk', {
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [{ hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' }],
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      }),
    });
    const ru = pageIn('ru-1', '/ru/', 'ru', {
      document: makeDocument({
        htmlLang: 'ru',
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([uk, ru]));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/% less/);
    expect(result.findings[0]?.citation).toEqual(UA_CITATION);
  });

  it('passes when page counts and paired volumes are comparable', () => {
    const sameLengthText = 'Текст для порівняння довжини контенту між мовними версіями сторінки.';
    const uk1 = pageIn('uk-1', '/uk/', 'uk', {
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [{ hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' }],
        textNodes: [{ nodePath: 'main > p', text: sameLengthText, inheritedLang: null }],
      }),
    });
    const ru1 = pageIn('ru-1', '/ru/', 'ru', {
      document: makeDocument({
        htmlLang: 'ru',
        textNodes: [{ nodePath: 'main > p', text: sameLengthText, inheritedLang: null }],
      }),
    });
    const uk2 = pageIn('uk-2', '/uk/about', 'uk');
    const ru2 = pageIn('ru-2', '/ru/about', 'ru');
    const result = resultFor(RULE, networkEvidence([uk1, ru1, uk2, ru2]));
    expect(result.verdict).toBe('pass');
  });

  it('does not count a page with no determinable served language toward either side of the page-count comparison', () => {
    const pages = [
      pageIn('uk-1', '/uk/', 'uk'),
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
      makePage({
        id: 'unk-1',
        url: 'https://example.com.ua/unk/',
        document: makeDocument({ htmlLang: null }),
      }),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/1 Ukrainian-language page/);
    expect(result.findings[0]?.summary).toMatch(/3 declaring ru/);
  });

  it('fires an absolute deficit when the market is determined but the site declares no Ukrainian pages at all', () => {
    const pages = [pageIn('ru-1', '/ru/', 'ru'), pageIn('ru-2', '/ru/about', 'ru')];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/0 Ukrainian-language page/);
    expect(result.findings[0]?.summary).toMatch(/2 declaring ru/);
  });

  it('does not compare a Ukrainian page against a redundant self-declaring uk alternate in its own counterpart list', () => {
    const uk = pageIn('uk-1', '/uk/', 'uk', {
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [
          { hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' },
          { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
        ],
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      }),
    });
    const ru = pageIn('ru-1', '/ru/', 'ru', {
      document: makeDocument({
        htmlLang: 'ru',
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([uk, ru]));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/% less/);
  });

  it('does not compare a Ukrainian page against an x-default routing declaration as an "x" counterpart', () => {
    const uk = makeBuildPage({
      id: 'uk-1',
      path: '/uk/index.html',
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [
          // Self-referential, and — off disk, with no .ua hostname to read —
          // the page set's only Ukrainian-market signal.
          { hreflang: 'uk-UA', href: '/uk/index.html', source: 'link' },
          // A routing declaration, not a language. It conventionally points at
          // the default-language page, which is conventionally the largest.
          { hreflang: 'x-default', href: '/index.html', source: 'link' },
        ],
      }),
    });
    const fallback = makeBuildPage({
      id: 'en-1',
      path: '/index.html',
      document: makeDocument({
        htmlLang: 'en',
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, filesystemEvidence([uk, fallback]), COMPOSED_RULESET);
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it('does not compare volume against an hreflang alternate that does not resolve to a collected page', () => {
    const uk = pageIn('uk-1', '/uk/', 'uk', {
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [
          { hreflang: 'ru', href: 'https://example.com.ua/ru-missing/', source: 'link' },
        ],
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      }),
    });
    const uk2 = pageIn('uk-2', '/uk/about', 'uk');
    expect(resultFor(RULE, networkEvidence([uk, uk2])).verdict).toBe('pass');
  });

  it('does not compare volume against a counterpart with no sampled content, avoiding a spurious full deficit', () => {
    const uk = pageIn('uk-1', '/uk/', 'uk', {
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [{ hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' }],
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      }),
    });
    const ru = pageIn('ru-1', '/ru/', 'ru'); // no textNodes at all — zero content volume
    expect(resultFor(RULE, networkEvidence([uk, ru])).verdict).toBe('pass');
  });

  it('falls back to a generic label when a page carries neither a URL nor a build path', () => {
    const ukPage: PageEvidence = {
      id: 'uk-no-locator',
      reach: 'requested',
      rendered: false,
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [
          { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
          // No .ua URL of its own, so the market signal has to come from
          // somewhere else on the page's own declarations.
          { hreflang: 'uk-UA', href: 'https://example.com.ua/uk/', source: 'link' },
        ],
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      }),
    };
    const counterpart = makeBuildPage({
      id: 'ru-path-only',
      path: 'ru/index.html',
      document: makeDocument({
        htmlLang: 'ru',
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([ukPage, counterpart]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/^the Ukrainian page carries/);
    expect(result.findings[0]?.summary).toMatch(/counterpart at ru\/index\.html/);
  });
});

describe('ua/state-language-interface-elements', () => {
  const RULE = 'ua/state-language-interface-elements';

  it('is not-applicable when the page itself does not declare Ukrainian', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: 'ru' }) });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/does not declare Ukrainian/);
  });

  it('treats a blank <html lang> the same as an absent one', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: '   ' }) });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/does not declare Ukrainian/);
  });

  it('is not-applicable when no chrome text was sampled', () => {
    const page = ukMarketPage({ document: makeDocument({ htmlLang: 'uk' }) });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no navigation, header, or footer text/);
  });

  it('fires when the footer explicitly declares a non-Ukrainian language', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: 'uk',
        textNodes: [
          {
            nodePath: 'body > footer',
            text: 'Home / About / Contact',
            inheritedLang: 'en',
            region: 'footer',
          },
        ],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.verdict).toBe('warn');
    expect(result.findings[0]?.subject.node).toBe('body > footer');
    expect(result.findings[0]?.citation).toEqual(UA_CITATION);
  });

  it('passes when chrome text is sampled but carries no non-Ukrainian declared lang', () => {
    const page = ukMarketPage({
      document: makeDocument({
        htmlLang: 'uk',
        textNodes: [
          { nodePath: 'body > nav', text: 'Головна', inheritedLang: 'uk', region: 'nav' },
          { nodePath: 'body > footer', text: 'Контакти', inheritedLang: null, region: 'footer' },
        ],
      }),
    });
    expect(resultFor(RULE, networkEvidence([page])).verdict).toBe('pass');
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
