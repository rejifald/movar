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
 * - **Grading.** Every draft passes through `gradeFinding`, which strips
 *   failing power from classifier-grounded findings and rejects an uncited
 *   pack finding or a classified finding with no denominator.
 */

import type { Capability } from './capability';
import { adjudicableProbes, deriveCapabilities, missingCapabilities } from './capability';
import type { Evidence, PageEvidence } from './evidence';
import type { Finding, Verdict } from './finding';
import { gradeFinding } from './grading';
import type { CoverageSummary, EvidenceStamp, Report, RuleResult, RulesetStamp } from './report';
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
  readonly sawPass: boolean;
  readonly reason: string | null;
}

/** Merge the per-page outcomes of one rule into a single result. */
function mergeOutcomes(rule: Rule, outcomes: readonly RuleOutcome[]): MergedOutcomes {
  const graded: Finding[] = [];
  let sawPass = false;
  let reason: string | null = null;
  for (const outcome of outcomes) {
    switch (outcome.status) {
      case 'pass': {
        sawPass = true;
        break;
      }
      case 'not-applicable': {
        reason ??= outcome.reason;
        break;
      }
      case 'findings': {
        if (outcome.findings.length === 0) sawPass = true;
        for (const draft of outcome.findings) graded.push(gradeFinding(rule, draft));
        break;
      }
    }
  }
  return { graded, sawPass, reason };
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
  const { graded, sawPass, reason } = mergeOutcomes(rule, outcomes);

  if (graded.length > 0) return { ...base, verdict: worstVerdict(graded), findings: graded };
  if (sawPass) return { ...base, verdict: 'pass', findings: [] };
  return {
    ...base,
    verdict: 'not-applicable',
    findings: [],
    notApplicableReason: reason ?? 'the rule found nothing to adjudicate',
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
  };
}

/**
 * Adjudicate collected evidence against a ruleset.
 *
 * @throws {import('./grading').RuleContractError} when a rule violates the
 *   finding contract — a bug in the rule, surfaced loudly rather than shipped
 *   as a quietly softened report.
 */
export function evaluate(evidence: Evidence, ruleset: Ruleset): Report {
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
    results,
    findings: allFindings,
    coverage: summarize(results),
    brokenPromises: allFindings.filter((finding) => finding.verdict === 'fail').length,
  };
}
