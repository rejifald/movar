import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type {
  AlternateLink,
  DocumentEvidence,
  Evidence,
  PageEvidence,
  TextNodeSample,
} from '../evidence';
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

/**
 * The `/uk/` half of the hreflang pair `ua/state-language-version-lesser`
 * compares by content volume; the alternate is what makes `/ru/` its
 * counterpart.
 */
function ukPageWith(document: Partial<DocumentEvidence>): PageEvidence {
  return pageIn('uk-1', '/uk/', 'uk', {
    document: makeDocument({
      htmlLang: 'uk',
      alternates: [{ hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' }],
      ...document,
    }),
  });
}

/** The `/ru/` counterpart {@link ukPageWith}'s alternate resolves to. */
function ruPageWith(document: Partial<DocumentEvidence>): PageEvidence {
  return pageIn('ru-1', '/ru/', 'ru', {
    document: makeDocument({ htmlLang: 'ru', ...document }),
  });
}

/** `{ examined, sampled, cappedAt }` as a collector writes it when the cap bites. */
function capped(examined: number, sampled: number) {
  return { examined, sampled, cappedAt: sampled };
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

/**
 * Page ids of everything that does not serve Ukrainian, grouped by exactly
 * what its `<html lang>` says — an absent one is its own group. The unit the
 * merge property mutates.
 */
function nonUkrainianGroups(
  pages: readonly PageEvidence[],
): ReadonlyMap<string, readonly string[]> {
  const groups = new Map<string, string[]>();
  for (const page of pages) {
    if (page.document.htmlLang === 'uk') continue;
    const key = page.document.htmlLang ?? '(no lang)';
    const members = groups.get(key) ?? [];
    members.push(page.id);
    groups.set(key, members);
  }
  return groups;
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

/**
 * A page on `ua/state-language-not-default`'s hybrid branch: Ukrainian-market
 * URL, a declared Ukrainian version, and no `<html lang>` of its own — so the
 * rule has to classify the body text to decide what loads by default.
 *
 * `textSampling` is omitted rather than defaulted, because its absence is
 * itself a case under test: that is what a bundle stored before
 * `schemaVersion` 3 looks like.
 */
function hybridClassifiedPage(
  textNodes: readonly TextNodeSample[],
  textSampling?: DocumentEvidence['textSampling'],
): PageEvidence {
  return ukMarketPage({
    document: makeDocument({
      htmlLang: null,
      alternates: [UK_ALTERNATE],
      textNodes,
      ...(textSampling === undefined ? {} : { textSampling }),
    }),
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
    expect(finding?.summary).toMatch(/2 of 4 text nodes/);
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

  /**
   * The hybrid branch publishes a share against a named company under Law
   * 2704-VIII, so its denominator must be the population the walker examined —
   * never the sample that reached the bundle, and never the subset that
   * survived this rule's own exclusions. Both narrowings inflate the share in
   * the direction of the accusation. `textSampling.examined` is what the
   * collector saw; see `text-samples.ts` § `textNodeDenominator`.
   */
  describe('the classified denominator', () => {
    /**
     * The false-accusation direction, and the reason this is worth a test: the
     * collector caps sampling at 1500 nodes, so a 4000-node page quoted as its
     * sample reads as "2 of 2 text nodes" — a 100 % Russian page — when the
     * measurement covers 0.05 % of it.
     */
    it('counts the population the collector examined, not the truncated sample', () => {
      const page = hybridClassifiedPage(
        [
          { nodePath: 'main > p.ru1', text: RU_TEXT_A, inheritedLang: null },
          { nodePath: 'main > p.ru2', text: RU_TEXT_B, inheritedLang: null },
        ],
        capped(4000, 2),
      );
      const finding = resultFor(RULE, evidenceFor(page)).findings[0];
      expect(finding?.via).toBe('classified');
      expect(finding?.denominator).toEqual({ examined: 4000, matched: 2 });
      expect(finding?.summary).toMatch(/2 of 4000 text nodes/);
    });

    /**
     * `textSampling` arrived in `schemaVersion` 3. A bundle stored before it
     * carries no counts at all, so the denominator falls back to the sample
     * length it did quote — which is what such a bundle meant when it was
     * written. Old evidence must still replay rather than crash or read zero.
     */
    it('falls back to the sample length on a bundle stored before schemaVersion 3', () => {
      const page = hybridClassifiedPage([
        { nodePath: 'main > p.ru1', text: RU_TEXT_A, inheritedLang: null },
        { nodePath: 'main > p.ru2', text: RU_TEXT_B, inheritedLang: null },
      ]);
      expect(page.document.textSampling).toBeUndefined();
      const finding = resultFor(RULE, evidenceFor(page)).findings[0];
      expect(finding?.denominator).toEqual({ examined: 2, matched: 2 });
      expect(finding?.summary).toMatch(/2 of 2 text nodes/);
    });

    /**
     * The second narrowing: this rule drops blank nodes before classifying.
     * That is an exclusion, and the doctrine is that exclusions never shrink
     * the denominator — otherwise a page of whitespace and one Russian line
     * publishes as unanimously Russian.
     */
    it('keeps a blank text node in examined, though it is never classified', () => {
      const page = hybridClassifiedPage([
        { nodePath: 'main > p.blank', text: '   ', inheritedLang: null },
        { nodePath: 'main > p.ru1', text: RU_TEXT_A, inheritedLang: null },
      ]);
      const finding = resultFor(RULE, evidenceFor(page)).findings[0];
      expect(finding?.denominator).toEqual({ examined: 2, matched: 1 });
      expect(finding?.summary).toMatch(/1 of 2 text nodes/);
    });

    /** Both narrowings at once — the cap counts the blank node too. */
    it('counts the population when a truncated sample also holds a blank node', () => {
      const page = hybridClassifiedPage(
        [
          { nodePath: 'main > p.blank', text: '\n\t ', inheritedLang: null },
          { nodePath: 'main > p.ru1', text: RU_TEXT_A, inheritedLang: null },
        ],
        capped(9000, 2),
      );
      const finding = resultFor(RULE, evidenceFor(page)).findings[0];
      expect(finding?.denominator).toEqual({ examined: 9000, matched: 1 });
      expect(finding?.summary).toMatch(/1 of 9000 text nodes/);
    });
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
    expect(result.findings[0]?.summary).toMatch(/1 collected page\(s\) declaring Ukrainian/);
    expect(result.findings[0]?.summary).toMatch(/3 version\(s\) declaring ru/);
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
    expect(result.findings[0]?.summary).toMatch(/1 collected page\(s\) declaring Ukrainian/);
    expect(result.findings[0]?.summary).toMatch(/3 version\(s\) declaring ru/);
  });

  it('fires an absolute deficit when the market is determined but the site declares no Ukrainian pages at all', () => {
    const pages = [pageIn('ru-1', '/ru/', 'ru'), pageIn('ru-2', '/ru/about', 'ru')];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/0 collected page\(s\) declaring Ukrainian/);
    expect(result.findings[0]?.summary).toMatch(/2 version\(s\) declaring ru/);
  });

  it('does not count a root page and its language-specific twin as two versions of one language', () => {
    // The most ordinary build there is: `/` is a copy of `/en/`, and `/uk/` is
    // the one other version. Exact 1:1 parity — but `/` and `/en/` are one
    // version reached at two paths, so counting collected pages reads en 2 /
    // uk 1 and stamps Law 2704-VIII on a crawl artifact.
    const alternates: readonly AlternateLink[] = [
      { hreflang: 'en', href: '/en/index.html', source: 'link' },
      // Off disk there is no .ua hostname to read, so this doubles as the page
      // set's only Ukrainian-market signal.
      { hreflang: 'uk-UA', href: '/uk/index.html', source: 'link' },
      { hreflang: 'x-default', href: '/index.html', source: 'link' },
    ];
    const pages = [
      makeBuildPage({
        id: 'root',
        path: '/index.html',
        document: makeDocument({ htmlLang: 'en', alternates }),
      }),
      makeBuildPage({
        id: 'en-1',
        path: '/en/index.html',
        document: makeDocument({ htmlLang: 'en', alternates }),
      }),
      makeBuildPage({
        id: 'uk-1',
        path: '/uk/index.html',
        document: makeDocument({ htmlLang: 'uk', alternates }),
      }),
    ];
    const result = resultFor(RULE, filesystemEvidence(pages), COMPOSED_RULESET);
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it('counts one URL observed from two vantages as one version, not one per observation', () => {
    const pages = [
      pageIn('en-local', '/en/', 'en'),
      pageIn('en-de', '/en/', 'en'),
      pageIn('uk-local', '/uk/', 'uk'),
    ];
    const probes = [
      makeProbe({ id: 'p-en-local', pageId: 'en-local', url: 'https://example.com.ua/en/' }),
      makeProbe({
        id: 'p-en-de',
        pageId: 'en-de',
        url: 'https://example.com.ua/en/',
        vantage: CLAIMED_DE_VANTAGE,
      }),
      makeProbe({ id: 'p-uk-local', pageId: 'uk-local', url: 'https://example.com.ua/uk/' }),
    ];
    const result = resultFor(RULE, networkEvidence(pages, probes));
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it('does not count a version against Ukrainian when it declares a Ukrainian counterpart the run never collected', () => {
    // Each Russian page names its own Ukrainian counterpart; the run collected
    // neither of them. That absence is a fact about the crawl budget, and
    // fetching the href to check is exactly what this pack may not do.
    const pages = [
      pageIn('ru-1', '/ru/', 'ru', {
        document: makeDocument({
          htmlLang: 'ru',
          alternates: [{ hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' }],
        }),
      }),
      pageIn('ru-2', '/ru/about', 'ru', {
        document: makeDocument({
          htmlLang: 'ru',
          alternates: [{ hreflang: 'uk', href: 'https://example.com.ua/uk/about', source: 'link' }],
        }),
      }),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it.each([
    ['a bare fragment', '#'],
    ['an empty href', ''],
  ])(
    'does not credit Ukrainian for an alternate whose href is %s, declaring no target',
    (_, href) => {
      // `parseLocator` answers null for both — locator.ts: "`#uk` declares no
      // target". Reading that as "the counterpart exists, we just did not fetch
      // it" let markup that asserts nothing silence a statutory check.
      const pages = [
        pageIn('ru-1', '/ru/', 'ru', {
          document: makeDocument({
            htmlLang: 'ru',
            alternates: [{ hreflang: 'uk', href, source: 'link' }],
          }),
        }),
        pageIn('ru-2', '/ru/about', 'ru', {
          document: makeDocument({
            htmlLang: 'ru',
            alternates: [{ hreflang: 'uk', href, source: 'link' }],
          }),
        }),
      ];
      const result = resultFor(RULE, networkEvidence(pages));
      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/0 collected page\(s\) declaring Ukrainian/);
      expect(result.findings[0]?.summary).not.toMatch(/did not collect/);
    },
  );

  it('names a credited version as credited rather than reporting it as declaring Ukrainian', () => {
    const pages = [
      pageIn('ru-1', '/ru/', 'ru', {
        document: makeDocument({
          htmlLang: 'ru',
          alternates: [{ hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' }],
        }),
      }),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.verdict).toBe('fail');
    // Zero collected pages declare Ukrainian; exactly one version named an
    // uncollected counterpart. The summary must not merge those into "1
    // declaring Ukrainian".
    expect(result.findings[0]?.summary).toMatch(/0 collected page\(s\) declaring Ukrainian/);
    expect(result.findings[0]?.summary).toMatch(
      /1 page\(s\) naming a Ukrainian counterpart this run did not collect/,
    );
  });

  it('does not accuse a site whose Ukrainian pages declare an x-default and whose others declare nothing', () => {
    // Exact 3-versus-3 parity. `x-default` is a routing declaration; letting it
    // merge the three Ukrainian pages into one version made a routing hint
    // decide which language was deficient.
    const uk = (id: string, path: string): PageEvidence =>
      pageIn(id, path, 'uk', {
        document: makeDocument({
          htmlLang: 'uk',
          alternates: [
            { hreflang: 'x-default', href: 'https://example.com.ua/uk/', source: 'link' },
          ],
        }),
      });
    const pages = [
      uk('uk-1', '/uk/'),
      uk('uk-2', '/uk/about'),
      uk('uk-3', '/uk/contact'),
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it('does not accuse a site whose Ukrainian alternates all name the Ukrainian homepage', () => {
    // The widespread "alternates name the language homepages" pattern, at exact
    // 3-versus-3 parity. Merging the Ukrainian side collapsed three pages into
    // one version and manufactured the deficit — which is why only the
    // other-language side is ever merged.
    const uk = (id: string, path: string): PageEvidence =>
      pageIn(id, path, 'uk', {
        document: makeDocument({
          htmlLang: 'uk',
          alternates: [{ hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' }],
        }),
      });
    const pages = [
      uk('uk-1', '/uk/'),
      uk('uk-2', '/uk/about'),
      uk('uk-3', '/uk/contact'),
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it('does not accuse a site whose English pages name one another while its Ukrainian counterparts are all uncollected', () => {
    // Ukrainian is at exact parity with Russian — 3 — but every unit of it is a
    // credited claim. Counting the credit per version let the English pages'
    // own hreflang collapse 3 credits into 1 while the Russian count stood
    // still, so the site was accused because *its English pages* used the
    // "alternates name the language homepages" pattern.
    const en = ['1', '2', '3'].map((n) =>
      pageIn(`en-${n}`, `/en/${n}`, 'en', {
        document: makeDocument({
          htmlLang: 'en',
          alternates: [
            { hreflang: 'en', href: 'https://example.com.ua/en/1', source: 'link' },
            { hreflang: 'uk', href: `https://example.com.ua/uk/${n}`, source: 'link' },
          ],
        }),
      }),
    );
    const pages = [
      ...en,
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
    ];
    const result = resultFor(RULE, networkEvidence(pages));
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  // The property behind every false positive this rule has had. An hreflang
  // alternate on a page that does not serve Ukrainian is other-language
  // bookkeeping: it may shrink the other-language side, and it must never move
  // the Ukrainian side — so it can never turn a pass into a fail. Hand-built
  // sites keep finding one more corner of this; the property covers them all.
  const PARITY_SITES: Readonly<Record<string, readonly PageEvidence[]>> = {
    'parity carried by served Ukrainian pages': [
      pageIn('uk-1', '/uk/', 'uk'),
      pageIn('uk-2', '/uk/about', 'uk'),
      pageIn('uk-3', '/uk/contact', 'uk'),
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
      pageIn('ru-3', '/ru/contact', 'ru'),
    ],
    'parity carried entirely by credited counterparts': ['1', '2', '3'].flatMap((n) => [
      pageIn(`en-${n}`, `/en/${n}`, 'en', {
        document: makeDocument({
          htmlLang: 'en',
          alternates: [{ hreflang: 'uk', href: `https://example.com.ua/uk/${n}`, source: 'link' }],
        }),
      }),
      pageIn(`ru-${n}`, `/ru/${n}`, 'ru'),
    ]),
    'parity across languages that declare no alternates at all': [
      pageIn('uk-1', '/uk/', 'uk'),
      pageIn('en-1', '/en/', 'en'),
      pageIn('de-1', '/de/', 'de'),
      pageIn('fr-1', '/fr/', 'fr'),
    ],
    'parity carried by credited pages that declare no language of their own': [
      ...['1', '2'].map((n) =>
        makePage({
          id: `unk-${n}`,
          url: `https://example.com.ua/x/${n}`,
          document: makeDocument({
            htmlLang: null,
            alternates: [
              { hreflang: 'uk', href: `https://example.com.ua/uk/${n}`, source: 'link' },
            ],
          }),
        }),
      ),
      pageIn('ru-1', '/ru/', 'ru'),
      pageIn('ru-2', '/ru/about', 'ru'),
    ],
  };

  const ADDED_HREFLANGS = ['en', 'de', 'x-default', 'uk'] as const;

  // One language group at a time, never all of them at once: mutating every
  // non-Ukrainian page together collapses both sides symmetrically and hides
  // the defect. Every real false positive here came from sloppy hreflang on
  // *one* other language while the rest of the site stood still.
  const PROPERTY_CASES = Object.entries(PARITY_SITES).flatMap(([site, pages]) =>
    [...nonUkrainianGroups(pages).entries()].flatMap(([group, ids]) =>
      ADDED_HREFLANGS.map((hreflang) => [site, hreflang, group, pages, ids] as const),
    ),
  );

  it.each(PROPERTY_CASES)(
    '%s: adding hreflang="%s" to the %s pages alone keeps it passing',
    (_site, hreflang, _group, pages, ids) => {
      const anchor = pages.find((page) => ids.includes(page.id))?.url ?? '';
      const added: AlternateLink =
        hreflang === 'uk'
          ? { hreflang, href: 'https://example.com.ua/uk-never-collected/', source: 'link' }
          : { hreflang, href: anchor, source: 'link' };
      const mutated = pages.map((page) =>
        ids.includes(page.id)
          ? {
              ...page,
              document: {
                ...page.document,
                alternates: [...page.document.alternates, added],
              },
            }
          : page,
      );
      // The premise: the site passes before the alternate is added.
      expect(resultFor(RULE, networkEvidence(pages)).verdict).toBe('pass');
      // The property: hreflang on pages that do not serve Ukrainian may shrink
      // the other-language side, but can never move the Ukrainian one.
      expect(resultFor(RULE, networkEvidence(mutated)).verdict).toBe('pass');
    },
  );

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

  /**
   * The collector caps text sampling, so a sampled character sum is a floor
   * rather than a measurement of the page. Comparing two such floors is not a
   * comparison of the two pages — and this rule stamps Law 2704-VIII on what it
   * concludes. `textSampling.cappedAt` is how the evidence says the cap bit.
   */
  describe('a truncated text sample', () => {
    /**
     * The false-accusation direction: the Ukrainian page is the *bigger* one —
     * 9000 examined nodes against the counterpart's one — and only its sample
     * was truncated, so the sums say it is 92% smaller. A deficit that is an
     * artifact of the collector's ceiling must never reach a published finding.
     */
    it('does not accuse a Ukrainian page whose own sample was the one truncated', () => {
      const uk = ukPageWith({
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
        textSampling: capped(9000, 1),
      });
      const ru = ruPageWith({
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
        textSampling: { examined: 1, sampled: 1 },
      });

      const result = resultFor(RULE, networkEvidence([uk, ru]));
      expect(result.findings.filter((finding) => finding.verdict === 'fail')).toEqual([]);
      expect(result.verdict).toBe('pass');
    });

    /**
     * The under-firing direction, and the issue's own reproduction: above the
     * cap every page measures the same, so a Ukrainian version a third the size
     * of its counterpart reads as exact parity. Silence would be indistinguish-
     * able from a measured pass, so the rule says the pair was not measured.
     */
    it('does not read parity from two samples that both hit the cap', () => {
      const sample = { nodePath: 'main > p', text: longText, inheritedLang: null };
      const uk = ukPageWith({ textNodes: [sample], textSampling: capped(1500, 1) });
      const ru = ruPageWith({ textNodes: [sample], textSampling: capped(4500, 1) });

      const result = resultFor(RULE, networkEvidence([uk, ru]));
      expect(result.verdict).toBe('pass');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.verdict).toBe('info');
      expect(result.findings[0]?.summary).toMatch(/was not measured/);
      // It names which side was truncated and by how much, so the operator can
      // see why — and never asserts a deficit it did not measure.
      expect(result.findings[0]?.summary).toMatch(/1 of 1500 examined text nodes/);
      expect(result.findings[0]?.summary).toMatch(/1 of 4500 examined text nodes/);
      expect(result.findings[0]?.summary).not.toMatch(/% less/);
      expect(result.findings[0]?.citation).toEqual(UA_CITATION);
    });

    /**
     * The same refusal when the truncated side is the *counterpart*. Every
     * other case here caps the Ukrainian page, so a gate that only ever asked
     * about `ukPage` would pass all of them — and still publish a deficit
     * measured against a counterpart whose sampled sum is a floor.
     */
    it('does not accuse a Ukrainian page whose counterpart was the truncated one', () => {
      const uk = ukPageWith({
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
        textSampling: { examined: 1, sampled: 1 },
      });
      const ru = ruPageWith({
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
        textSampling: capped(4000, 1),
      });

      const result = resultFor(RULE, networkEvidence([uk, ru]));
      expect(result.findings.filter((finding) => finding.verdict === 'fail')).toEqual([]);
      expect(result.findings[0]?.verdict).toBe('info');
      expect(result.findings[0]?.summary).toMatch(/1 of 4000 examined text nodes/);
      expect(result.verdict).toBe('pass');
    });

    /** The gate keys on `cappedAt`, not on the report's presence. */
    it('still compares two pages whose samples were not truncated', () => {
      const uk = ukPageWith({
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
        textSampling: { examined: 1, sampled: 1 },
      });
      const ru = ruPageWith({
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
        textSampling: { examined: 1, sampled: 1 },
      });

      const result = resultFor(RULE, networkEvidence([uk, ru]));
      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/% less/);
    });

    /**
     * A bundle collected before `schemaVersion` 3 carries no sampling report at
     * all. It is compared exactly as it always was — treating an unknown as a
     * truncation would silence the rule on every stored bundle, including the
     * small pages the cap never touched.
     */
    it('still compares a bundle collected before the sampling report existed', () => {
      const uk = ukPageWith({
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      });
      const ru = ruPageWith({
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      });

      const result = resultFor(RULE, networkEvidence([uk, ru]));
      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/% less/);
    });
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
