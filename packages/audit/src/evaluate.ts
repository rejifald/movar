/**
 * The kernel: `evaluate(evidence, ruleset) → Report`.
 *
 * **Pure. Zero I/O. Zero DOM.** Collection is deliberately not shared — every
 * runtime writes its own collector and they only agree on `Evidence` — which is
 * what makes the same judgement run in CI and on a phone, makes a finding
 * replayable years later from a stored bundle, and makes the report falsifiable
 * by the site owner it accuses.
 *
 * Three things the kernel does so no rule has to:
 *
 * - **Capability gating.** A rule's declared capabilities are checked against
 *   the set derived from the evidence's shape. Missing → `not-collected`,
 *   which is never `pass`. A rule that runs is already known to have its input.
 * - **Page iteration.** A `page`-scoped rule is called once per page with a
 *   non-nullable `ctx.page`, and the per-page outcomes are merged. Page scope
 *   therefore implies the `static` capability, whether or not the rule lists it.
 *   The merge also *counts* what it merged, as `pagesAdjudicated` /
 *   `pagesNotApplicable`, so the same refusal to pass what it did not check
 *   holds one level down: a rule that judged one page of three still verdicts
 *   `pass`, but the report can no longer be read as saying it looked at the site.
 * - **Grading.** Every draft passes through `gradeFinding`, which strips
 *   failing power from classifier-grounded findings and rejects an uncited
 *   pack finding or a classified finding with no denominator.
 */

import type { Capability } from './capability';
import { adjudicableProbes, deriveCapabilities, missingCapabilities } from './capability';
import type { Evidence, PageEvidence } from './evidence';
import type { Finding, Verdict } from './finding';
import { gradeFinding } from './grading';
import type {
  CoverageSummary,
  EngineStamp,
  EvidenceStamp,
  Report,
  RuleResult,
  RulesetStamp,
} from './report';
import { REPORT_SCHEMA_VERSION } from './report';
import type { Rule, RuleContext, RuleOutcome } from './rule';
import type { Ruleset } from './ruleset';

/** Everything a rule sees except the page under adjudication. */
type SharedContext = Omit<RuleContext<'page'>, 'page'>;

/** A rule result before its verdict and findings are known. */
type PartialResult = Omit<RuleResult, 'verdict' | 'findings'>;

/**
 * A page-scoped rule cannot be adjudicated without a page, so `static` is
 * implied. Stating it here rather than in each rule keeps the catalogue's
 * "Needs" column honest without making every family repeat it.
 */
function requiredCapabilities(rule: Rule): readonly Capability[] {
  if (rule.scope !== 'page' || rule.capabilities.includes('static')) return rule.capabilities;
  return ['static', ...rule.capabilities];
}

function partialResult(rule: Rule, capabilities: readonly Capability[]): PartialResult {
  return {
    rule: rule.id,
    title: rule.title,
    grounding: rule.grounding,
    scope: rule.scope,
    capabilities,
  };
}

function pageContext(shared: SharedContext, page: PageEvidence): RuleContext<'page'> {
  return { ...shared, page };
}

function siteContext(shared: SharedContext): RuleContext<'site'> {
  return { ...shared, page: null };
}

/** `fail` beats `warn`; observations and infos are cited, never scored. */
function worstVerdict(graded: readonly Finding[]): Verdict {
  if (graded.some((finding) => finding.verdict === 'fail')) return 'fail';
  if (graded.some((finding) => finding.verdict === 'warn')) return 'warn';
  return 'pass';
}

interface MergedOutcomes {
  readonly graded: readonly Finding[];
  /** Pages the rule reached a judgement on — passed, or emitted findings about. */
  readonly adjudicated: number;
  /** Every distinct not-applicable reason, in first-seen order. */
  readonly reasons: readonly string[];
}

/**
 * Merge the per-page outcomes of one rule into a single result.
 *
 * Counts rather than flags, because "some page passed" is the shape that let a
 * rule which judged one page of three report a clean `pass` with nothing on the
 * report able to say so. The verdict is unchanged — the count is what the
 * caller now has to render beside it. Reasons are kept whole for the same
 * reason: the first page's reason is not the rule's.
 */
function mergeOutcomes(rule: Rule, outcomes: readonly RuleOutcome[]): MergedOutcomes {
  const graded: Finding[] = [];
  const reasons: string[] = [];
  let adjudicated = 0;
  for (const outcome of outcomes) {
    switch (outcome.status) {
      case 'pass': {
        adjudicated += 1;
        break;
      }
      case 'not-applicable': {
        if (!reasons.includes(outcome.reason)) reasons.push(outcome.reason);
        break;
      }
      case 'findings': {
        adjudicated += 1;
        for (const draft of outcome.findings) graded.push(gradeFinding(rule, draft));
        break;
      }
    }
  }
  return { graded, adjudicated, reasons };
}

