import { describe, expect, it } from 'vitest';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../test/fixtures';
import { evaluate } from './evaluate';
import type { Report } from './report';
import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from './ruleset';
import { applySuppressions, MIN_REASON_LENGTH, parseSuppressionPolicy } from './suppress';
import type { Suppression, SuppressionPolicy } from './suppress';

const REASON = 'A justification long enough that a reviewer learns something from it.';

/**
 * A build with two real defects and one deliberate shape:
 *
 * - `/index.html` declares a `uk` alternate at a page the build does not
 *   contain → `core/hreflang-target-unresolvable` (page scope).
 * - `/blog/index.html` declares nothing while the others declare `en` →
 *   `core/inventory-varies-across-pages` (site scope).
 */
function brokenSite(): Report {
  const alternates = [
    { hreflang: 'en', href: 'https://example.com/', source: 'link' as const },
    { hreflang: 'uk', href: 'https://example.com/uk/', source: 'link' as const },
  ];
  return evaluate(
    filesystemEvidence([
      makeBuildPage({
        id: 'page-1',
        path: '/index.html',
        document: makeDocument({ htmlLang: 'en', alternates }),
      }),
      makeBuildPage({
        id: 'page-2',
        path: '/about/index.html',
        document: makeDocument({ htmlLang: 'en', alternates }),
      }),
      makeBuildPage({
        id: 'page-3',
        path: '/blog/index.html',
        document: makeDocument({ htmlLang: 'en' }),
      }),
    ]),
    CORE_RULESET,
  );
}

const SITE_RULE = 'core/inventory-varies-across-pages';
const PAGE_RULE = 'core/hreflang-target-unresolvable';

/** Family C: `scope: 'site'` on the rule, `scope: 'page'` on every finding it emits. */
const MATRIX_RULE = 'core/serving-header-ignored';
const BROKEN_URL = 'https://example.com.ua/uk/';
const ALSO_BROKEN_URL = 'https://example.com.ua/ru/';
const FIXED_URL = 'https://example.com.ua/en/';

/** The site declares both URLs, so the inventory the matrix reads against has two languages. */
const MATRIX_ALTERNATES = [
  { hreflang: 'uk', href: BROKEN_URL, source: 'link' as const },
  { hreflang: 'ru', href: ALSO_BROKEN_URL, source: 'link' as const },
];

function matrixResponse(id: string, url: string) {
  return makePage({
    id,
    url,
    document: makeDocument({ htmlLang: 'uk', alternates: MATRIX_ALTERNATES }),
  });
}

function matrixProbe(id: string, url: string, acceptLanguage: string, bodyHash: string) {
  return makeProbe({ id, pageId: `page-${id}`, url, acceptLanguage, bodyHash });
}

/**
 * Two URLs, each fetched under `uk` and `ru` and each answering with one
 * byte-identical body — the shape `core/serving-header-ignored` convicts on,
 * twice. The rule is adjudicated once for the whole run, so its scope is
 * `site`; each of its findings names a single URL, so each finding's scope is
 * `page`. That gap is the whole point of these tests.
 */
function ignoresTheHeader(): Report {
  return evaluate(
    networkEvidence(
      [
        matrixResponse('page-a-uk', BROKEN_URL),
        matrixResponse('page-a-ru', BROKEN_URL),
        matrixResponse('page-b-uk', ALSO_BROKEN_URL),
        matrixResponse('page-b-ru', ALSO_BROKEN_URL),
      ],
      [
        matrixProbe('a-uk', BROKEN_URL, 'uk', 'body-a'),
        matrixProbe('a-ru', BROKEN_URL, 'ru', 'body-a'),
        matrixProbe('b-uk', ALSO_BROKEN_URL, 'uk', 'body-b'),
        matrixProbe('b-ru', ALSO_BROKEN_URL, 'ru', 'body-b'),
      ],
    ),
    CORE_RULESET,
  );
}

function policy(...suppressions: readonly Suppression[]): SuppressionPolicy {
  return { budget: suppressions.length, suppressions };
}

