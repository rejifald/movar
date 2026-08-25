import { describe, expect, it } from 'vitest';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  makePage,
  networkEvidence,
} from '../test/fixtures';
import { renderReportArtifact } from './artifact';
import type { Evidence } from './evidence';
import { EVIDENCE_SCHEMA_VERSION } from './evidence';
import type { Finding, Verdict } from './finding';
import type { EvidenceStamp, Report, RuleResult } from './report';
import { REPORT_SCHEMA_VERSION } from './report';

/**
 * Values that reach this renderer come from an audited third party — and, on
 * `--replay`, from whoever handed over the bundle. Every fixture string below
 * is therefore written the way a hostile one would be.
 */
const HOSTILE_SUMMARY = '</script><img src=x onerror=alert(1)>';
const HOSTILE_TITLE = '<html lang="ru"> declared & served as "uk"';
const HOSTILE_NODE = "body > nav > a[title='мова']";
const HOSTILE_RULE_ID = 'core/lang-mismatch" onmouseover="alert(1)';
const TARGET = 'https://example.com.ua/uk/?q=<b>&x=1';
const GENERATED_AT = '2026-08-14T12:00:00.000Z';

const NETWORK_STAMP: EvidenceStamp = {
  schemaVersion: EVIDENCE_SCHEMA_VERSION,
  sourceKind: 'network',
  collectedAt: '2026-08-13T09:00:00.000Z',
  collector: { id: 'test-collector', version: '0.0.0' },
  vantage: CLAIMED_DE_VANTAGE,
  capabilities: ['static', 'http'],
};

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: 'core/serving-mismatch',
    verdict: 'fail',
    grounding: 'declared',
    scope: 'page',
    subject: { url: TARGET, node: HOSTILE_NODE },
    evidence: [{ kind: 'page', pageId: 'page-1' }],
    summary: 'the page declares uk and serves ru',
    ...overrides,
  };
}

function makeResult(overrides: Partial<RuleResult> = {}): RuleResult {
  return {
    rule: 'core/page-lang-present',
    title: 'the page declares a language',
    grounding: 'declared',
    scope: 'page',
    capabilities: ['static'],
    verdict: 'pass',
    findings: [],
    ...overrides,
  };
}

/** The results a default document is rendered from: one of each verdict that matters. */
const PASSING = makeResult();
const FAILING = makeResult({
  rule: 'core/serving-mismatch',
  title: HOSTILE_TITLE,
  verdict: 'fail',
  findings: [makeFinding()],
});
const NOT_COLLECTED = makeResult({
  rule: 'core/matrix-honours-header',
  title: 'the response matrix honours Accept-Language',
  capabilities: ['http', 'matrix'],
  verdict: 'not-collected',
  missingCapabilities: ['matrix'],
});
const NOT_APPLICABLE = makeResult({
  rule: 'core/hreflang-return-links',
  title: 'every declared alternate links back',
  verdict: 'not-applicable',
  notApplicableReason: 'the page declares no alternates',
});

/**
 * Derive the report's rollups from its results the way `evaluate` does, so a
 * fixture can never claim a coverage summary its own rule list contradicts.
 */
function reportOf(results: readonly RuleResult[], stamp: EvidenceStamp = NETWORK_STAMP): Report {
  const findings = results.flatMap((result) => [...result.findings]);
  const count = (verdict: Verdict): number =>
    results.filter((result) => result.verdict === verdict).length;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ruleset: { id: 'core', version: '0.0.0', ruleIds: results.map((result) => result.rule) },
    evidence: stamp,
    results,
    findings,
    coverage: {
      rules: results.length,
      ran: results.length - count('not-applicable') - count('not-collected'),
      notApplicable: count('not-applicable'),
      notCollected: count('not-collected'),
      passed: count('pass'),
      failed: count('fail'),
      warned: count('warn'),
    },
    brokenPromises: findings.filter((finding) => finding.verdict === 'fail').length,
  };
}

const DEFAULT_RESULTS = [PASSING, FAILING, NOT_COLLECTED, NOT_APPLICABLE];

function render(report: Report, evidence: Evidence = networkEvidence([makePage()])): string {
  return renderReportArtifact({ report, evidence, target: TARGET, generatedAt: GENERATED_AT });
}