/** Per-page counts, for a page rule only: a site rule iterates no pages. */
function pageCounts(
  rule: Rule,
  outcomes: readonly RuleOutcome[],
  adjudicated: number,
): Pick<RuleResult, 'pagesAdjudicated' | 'pagesNotApplicable'> {
  if (rule.scope !== 'page') return {};
  return { pagesAdjudicated: adjudicated, pagesNotApplicable: outcomes.length - adjudicated };
}

function runRule(
  rule: Rule,
  shared: SharedContext,
  available: ReadonlySet<Capability>,
): RuleResult {
  const required = requiredCapabilities(rule);
  const missing = missingCapabilities(required, available);
  const base = partialResult(rule, required);
  if (missing.length > 0) {
    return { ...base, verdict: 'not-collected', findings: [], missingCapabilities: missing };
  }

  const outcomes =
    rule.scope === 'page'
      ? shared.pages.map((page) => rule.run(pageContext(shared, page)))
      : [rule.run(siteContext(shared))];
  const { graded, adjudicated, reasons } = mergeOutcomes(rule, outcomes);
  const pages = pageCounts(rule, outcomes, adjudicated);

  if (graded.length > 0) {
    return { ...base, ...pages, verdict: worstVerdict(graded), findings: graded };
  }
  if (adjudicated > 0) return { ...base, ...pages, verdict: 'pass', findings: [] };
  const [first = 'the rule found nothing to adjudicate', ...rest] = reasons;
  return {
    ...base,
    ...pages,
    verdict: 'not-applicable',
    findings: [],
    notApplicableReason: first,
    notApplicableReasons: [first, ...rest],
  };
}

function stampRuleset(ruleset: Ruleset): RulesetStamp {
  return {
    id: ruleset.id,
    version: ruleset.version,
    ruleIds: ruleset.rules.map((rule) => rule.id),
  };
}

function stampEvidence(evidence: Evidence, capabilities: ReadonlySet<Capability>): EvidenceStamp {
  const { source } = evidence;
  const base = {
    schemaVersion: evidence.schemaVersion,
    sourceKind: source.kind,
    collectedAt: evidence.collectedAt,
    collector: evidence.collector,
    capabilities: [...capabilities],
  };
  if (source.kind === 'network') return { ...base, vantage: source.vantage };
  return { ...base, root: source.root };
}

function summarize(results: readonly RuleResult[]): CoverageSummary {
  const count = (verdict: Verdict): number =>
    results.filter((result) => result.verdict === verdict).length;
  const total = (pick: (result: RuleResult) => number | undefined): number =>
    results.reduce((sum, result) => sum + (pick(result) ?? 0), 0);
  const notApplicable = count('not-applicable');
  const notCollected = count('not-collected');
  return {
    rules: results.length,
    ran: results.length - notApplicable - notCollected,
    notApplicable,
    notCollected,
    passed: count('pass'),
    failed: count('fail'),
    warned: count('warn'),
    rulePagesAdjudicated: total((result) => result.pagesAdjudicated),
    rulePagesNotApplicable: total((result) => result.pagesNotApplicable),
  };
}

/**
 * Adjudicate collected evidence against a ruleset.
 *
 * `engine` is the caller's own build identity, and it is a parameter for two
 * reasons. It keeps the kernel pure — a function that consulted a global for
 * its version would be reading the world, which is the thing this module does
 * not do — and it means the field is written **while the report is created**
 * rather than patched on afterwards. A report stamped after the fact has a
 * moment in which it exists unstamped, and that is the moment a copy gets
 * exported, cached or handed to a shell.
 *
 * Optional, so the CLI and this package's own tests keep calling
 * `evaluate(evidence, ruleset)` unchanged; omitting it omits the field, which
 * is the honest outcome rather than a placeholder. See {@link EngineStamp}.
 *
 * @throws {import('./grading').RuleContractError} when a rule violates the
 *   finding contract — a bug in the rule, surfaced loudly rather than shipped
 *   as a quietly softened report.
 */
export function evaluate(evidence: Evidence, ruleset: Ruleset, engine?: EngineStamp): Report {
  const capabilities = deriveCapabilities(evidence);
  const shared: SharedContext = {
    evidence,
    capabilities,
    pages: evidence.pages,
    probes: adjudicableProbes(evidence),
    classify: ruleset.classifier,
  };
  const results = ruleset.rules.map((rule) => runRule(rule, shared, capabilities));
  const allFindings = results.flatMap((result) => [...result.findings]);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ruleset: stampRuleset(ruleset),
    evidence: stampEvidence(evidence, capabilities),
    ...(engine === undefined ? {} : { engine }),
    results,
    findings: allFindings,
    coverage: summarize(results),
    brokenPromises: allFindings.filter((finding) => finding.verdict === 'fail').length,
  };
}
