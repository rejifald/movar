import { describe, expect, it } from 'vitest';
import type { AlternateLink } from '../evidence';
import { UA_CITATION } from './ua';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';
import { COMPOSED_RULESET, resultFor, pageIn, shortText, longText } from './ua.test-utils';

describe('ua/state-language-version-lesser', () => {
  const RULE = 'ua/state-language-version-lesser';

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

  it('joins a build’s duplicated version through a document-relative alternate', () => {
    // The case above, written the way a build that nests its pages writes it:
    // `/docs/` is a copy of `/ru/docs/`, and the alternate saying so is
    // relative to the file declaring it. A build page carries a `path` and no
    // `url`, so the base was `undefined` and `../ru/docs/` became the literal
    // `/../ru/docs`, resolving to nothing: the two Russian paths stayed two
    // versions, and a build at exact 1:1 parity was published as ru 2 / uk 1
    // with Law 2704-VIII cited on it.
    const pages = [
      makeBuildPage({
        id: 'root-docs',
        path: '/docs/index.html',
        document: makeDocument({
          htmlLang: 'ru',
          alternates: [{ hreflang: 'ru', href: '../ru/docs/', source: 'link' }],
        }),
      }),
      makeBuildPage({
        id: 'ru-docs',
        path: '/ru/docs/index.html',
        document: makeDocument({ htmlLang: 'ru' }),
      }),
      makeBuildPage({
        id: 'uk-docs',
        path: '/uk/docs/index.html',
        // Off disk there is no .ua hostname to read, so the self-reference
        // doubles as the page set's only Ukrainian-market signal.
        document: makeDocument({
          htmlLang: 'uk',
          alternates: [{ hreflang: 'uk-UA', href: './', source: 'link' }],
        }),
      }),
    ];
    const result = resultFor(RULE, filesystemEvidence(pages), COMPOSED_RULESET);
    expect(result.findings.map((finding) => finding.summary)).toEqual([]);
    expect(result.verdict).toBe('pass');
  });

  it('compares paired volume across a document-relative alternate on a build', () => {
    // The other direction, and the one silence costs the statute: the pair
    // never resolved off disk, so a Ukrainian page a fraction of its Russian
    // counterpart's size was never measured against it at all.
    const uk = makeBuildPage({
      id: 'uk-guide',
      path: '/uk/guide/index.html',
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [
          { hreflang: 'ru', href: '../../ru/guide/', source: 'link' },
          { hreflang: 'uk-UA', href: './', source: 'link' },
        ],
        textNodes: [{ nodePath: 'main > p', text: shortText, inheritedLang: null }],
      }),
    });
    const ru = makeBuildPage({
      id: 'ru-guide',
      path: '/ru/guide/index.html',
      document: makeDocument({
        htmlLang: 'ru',
        textNodes: [{ nodePath: 'main > p', text: longText, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, filesystemEvidence([uk, ru]), COMPOSED_RULESET);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/% less/);
    expect(result.findings[0]?.citation).toEqual(UA_CITATION);
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
});
