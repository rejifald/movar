import { describe, expect, it } from 'vitest';
import type { Capability } from './capability';
import { evaluate } from './evaluate';
import type { Evidence } from './evidence';
import { RuleContractError } from './grading';
import type { RuleResult } from './report';
import type { CoreRule, Rule } from './rule';
import { findings, notApplicable, pass } from './rule';
import { createRuleset } from './ruleset';
import type { Ruleset } from './ruleset';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../test/fixtures';

function rulesetOf(...rules: Rule[]): Ruleset {
  return createRuleset({
    id: 'test/ruleset',
    version: '9.9.9',
    families: [{ id: 'T. Test', title: 'synthetic rules', rules }],
  });
}

function only(evidence: Evidence, rule: Rule): RuleResult {
  const [result] = evaluate(evidence, rulesetOf(rule)).results;
  if (result === undefined) throw new Error('the ruleset produced no result');
  return result;
}

const ALWAYS_PASSES: CoreRule<'page'> = {
  id: 'core/always-passes',
  title: 'a rule that always passes',
  capabilities: ['static'],
  grounding: 'declared',
  scope: 'page',
  run: () => pass(),
};

function needing(capabilities: readonly Capability[]): CoreRule<'page'> {
  return { ...ALWAYS_PASSES, id: 'core/needs-something', capabilities };
}

describe('capability gating', () => {
  it('answers not-collected — never pass — when a capability is absent', () => {
    const result = only(networkEvidence([makePage()]), needing(['matrix']));
    expect(result.verdict).toBe('not-collected');
    expect(result.missingCapabilities).toEqual(['matrix']);
    expect(result.findings).toEqual([]);
  });

  it('runs the rule when every declared capability is present', () => {
    const evidence = networkEvidence(
      [makePage()],
      [makeProbe(), makeProbe({ id: 'probe-2', acceptLanguage: 'ru' })],
    );
    expect(only(evidence, needing(['matrix'])).verdict).toBe('pass');
  });

  it('implies static for a page-scoped rule, so an empty bundle cannot pass', () => {
    const result = only(networkEvidence([]), { ...ALWAYS_PASSES, capabilities: [] });
    expect(result.verdict).toBe('not-collected');
    expect(result.missingCapabilities).toEqual(['static']);
    expect(result.capabilities).toEqual(['static']);
  });

  describe('filesystem evidence', () => {
    const evidence = filesystemEvidence([makePage(), makePage({ id: 'page-2' })]);

    it.each(['http', 'matrix', 'multi-vantage'] as const)(
      'excludes a %s rule structurally, with no rule checking for it',
      (capability) => {
        const result = only(evidence, needing([capability]));
        expect(result.verdict).toBe('not-collected');
        expect(result.missingCapabilities).toEqual([capability]);
      },
    );

    it('still runs the offline families', () => {
      expect(only(evidence, needing(['static', 'site', 'traversal'])).verdict).toBe('pass');
    });
  });

  it('treats a fully blocked run as not-collected', () => {
    const evidence = networkEvidence([makePage()], [makeProbe({ outcome: 'blocked' })]);
    expect(only(evidence, needing(['http'])).verdict).toBe('not-collected');
  });
});