const DOCUMENT = render(reportOf(DEFAULT_RESULTS));

const BUNDLE_OPEN = '<script type="application/json" id="movar-audit-bundle">';

/** The embedded JSON, exactly as a replay reader would lift it back out. */
function bundleText(html: string): string {
  const start = html.indexOf(BUNDLE_OPEN) + BUNDLE_OPEN.length;
  return html.slice(start, html.indexOf('</script>', start));
}

function parseBundle(html: string): { readonly evidence: Evidence; readonly report: Report } {
  return JSON.parse(bundleText(html)) as { evidence: Evidence; report: Report };
}

/**
 * The document minus its embedded bundle — the half a browser renders as
 * markup. Every "this string must NOT appear" assertion belongs here: the
 * bundle carries the audited site's bytes verbatim by design (that is what
 * makes it replayable), and scanning it would confuse "quoted as data" with
 * "emitted as markup".
 */
function chrome(html: string): string {
  return html.slice(0, html.indexOf(BUNDLE_OPEN));
}

const CHROME = chrome(DOCUMENT);

/** One row of the per-rule table, so "distinct from a pass" can be asserted on the row. */
function ruleRow(html: string, rule: string): string {
  const start = html.indexOf(`data-rule="${rule}"`);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</tr>', start));
}

describe('renderReportArtifact', () => {
  describe('self-containment', () => {
    it('references no external stylesheet, script, font or image', () => {
      expect(CHROME).not.toMatch(/(?:href|src)\s*=\s*"[^"]*https?:/iu);
      expect(CHROME).not.toContain('<script src');
      expect(CHROME).not.toContain('@import');
      expect(CHROME).not.toMatch(/url\(\s*['"]?https?:/iu);
    });

    it('inlines the stylesheet it renders with', () => {
      expect(CHROME).toContain('<style>');
      expect(CHROME).toContain('--type-display');
    });

    it('prints the audited URL as text rather than a link', () => {
      expect(CHROME).toContain('https://example.com.ua/uk/?q=&lt;b&gt;&amp;x=1');
      expect(CHROME).not.toContain('<a ');
    });

    it('is one HTML document', () => {
      expect(DOCUMENT.startsWith('<!doctype html>')).toBe(true);
      expect(DOCUMENT.trimEnd().endsWith('</html>')).toBe(true);
    });
  });

  describe('the headline', () => {
    it('is a count of broken promises, never a score or a grade', () => {
      expect(DOCUMENT).toContain('<p class="headline__count">1</p>');
      expect(DOCUMENT).toContain('broken promise</p>');
      expect(DOCUMENT).toContain('not a score and not a grade');
    });

    it('pluralizes an empty run', () => {
      expect(render(reportOf([PASSING]))).toContain('broken promises</p>');
    });
  });

  describe('the coverage summary', () => {
    it('reports what ran and what did not', () => {
      expect(DOCUMENT).toContain('<dt>Rules in the ruleset</dt><dd>4</dd>');
      expect(DOCUMENT).toContain('<dt>Ran</dt><dd>2</dd>');
      expect(DOCUMENT).toContain('<dt>Not collected</dt><dd>1</dd>');
    });

    it('says outright that an unchecked rule is not a pass', () => {
      expect(DOCUMENT).toContain('none of them counts as a pass');
    });

    it('says so when the whole ruleset had what it needed', () => {
      expect(render(reportOf([PASSING]))).toContain('Every rule in the ruleset had the evidence');
    });
  });

  describe('findings', () => {
    it('puts failures and warnings before observations', () => {
      expect(DOCUMENT.indexOf('Failures and warnings')).toBeLessThan(
        DOCUMENT.indexOf('Observations'),
      );
    });

    it('groups an observation away from the failures', () => {
      const observed = makeFinding({
        rule: 'core/lang-part-unmarked',
        verdict: 'observation',
        grounding: 'classified',
        via: 'classified',
        downgradedFrom: 'fail',
        denominator: { examined: 340, matched: 3 },
        summary: '3 of 340 text nodes classified ru',
      });
      const html = render(
        reportOf([FAILING, makeResult({ rule: observed.rule, findings: [observed] })]),
      );
      expect(html.indexOf('the page declares uk and serves ru')).toBeLessThan(
        html.indexOf('3 of 340 text nodes classified ru'),
      );
      expect(html).toContain('3 of 340 examined');
      expect(html).toContain('it cannot fail the site');
    });

    it('cites the evidence each finding rests on', () => {
      const cited = makeFinding({
        evidence: [
          { kind: 'node', pageId: 'page-1', nodePath: 'html' },
          { kind: 'probe', probeId: 'probe-1' },
          { kind: 'redirect-chain', probeId: 'probe-1' },
          { kind: 'attachment', attachmentId: 'shot-1' },
        ],
      });
      const html = render(reportOf([makeResult({ verdict: 'fail', findings: [cited] })]));
      expect(html).toContain(
        'evidence: node page-1 html, probe probe-1, redirect chain of probe probe-1, ' +
          'attachment shot-1',
      );
    });

    it('carries a jurisdiction pack citation with its finding', () => {
      const cited = makeFinding({
        rule: 'ua/state-language-absent',
        citation: {
          source: 'Law 2704-VIII',
          article: 'Art. 27 §6',
          url: 'https://zakon.rada.gov.ua/laws/show/2704-19',
        },
      });
      const html = render(reportOf([makeResult({ verdict: 'fail', findings: [cited] })]));
      expect(html).toContain('Law 2704-VIII · Art. 27 §6 · https://zakon.rada.gov.ua');
    });

    it('says plainly when nothing was found', () => {
      const html = render(reportOf([PASSING]));
      expect(html).toContain('Nothing failed and nothing warned');
      expect(html).toContain('no observations, no notes');
    });
  });

  describe('the per-rule list', () => {
    it('lists every rule in the ruleset, including the ones that never ran', () => {
      for (const result of DEFAULT_RESULTS) {
        expect(DOCUMENT).toContain(`data-rule="${result.rule}"`);
      }
    });

    it('renders a not-collected rule distinctly from a pass', () => {
      const skipped = ruleRow(DOCUMENT, 'core/matrix-honours-header');
      const passed = ruleRow(DOCUMENT, 'core/page-lang-present');

      expect(skipped).toContain('verdict--not-collected');
      expect(skipped).toContain('>not-collected<');
      expect(skipped).toContain('not checked');
      expect(skipped).toContain('This is not a pass.');
      expect(skipped).not.toContain('>pass<');

      expect(passed).toContain('>pass<');
      expect(passed).not.toContain('not-collected');
    });

    it('names what a not-collected rule was missing', () => {
      expect(ruleRow(DOCUMENT, 'core/matrix-honours-header')).toContain(
        'this run collected no matrix',
      );
    });

    it('gives a not-applicable rule its reason', () => {
      expect(ruleRow(DOCUMENT, 'core/hreflang-return-links')).toContain(
        'the page declares no alternates',
      );
    });

    it('counts the findings a failing rule produced', () => {
      expect(ruleRow(DOCUMENT, 'core/serving-mismatch')).toContain('1 finding');
    });
  });

  describe('provenance', () => {
    it('stamps the collector, the ruleset and the collection time', () => {
      expect(DOCUMENT).toContain('<dt>Collector</dt><dd>test-collector 0.0.0</dd>');
      expect(DOCUMENT).toContain('<dt>Ruleset</dt><dd>core 0.0.0 · 4 rules</dd>');
      expect(DOCUMENT).toContain('<dt>Evidence collected</dt><dd>2026-08-13T09:00:00.000Z</dd>');
      expect(DOCUMENT).toContain('<dt>Report generated</dt><dd>2026-08-14T12:00:00.000Z</dd>');
    });

    it('presents a vantage country as a claim, never as a measurement', () => {
      expect(DOCUMENT).toContain('berlin-proxy (proxy) — DE, claimed, unverified');
    });

    it('counts what was actually collected', () => {
      expect(DOCUMENT).toContain('<dt>Collected</dt><dd>1 page · 0 probes</dd>');
    });

    it('names the build root of filesystem evidence instead of a vantage', () => {
      const stamp: EvidenceStamp = {
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        sourceKind: 'filesystem',
        collectedAt: '2026-08-13T09:00:00.000Z',
        collector: { id: 'test-collector', version: '0.0.0' },
        root: '/build/dist',
        capabilities: [],
      };
      const html = render(
        reportOf([PASSING], stamp),
        filesystemEvidence([makePage(), makePage({ id: 'page-2' })]),
      );
      expect(html).toContain('<dt>Build root</dt><dd>/build/dist</dd>');
      expect(html).toContain('<dt>Collected</dt><dd>2 pages</dd>');
      expect(html).toContain('<dt>Capabilities</dt><dd>none</dd>');
      expect(html).not.toContain('<dt>Vantage</dt>');
    });
  });

  describe('the embedded bundle', () => {
    it('round-trips through JSON.parse', () => {
      const bundle = parseBundle(DOCUMENT);
      expect(bundle.report).toEqual(reportOf(DEFAULT_RESULTS));
      expect(bundle.evidence).toEqual(networkEvidence([makePage()]));
    });

    it('keeps report and proof in the same file', () => {
      expect(DOCUMENT).toContain(BUNDLE_OPEN);
      expect(parseBundle(DOCUMENT).evidence.pages[0]?.document.htmlLang).toBe('uk');
    });
  });

  describe('escaping', () => {
    it('escapes markup a site put in a rule title', () => {
      expect(CHROME).toContain(
        '&lt;html lang=&quot;ru&quot;&gt; declared &amp; served as &quot;uk&quot;',
      );
      expect(CHROME).not.toContain('<html lang="ru"> declared');
    });

    it('escapes an apostrophe a site put in a node path', () => {
      expect(CHROME).toContain('a[title=&#39;мова&#39;]');
      expect(CHROME).not.toContain("title='мова'");
    });

    it('escapes a value that lands inside an attribute', () => {
      const html = chrome(render(reportOf([makeResult({ rule: HOSTILE_RULE_ID })])));
      expect(html).toContain('data-rule="core/lang-mismatch&quot; onmouseover=&quot;alert(1)"');
      expect(html).not.toContain('onmouseover="alert(1)"');
    });

    it('neutralises a finding summary that tries to break out of the bundle', () => {
      const html = render(
        reportOf([
          makeResult({
            verdict: 'fail',
            findings: [makeFinding({ summary: HOSTILE_SUMMARY })],
          }),
        ]),
      );

      // The readable half: escaped as text, so no element is ever created.
      expect(chrome(html)).toContain('&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;');
      expect(chrome(html)).not.toContain('<img');

      // The embedded half: `<` never survives as itself, so the block cannot
      // be closed early — and the summary still parses back byte-identically.
      expect(bundleText(html)).not.toContain('</script>');
      expect(bundleText(html)).toContain(String.raw`\u003c/script>`);
      expect(parseBundle(html).report.findings[0]?.summary).toBe(HOSTILE_SUMMARY);
    });

    it('closes exactly one script element — the bundle’s own', () => {
      const closings = DOCUMENT.split('</script>').length - 1;
      expect(closings).toBe(1);
    });
  });

  describe('the replay command', () => {
    it('carries the command that re-adjudicates this file', () => {
      expect(DOCUMENT).toContain('npx @movar/audit --replay report.html');
    });

    it('tells the reader the file and its proof cannot be separated', () => {
      expect(DOCUMENT).toContain('the file an auditor posts is the file the site owner re-runs');
    });
  });

  describe('what it claims', () => {
    it('states that it is a record, not legal proof', () => {
      expect(DOCUMENT).toContain('It is not legal proof');
      expect(DOCUMENT).toContain('chain of custody');
    });

    it('states that detection is fallible and a human must judge', () => {
      expect(DOCUMENT).toContain('Detection is not 100% accurate, and a human must judge');
    });

    it('states that unchecked rules prove nothing', () => {
      expect(DOCUMENT).toContain('It says nothing about the rules that did not run');
    });

    it('states that it holds no operator identity', () => {
      expect(DOCUMENT).toContain('no names, no accounts, no signatures');
    });
  });
});

/**
 * The paths a happy-path bundle never reaches.
 *
 * Each of these is a field the artifact renders only when the run produced it —
 * a filesystem subject, a statute citation, the capabilities a rule lacked, a
 * vantage claiming a country, stored attachments. They are exactly the fields a
 * published report leans on when it is contested, so "renders when present" is
 * worth asserting rather than assuming.
 */
describe('renderReportArtifact — fields only some runs carry', () => {
  const VERIFIED_VANTAGE = {
    id: 'kyiv-1',
    kind: 'relay' as const,
    country: { claimed: 'UA', verified: true },
  };
  const BYTES = 2048;

  function richArtifact(): string {
    const evidence = {
      schemaVersion: 1,
      source: { kind: 'network', vantage: VERIFIED_VANTAGE, probes: [], robots: 'honoured' },
      collectedAt: '2026-08-14T00:00:00.000Z',
      collector: { id: 'swift-urlsession', version: '1' },
      pages: [],
      attachments: [
        {
          id: 'body-1',
          kind: 'response-body',
          mediaType: 'text/html',
          byteLength: BYTES,
          sha256: 'abc123',
        },
      ],
    } as unknown as Evidence;

    const report = {
      schemaVersion: 1,
      ruleset: { id: 'core+ua', version: '0.0.0', ruleIds: ['ua/x', 'core/y', 'core/z'] },
      evidence: {
        schemaVersion: 1,
        sourceKind: 'network',
        collectedAt: '2026-08-14T00:00:00.000Z',
        collector: { id: 'swift-urlsession', version: '1' },
        vantage: VERIFIED_VANTAGE,
        capabilities: ['static', 'http'],
      },
      results: [
        {
          rule: 'ua/x',
          title: 'Statute rule',
          grounding: 'declared',
          scope: 'page',
          capabilities: ['static'],
          verdict: 'fail',
          findings: [],
        },
        {
          rule: 'core/y',
          title: 'Needed a capability this run lacked',
          grounding: 'observed',
          scope: 'site',
          capabilities: ['multi-vantage'],
          verdict: 'not-collected',
          findings: [],
          missingCapabilities: ['multi-vantage'],
        },
        {
          rule: 'core/z',
          title: 'Did not apply',
          grounding: 'declared',
          scope: 'page',
          capabilities: ['static'],
          verdict: 'not-applicable',
          findings: [],
          notApplicableReason: 'the page declares one language',
        },
      ],
      findings: [
        {
          rule: 'ua/x',
          verdict: 'fail',
          grounding: 'declared',
          scope: 'page',
          // Filesystem evidence: a build path and an element, no URL.
          subject: { path: '/uk/index.html', node: 'html > body > nav' },
          evidence: [{ kind: 'page', pageId: 'page-1' }],
          summary: 'A statute finding.',
          citation: { source: 'Law 2704-VIII', article: 'Art. 27 §6', url: 'https://example.gov' },
        },
      ],
      coverage: {
        rules: 3,
        ran: 1,
        notApplicable: 1,
        notCollected: 1,
        passed: 0,
        failed: 1,
        warned: 0,
      },
      brokenPromises: 1,
    } as unknown as Report;

    return renderReportArtifact({
      report,
      evidence,
      target: 'https://example.com/',
      generatedAt: '2026-08-14T00:00:00.000Z',
    });
  }

  it('names the build path and element when a finding has no URL', () => {
    const html = richArtifact();
    expect(html).toContain('/uk/index.html');
    expect(html).toContain('html &gt; body &gt; nav');
  });

  it('carries the statute a legal finding rests on', () => {
    expect(richArtifact()).toContain('Law 2704-VIII');
  });

  it('says WHICH capability a not-collected rule lacked, not just that it failed to run', () => {
    // "not checked" without the reason is unactionable: a reader cannot tell
    // whether a different run would answer it.
    expect(richArtifact()).toContain('multi-vantage');
  });

  it('gives the reason a rule did not apply', () => {
    expect(richArtifact()).toContain('the page declares one language');
  });

  it('reports a vantage country as a CLAIM, and marks it verified when it is', () => {
    // `VantageCountry.claimed` is never an observed fact; an artifact that
    // presented it as one would overstate what the run established.
    const html = richArtifact();
    expect(html).toContain('UA');
    expect(html).toContain('verified');
  });

  it('counts stored attachments', () => {
    expect(richArtifact()).toContain('attachment');
  });
});