describe('applySuppressions', () => {
  it('leaves the report alone and answers which findings a policy silences', () => {
    const report = brokenSite();
    const before = JSON.stringify(report);
    const outcome = applySuppressions(report, policy({ rule: SITE_RULE, reason: REASON }));

    expect(outcome.suppressed).toHaveLength(1);
    expect(outcome.suppressed[0]?.finding.rule).toBe(SITE_RULE);
    expect(outcome.remaining.every((finding) => finding.rule !== SITE_RULE)).toBe(true);
    // The instrument's output is what replays years from now; policy is a
    // reading of it, never an edit to it.
    expect(JSON.stringify(report)).toBe(before);
    expect(report.brokenPromises).toBeGreaterThan(0);
  });

  it('silences a page rule only on the page named', () => {
    const report = brokenSite();
    const failing = report.findings.filter((finding) => finding.rule === PAGE_RULE);
    expect(failing.length).toBeGreaterThan(1);

    const outcome = applySuppressions(
      report,
      policy({ rule: PAGE_RULE, subject: '/index.html', reason: REASON }),
    );
    expect(outcome.suppressed).toHaveLength(1);
    expect(outcome.remaining.some((finding) => finding.rule === PAGE_RULE)).toBe(true);
  });

  it('rejects a page rule silenced site-wide — that is the blanket ignore', () => {
    const outcome = applySuppressions(brokenSite(), policy({ rule: PAGE_RULE, reason: REASON }));
    expect(outcome.suppressed).toHaveLength(0);
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain('subject');
  });

  it('rejects a subject on a site rule — its findings are not about one page', () => {
    const outcome = applySuppressions(
      brokenSite(),
      policy({ rule: SITE_RULE, subject: '/index.html', reason: REASON }),
    );
    expect(outcome.suppressed).toHaveLength(0);
    expect(outcome.violations).not.toHaveLength(0);
  });

  it('reads the scope off the finding, not off the rule that emitted it', () => {
    const report = ignoresTheHeader();
    const result = report.results.find((entry) => entry.rule === MATRIX_RULE);
    // The premise every test below rests on: the two disagree on purpose.
    expect(result?.scope).toBe('site');
    const failing = report.findings.filter(
      (finding) => finding.rule === MATRIX_RULE && finding.verdict === 'fail',
    );
    expect(failing.map((finding) => finding.scope)).toEqual(['page', 'page']);
    expect(failing.map((finding) => finding.subject.url)).toEqual([BROKEN_URL, ALSO_BROKEN_URL]);
  });

  it('silences a site-scoped rule on the one URL its finding names', () => {
    const outcome = applySuppressions(
      ignoresTheHeader(),
      policy({ rule: MATRIX_RULE, subject: BROKEN_URL, reason: REASON }),
    );

    expect(outcome.violations).toHaveLength(0);
    expect(outcome.suppressed).toHaveLength(1);
    expect(outcome.suppressed[0]?.finding.subject.url).toBe(BROKEN_URL);
    // The other URL still fails: one misbehaving page never costs a team the
    // rule across the whole site.
    expect(
      outcome.remaining.some(
        (finding) => finding.rule === MATRIX_RULE && finding.subject.url === ALSO_BROKEN_URL,
      ),
    ).toBe(true);
  });

  it('rejects the site-wide entry a rule with page-scoped findings once demanded', () => {
    const outcome = applySuppressions(
      ignoresTheHeader(),
      policy({ rule: MATRIX_RULE, reason: REASON }),
    );
    expect(outcome.suppressed).toHaveLength(0);
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain('blanket');
  });

  it('still reports a subject-matched entry as stale when it silences nothing', () => {
    const outcome = applySuppressions(
      ignoresTheHeader(),
      policy({ rule: MATRIX_RULE, subject: FIXED_URL, reason: REASON }),
    );
    // Doctrine 5 outlives doctrine 2's repair: a URL that stopped failing is a
    // line to delete, not a silently-kept entry.
    expect(outcome.violations).toHaveLength(0);
    expect(outcome.suppressed).toHaveLength(0);
    expect(outcome.stale).toHaveLength(1);
  });

  it('refuses to suppress a jurisdiction-pack rule', () => {
    const report = evaluate(
      filesystemEvidence([makeBuildPage({ path: '/index.html' })]),
      withPack(CORE_RULESET, ...UA_PACK_FAMILIES),
    );
    const outcome = applySuppressions(
      report,
      policy({ rule: 'ua/state-language-absent', reason: REASON }),
    );
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain('statute');
  });

  it('refuses to suppress a classified rule, which can never fail anyway', () => {
    const outcome = applySuppressions(
      brokenSite(),
      policy({ rule: 'core/content-language-mixed', reason: REASON }),
    );
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain(
      'classified',
    );
  });

  it('flags a suppression pointing at a rule the ruleset does not have', () => {
    const outcome = applySuppressions(
      brokenSite(),
      policy({ rule: 'core/renamed-away', reason: REASON }),
    );
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain('no rule');
  });

  it('demands a real justification', () => {
    const outcome = applySuppressions(brokenSite(), policy({ rule: SITE_RULE, reason: 'later' }));
    expect(outcome.suppressed).toHaveLength(0);
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain(
      String(MIN_REASON_LENGTH),
    );
  });

  it('rejects a pattern instead of an exact rule ID', () => {
    const outcome = applySuppressions(brokenSite(), policy({ rule: 'core/*', reason: REASON }));
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain('pattern');
  });

  it('flags a duplicate entry', () => {
    const entry = { rule: SITE_RULE, reason: REASON };
    const outcome = applySuppressions(brokenSite(), policy(entry, { ...entry }));
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain(
      'duplicate',
    );
  });

  it('enforces the budget against declared entries, not surviving ones', () => {
    // Both entries are broken, so neither silences anything — the cap must
    // still catch the file, or stuffing it with junk buys unlimited headroom.
    const outcome = applySuppressions(brokenSite(), {
      budget: 1,
      suppressions: [
        { rule: 'core/renamed-away', reason: REASON },
        { rule: 'core/also-gone', reason: REASON },
      ],
    });
    expect(outcome.violations.map((violation) => violation.problem).join(' ')).toContain('budget');
  });

  it('reports a valid entry that silenced nothing as stale', () => {
    const outcome = applySuppressions(
      brokenSite(),
      policy({ rule: 'core/hreflang-duplicate', subject: '/index.html', reason: REASON }),
    );
    expect(outcome.stale).toHaveLength(1);
    expect(outcome.violations).toHaveLength(0);
  });

  it('reports nothing stale when every entry earned its place', () => {
    const outcome = applySuppressions(brokenSite(), policy({ rule: SITE_RULE, reason: REASON }));
    expect(outcome.stale).toHaveLength(0);
  });
});

