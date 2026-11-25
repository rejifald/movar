import { describe, expect, it } from 'vitest';
import type { AlternateLink, DocumentEvidence, PageEvidence } from '../evidence';
import { UA_CITATION } from './ua';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  networkEvidence,
} from '../../test/fixtures';
import { COMPOSED_RULESET, resultFor, pageIn, capped, shortText, longText } from './ua.test-utils';

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

describe('ua/state-language-version-lesser', () => {
  const RULE = 'ua/state-language-version-lesser';

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