describe('page iteration', () => {
  const pages = [makePage(), makePage({ id: 'page-2', url: 'https://example.com.ua/uk/about' })];

  const failsOnAbout: CoreRule<'page'> = {
    ...ALWAYS_PASSES,
    id: 'core/fails-on-about',
    run: (ctx) =>
      ctx.page.id === 'page-2'
        ? findings({
            grounding: 'declared',
            verdict: 'fail',
            subject: { url: ctx.page.url ?? '' },
            evidence: [{ kind: 'page', pageId: ctx.page.id }],
            summary: 'the about page is broken',
          })
        : pass(),
  };

  it('calls a page rule once per page and merges the outcomes', () => {
    const result = only(networkEvidence(pages), failsOnAbout);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('reports not-applicable only when no page had anything to adjudicate', () => {
    const skipper: CoreRule<'page'> = {
      ...ALWAYS_PASSES,
      id: 'core/skips',
      run: () => notApplicable('nothing to adjudicate here'),
    };
    const result = only(networkEvidence(pages), skipper);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toBe('nothing to adjudicate here');
  });

  it('calls a site rule once, with the whole page set and a null page', () => {
    let calls = 0;
    let observedPage: unknown = 'never ran';
    let observedPages = 0;
    const siteRule: CoreRule<'site'> = {
      id: 'core/site-rule',
      title: 'a site-scoped rule',
      capabilities: ['site'],
      grounding: 'declared',
      scope: 'site',
      run: (ctx) => {
        calls += 1;
        observedPage = ctx.page;
        observedPages = ctx.pages.length;
        return pass();
      },
    };
    expect(only(networkEvidence(pages), siteRule).verdict).toBe('pass');
    expect(calls).toBe(1);
    expect(observedPage).toBeNull();
    expect(observedPages).toBe(pages.length);
  });
});

/**
 * The `not-collected` invariant held at rule granularity and was inverted at
 * page granularity: one passing page made the whole rule `pass`, and nothing in
 * the report could say the other pages were never judged.
 */
describe('per-page adjudication', () => {
  const threePages = [
    makeBuildPage({ id: 'page-1', path: 'uk/index.html' }),
    makeBuildPage({ id: 'page-2', path: 'uk/about.html' }),
    makeBuildPage({ id: 'page-3', path: 'uk/contact.html' }),
  ];

  /** Judges one page of three; the other two carry no subject at all. */
  const oneOfThree: CoreRule<'page'> = {
    ...ALWAYS_PASSES,
    id: 'core/one-of-three',
    run: (ctx) =>
      ctx.page.id === 'page-1' ? pass() : notApplicable(`no subject on ${ctx.page.id}`),
  };

  const skipsEveryPage: CoreRule<'page'> = {
    ...ALWAYS_PASSES,
    id: 'core/skips-every-page',
    run: (ctx) => notApplicable(`no subject on ${ctx.page.id}`),
  };

  it('counts the pages a passing rule actually judged, so 1 of 3 says so', () => {
    const result = only(filesystemEvidence(threePages), oneOfThree);
    expect(result.verdict).toBe('pass');
    expect(result.pagesAdjudicated).toBe(1);
    expect(result.pagesNotApplicable).toBe(2);
  });

  it('counts a page that produced findings as adjudicated', () => {
    const failsOnPageTwo: CoreRule<'page'> = {
      ...ALWAYS_PASSES,
      id: 'core/fails-on-page-two',
      run: (ctx) =>
        ctx.page.id === 'page-2'
          ? findings({
              grounding: 'declared',
              verdict: 'fail',
              subject: { path: ctx.page.path ?? '' },
              evidence: [{ kind: 'page', pageId: ctx.page.id }],
              summary: 'the about page is broken',
            })
          : notApplicable(`no subject on ${ctx.page.id}`),
    };
    const result = only(filesystemEvidence(threePages), failsOnPageTwo);
    expect(result.verdict).toBe('fail');
    expect(result.pagesAdjudicated).toBe(1);
    expect(result.pagesNotApplicable).toBe(2);
  });

  it('rolls per-page adjudication up into the coverage summary', () => {
    const report = evaluate(filesystemEvidence(threePages), rulesetOf(oneOfThree, skipsEveryPage));
    expect(report.coverage.rulePagesAdjudicated).toBe(1);
    expect(report.coverage.rulePagesNotApplicable).toBe(5);
  });

  it("keeps every distinct not-applicable reason, not only the first page's", () => {
    const result = only(filesystemEvidence(threePages), skipsEveryPage);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReasons).toEqual([
      'no subject on page-1',
      'no subject on page-2',
      'no subject on page-3',
    ]);
    expect(result.notApplicableReason).toBe('no subject on page-1');
    expect(result.pagesAdjudicated).toBe(0);
    expect(result.pagesNotApplicable).toBe(3);
  });

  it('collapses a reason every page gave alike into one', () => {
    const sameReason: CoreRule<'page'> = {
      ...ALWAYS_PASSES,
      id: 'core/same-reason',
      run: () => notApplicable('nothing to adjudicate here'),
    };
    const result = only(filesystemEvidence(threePages), sameReason);
    expect(result.notApplicableReasons).toEqual(['nothing to adjudicate here']);
    expect(result.pagesNotApplicable).toBe(3);
  });

  it('omits the per-page counts for a site rule, which iterates no pages', () => {
    const siteRule: CoreRule<'site'> = {
      id: 'core/site-rule',
      title: 'a site-scoped rule',
      capabilities: ['site'],
      grounding: 'declared',
      scope: 'site',
      run: () => pass(),
    };
    const result = only(filesystemEvidence(threePages), siteRule);
    expect(result.verdict).toBe('pass');
    expect(result.pagesAdjudicated).toBeUndefined();
    expect(result.pagesNotApplicable).toBeUndefined();
  });

  it('omits the per-page counts for a rule that never ran', () => {
    const result = only(filesystemEvidence(threePages), needing(['matrix']));
    expect(result.verdict).toBe('not-collected');
    expect(result.pagesAdjudicated).toBeUndefined();
    expect(result.pagesNotApplicable).toBeUndefined();
  });
});

describe('grading inside evaluate', () => {
  const hybrid: CoreRule<'page'> = {
    ...ALWAYS_PASSES,
    id: 'core/hybrid-rule',
    hybrid: true,
    run: (ctx) =>
      findings({
        grounding: 'declared',
        verdict: 'fail',
        via: 'classified',
        denominator: { examined: 812, matched: 47 },
        subject: { url: ctx.page.url ?? '' },
        evidence: [],
        summary: '47 of 812 text nodes classified ru',
      }),
  };

  it('downgrades a classifier-grounded accusation to an observation', () => {
    const report = evaluate(networkEvidence([makePage()]), rulesetOf(hybrid));
    expect(report.results[0]?.verdict).toBe('pass');
    expect(report.findings[0]?.verdict).toBe('observation');
    expect(report.findings[0]?.downgradedFrom).toBe('fail');
    expect(report.brokenPromises).toBe(0);
  });

  it('throws rather than shipping a report a rule mis-graded', () => {
    const uncounted: CoreRule<'page'> = {
      ...hybrid,
      id: 'core/uncounted',
      run: (ctx) =>
        findings({
          grounding: 'declared',
          verdict: 'warn',
          via: 'classified',
          subject: { url: ctx.page.url ?? '' },
          evidence: [],
          summary: 'some text nodes classified ru',
        }),
    };
    expect(() => evaluate(networkEvidence([makePage()]), rulesetOf(uncounted))).toThrow(
      RuleContractError,
    );
  });
});

describe('the classifier seam', () => {
  it('hands rules a classifier that runs inside evaluate', () => {
    const classifying: CoreRule<'page'> = {
      ...ALWAYS_PASSES,
      id: 'core/classifying',
      grounding: 'classified',
      run: (ctx) => {
        const sample = ctx.page.document.textNodes[0];
        if (sample === undefined) return notApplicable('no text nodes were sampled');
        const verdict = ctx.classify(sample.text, ['uk', 'ru']);
        if (verdict === null) return notApplicable('the classifier abstained');
        return findings({
          grounding: 'classified',
          verdict: 'observation',
          denominator: { examined: ctx.page.document.textNodes.length, matched: 1 },
          subject: { node: sample.nodePath },
          evidence: [{ kind: 'node', pageId: ctx.page.id, nodePath: sample.nodePath }],
          summary: `1 of 1 text nodes classified ${verdict.language}`,
        });
      },
    };
    const page = makePage({
      document: makeDocument({
        textNodes: [
          {
            nodePath: 'main > p',
            text: 'Ще не вмерла України і слава, і воля, ще нам, браття молодії, усміхнеться доля.',
            inheritedLang: null,
          },
        ],
      }),
    });
    const report = evaluate(networkEvidence([page]), rulesetOf(classifying));
    expect(report.findings[0]?.summary).toBe('1 of 1 text nodes classified uk');
    expect(report.findings[0]?.verdict).toBe('observation');
  });
});

describe('the report', () => {
  const evidence = networkEvidence(
    [makePage()],
    [makeProbe(), makeProbe({ id: 'probe-2', vantage: CLAIMED_DE_VANTAGE })],
  );

  it('stamps the ruleset it was adjudicated against', () => {
    const report = evaluate(evidence, rulesetOf(ALWAYS_PASSES, needing(['matrix'])));
    expect(report.ruleset).toEqual({
      id: 'test/ruleset',
      version: '9.9.9',
      ruleIds: ['core/always-passes', 'core/needs-something'],
    });
  });

  it('stamps the evidence, including the vantage the run was launched from', () => {
    const report = evaluate(evidence, rulesetOf(ALWAYS_PASSES));
    expect(report.evidence.sourceKind).toBe('network');
    expect(report.evidence.vantage?.id).toBe('local');
    expect(report.evidence.root).toBeUndefined();
    expect(report.evidence.collector.id).toBe('test-collector');
  });

  it('stamps the build root for filesystem evidence', () => {
    const report = evaluate(filesystemEvidence([makePage()]), rulesetOf(ALWAYS_PASSES));
    expect(report.evidence.root).toBe('/build/dist');
    expect(report.evidence.vantage).toBeUndefined();
  });

  it('summarises coverage without rolling not-collected into a pass', () => {
    const skipper: CoreRule<'page'> = {
      ...ALWAYS_PASSES,
      id: 'core/skips',
      run: () => notApplicable('nothing here'),
    };
    const report = evaluate(
      filesystemEvidence([makePage()]),
      rulesetOf(ALWAYS_PASSES, needing(['matrix']), skipper),
    );
    expect(report.coverage).toEqual({
      rules: 3,
      ran: 1,
      notApplicable: 1,
      notCollected: 1,
      passed: 1,
      failed: 0,
      warned: 0,
      rulePagesAdjudicated: 1,
      rulePagesNotApplicable: 1,
    });
  });
});
