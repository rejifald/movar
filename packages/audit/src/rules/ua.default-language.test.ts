import { describe, expect, it } from 'vitest';
import type { DocumentEvidence, Evidence, PageEvidence, TextNodeSample } from '../evidence';
import { UA_CITATION } from './ua';
import {
  CLAIMED_DE_VANTAGE,
  LOCAL_VANTAGE,
  makeDocument,
  makePage,
  makePicker,
  makeProbe,
  networkEvidence,
  VERIFIED_UA_VANTAGE,
} from '../../test/fixtures';
import { resultFor, capped, ukMarketPage, UK_ALTERNATE } from './ua.test-utils';

/** One page, with a single probe attached so `http` capability is satisfied. */
function evidenceFor(page: PageEvidence): Evidence {
  return networkEvidence([page], [makeProbe({ pageId: page.id, url: page.url ?? '' })]);
}

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

  /**
   * "Unclassifiable" is the catalogue's answer, not this rule's. The hybrid
   * branch used to run its own vote over raw `sample.text`, outside every gate
   * `text-samples.ts` publishes, so text the shared module excludes still
   * carried a Law 2704-VIII citation against a named company (#435). Both cases
   * below classify perfectly well when asked — that is the whole point: the
   * real classifier answers `ru` on either string, so before the fix each one
   * published a `fail` here. This pack's standing bias is that a missed
   * violation is recoverable and a statute-citing accusation is not.
   */
  describe('the shared text-sample gates', () => {
    it('never classifies a `<code>` block, however much prose it holds', () => {
      const page = ukMarketPage({
        document: makeDocument({
          htmlLang: null,
          alternates: [UK_ALTERNATE],
          textNodes: [
            { nodePath: 'main > pre > code', text: RU_TEXT_A, inheritedLang: null },
            { nodePath: 'main > pre > code :: text(2)', text: RU_TEXT_B, inheritedLang: null },
          ],
        }),
      });
      const result = resultFor(RULE, evidenceFor(page));
      expect(result.verdict).toBe('not-applicable');
      expect(result.notApplicableReason).toMatch(/no sampled text could be classified/);
    });

    /**
     * A brand and product line, title-cased: the shape a classifier has least
     * to work with, because a run with no lowercase function words in it is
     * carrying almost no signal. The `ru` alternate is load-bearing — it is
     * what narrows {@link candidateLanguages} to a `uk`/`ru` pair, and against
     * a pair the classifier commits to `ru` on this string where against the
     * full roster it abstains. Without it the case would assert the exclusion
     * and actually be exercising the candidate set.
     */
    it('never classifies a run of proper nouns', () => {
      const page = ukMarketPage({
        document: makeDocument({
          htmlLang: null,
          alternates: [
            UK_ALTERNATE,
            { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
          ],
          textNodes: [
            {
              nodePath: 'main > h1',
              text: 'Московский Инструментальный Завод Ударные Дрели Российское Качество',
              inheritedLang: null,
            },
          ],
        }),
      });
      const result = resultFor(RULE, evidenceFor(page));
      expect(result.verdict).toBe('not-applicable');
      expect(result.notApplicableReason).toMatch(/no sampled text could be classified/);
    });
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