describe('parseSuppressionPolicy', () => {
  it('accepts a well-formed file', () => {
    const parsed = parseSuppressionPolicy({
      budget: 2,
      suppressions: [{ rule: SITE_RULE, reason: REASON }],
    });
    expect(parsed).not.toBeInstanceOf(Error);
    expect((parsed as SuppressionPolicy).suppressions[0]?.rule).toBe(SITE_RULE);
  });

  it('omits an absent subject rather than setting it undefined', () => {
    const parsed = parseSuppressionPolicy({
      budget: 1,
      suppressions: [{ rule: SITE_RULE, reason: REASON }],
    }) as SuppressionPolicy;
    expect('subject' in (parsed.suppressions[0] ?? {})).toBe(false);
  });

  it.each([
    ['not an object', 42],
    ['a missing budget', { suppressions: [] }],
    ['a negative budget', { budget: -1, suppressions: [] }],
    ['a fractional budget', { budget: 1.5, suppressions: [] }],
    ['suppressions that are not an array', { budget: 0, suppressions: {} }],
    ['an entry that is not an object', { budget: 1, suppressions: ['core/x'] }],
    ['an entry with no rule', { budget: 1, suppressions: [{ reason: REASON }] }],
    ['an entry with no reason', { budget: 1, suppressions: [{ rule: SITE_RULE }] }],
    [
      'a non-string subject',
      { budget: 1, suppressions: [{ rule: SITE_RULE, reason: REASON, subject: 7 }] },
    ],
  ])('rejects %s', (_label, value) => {
    expect(parseSuppressionPolicy(value)).toBeInstanceOf(Error);
  });
});
