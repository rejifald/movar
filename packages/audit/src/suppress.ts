/**
 * Suppressions — the only sanctioned way to opt out of a rule.
 *
 * The ruleset floats with the package and is stamped on every report, so a team
 * that disagrees with a finding cannot pin the catalogue; they suppress the
 * finding, in a file a reviewer reads. This module is the mechanism, and it
 * deliberately follows the house doctrine already proven in
 * `scripts/check-suppressions.mts`:
 *
 *   1. **An allowlist of suppressible rules.** Derived from the grading law
 *      rather than hand-maintained: a jurisdiction-pack rule is never
 *      suppressible (you do not opt out of a statute in a config file), and a
 *      `classified` rule is never suppressible (it cannot fail, so silencing it
 *      buys nothing and only rots).
 *   2. **No blanket ignores.** One exact rule ID per entry, never a prefix or a
 *      wildcard, and a page-scoped rule must name the page it is silenced on.
 *   3. **Mandatory justification.** A reason short enough to be a shrug is a
 *      violation, not a suppression.
 *   4. **A budget that only ratchets down.** Raising it is a visible edit to a
 *      committed file.
 *   5. **Stale-suppression detection.** Without it the file becomes a graveyard
 *      that hides the next regression — which is exactly the failure mode a
 *      pinned ruleset was rejected for.
 *
 * **A suppression never rewrites the `Report`.** `evaluate()` is the instrument;
 * what a caller chooses to let block a build is the caller's policy, and the
 * library holds no opinion about production versus a local build. So this
 * module reads a report and answers *which findings a policy silences*, leaving
 * the report itself the same artifact that replays years from now.
 */

import type { Finding } from './finding';
import type { Report, RuleResult } from './report';

/**
 * A reason shorter than this is not a justification. Longer than the 12
 * characters `check-suppressions.mts` demands of an inline code comment,
 * because this one has a whole JSON field and a reviewer to convince.
 */
export const MIN_REASON_LENGTH = 24;

/** One silenced rule. Exactly one rule, and — for a page rule — exactly one page. */
export interface Suppression {
  /** An exact catalogue ID. Never a prefix, never a pattern. */
  readonly rule: string;
  /**
   * The finding's `path` (filesystem evidence) or `url` (network evidence),
   * matched exactly. Required on a page-scoped rule, forbidden on a site-scoped
   * one — a page rule silenced site-wide is the blanket ignore doctrine bans.
   */
  readonly subject?: string;
  readonly reason: string;
}

/** The committed file: a budget plus the entries it bounds. */
export interface SuppressionPolicy {
  /**
   * The most suppressions this project permits. Only ever edited DOWNWARD as
   * entries are deleted; raising it is a deliberate, reviewable change.
   */
  readonly budget: number;
  readonly suppressions: readonly Suppression[];
}

/** A finding that a policy entry silenced, and the entry that did it. */
export interface SuppressedFinding {
  readonly finding: Finding;
  readonly suppression: Suppression;
}

/** A policy entry that breaks the doctrine. Never silences anything. */
export interface SuppressionViolation {
  readonly suppression: Suppression | null;
  readonly problem: string;
}

/**
 * What a policy did to a report. The report is untouched; these are the parts a
 * caller needs to decide an exit code.
 */
export interface SuppressionOutcome {
  readonly suppressed: readonly SuppressedFinding[];
  /** The `fail` findings no entry silenced — the broken promises that stand. */
  readonly remaining: readonly Finding[];
  /** Entries that matched nothing in this run. The graveyard detector. */
  readonly stale: readonly Suppression[];
  readonly violations: readonly SuppressionViolation[];
}

/** Every `fail` finding in a report, in rule order. Only these are suppressible. */
function failingFindings(report: Report): readonly Finding[] {
  return report.findings.filter((finding) => finding.verdict === 'fail');
}

function resultOf(report: Report, ruleId: string): RuleResult | undefined {
  return report.results.find((result) => result.rule === ruleId);
}

/**
 * Doctrine 1 — is this rule suppressible at all?
 *
 * Answered from the report's own rule stamps, so the allowlist tracks the
 * catalogue instead of drifting behind a hand-maintained copy of it.
 */
function unsuppressableReason(result: RuleResult): string | null {
  if (!result.rule.startsWith('core/')) {
    return 'jurisdiction-pack rules are not suppressible — a statute is not a config option';
  }
  if (result.grounding === 'classified') {
    return 'classified rules can never fail, so suppressing one silences nothing';
  }
  return null;
}

/** Doctrine 2–3 — one exact ID, the right scope, and a real reason. */
function violationsOf(report: Report, suppression: Suppression): readonly string[] {
  const problems: string[] = [];
  const result = resultOf(report, suppression.rule);

  if (result === undefined) {
    // A suppression pointing at a renamed or deleted rule silently stops
    // suppressing. Rule IDs are the audit's public API precisely so this is a
    // loud error rather than a quiet one.
    problems.push(
      `no rule '${suppression.rule}' in the ruleset this report was adjudicated against`,
    );
  } else {
    const unsuppressable = unsuppressableReason(result);
    if (unsuppressable !== null) problems.push(unsuppressable);
    if (result.scope === 'page' && suppression.subject === undefined) {
      problems.push(
        "page-scoped rule needs a 'subject' — a page rule silenced site-wide is a blanket ignore",
      );
    }
    if (result.scope === 'site' && suppression.subject !== undefined) {
      problems.push(
        "site-scoped rule takes no 'subject' — its findings are about the site, not a page",
      );
    }
  }

  if (suppression.rule.includes('*'))
    problems.push('patterns are not allowed — name one exact rule ID');
  if (suppression.reason.trim().length < MIN_REASON_LENGTH) {
    problems.push(`reason must be at least ${MIN_REASON_LENGTH} characters of justification`);
  }
  return problems;
}

/** The identity two entries would collide on. */
function keyOf(suppression: Suppression): string {
  return `${suppression.rule} ${suppression.subject ?? ''}`;
}

/** Does this entry silence this finding? Exact rule, exact subject. */
function matches(suppression: Suppression, finding: Finding): boolean {
  if (finding.rule !== suppression.rule) return false;
  if (suppression.subject === undefined) return true;
  return (
    finding.subject.path === suppression.subject || finding.subject.url === suppression.subject
  );
}

/**
 * Read a report through a policy.
 *
 * An entry that breaks the doctrine silences nothing — a malformed suppression
 * must never be more powerful than a well-formed one, or the checks are
 * decorative.
 */
export function applySuppressions(report: Report, policy: SuppressionPolicy): SuppressionOutcome {
  const violations: SuppressionViolation[] = [];
  const valid: Suppression[] = [];
  const seen = new Set<string>();

  for (const suppression of policy.suppressions) {
    const problems = [...violationsOf(report, suppression)];
    const key = keyOf(suppression);
    if (seen.has(key)) problems.push('duplicate entry — one suppression per rule and subject');
    seen.add(key);
    for (const problem of problems) violations.push({ suppression, problem });
    if (problems.length === 0) valid.push(suppression);
  }

  // Doctrine 4. Checked against the declared entries, not the valid ones, so
  // stuffing the file with broken entries cannot smuggle the count past the cap.
  if (policy.suppressions.length > policy.budget) {
    violations.push({
      suppression: null,
      problem: `${policy.suppressions.length} suppressions exceed the budget of ${policy.budget} — the budget only ratchets down`,
    });
  }

  const suppressed: SuppressedFinding[] = [];
  const remaining: Finding[] = [];
  for (const finding of failingFindings(report)) {
    const suppression = valid.find((entry) => matches(entry, finding));
    if (suppression === undefined) remaining.push(finding);
    else suppressed.push({ finding, suppression });
  }

  // Doctrine 5. A valid entry that silenced nothing is stale: either the site
  // was fixed, or the rule stopped firing. Both mean delete the line.
  const stale = valid.filter((entry) => !suppressed.some((match) => match.suppression === entry));

  return { suppressed, remaining, stale, violations };
}

/** A non-negative integer, the only shape a budget can take. */
function isBudget(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** One entry, or the reason it is not one. Errors name the index, so a file with a typo says where. */
function parseEntry(entry: unknown, index: number): Suppression | Error {
  const at = `suppressions[${index}]`;
  if (typeof entry !== 'object' || entry === null) return new Error(`${at} is not an object`);

  const { rule, subject, reason } = entry as Record<string, unknown>;
  if (!isNonEmptyString(rule)) return new Error(`${at}.rule must be a non-empty string`);
  if (typeof reason !== 'string') return new Error(`${at}.reason must be a string`);
  if (subject !== undefined && typeof subject !== 'string') {
    return new Error(`${at}.subject must be a string when present`);
  }
  // `exactOptionalPropertyTypes` is on: an absent subject is an absent key,
  // never a key set to `undefined`.
  return { rule, reason, ...(subject === undefined ? {} : { subject }) };
}

/** A `SuppressionPolicy` from parsed JSON, or the reason it is not one. */
export function parseSuppressionPolicy(value: unknown): SuppressionPolicy | Error {
  if (typeof value !== 'object' || value === null) return new Error('expected a JSON object');
  const { budget, suppressions } = value as Record<string, unknown>;
  if (!isBudget(budget)) return new Error("'budget' must be a non-negative integer");
  if (!Array.isArray(suppressions)) return new Error("'suppressions' must be an array");

  const parsed: Suppression[] = [];
  for (const [index, entry] of suppressions.entries()) {
    const one = parseEntry(entry, index);
    if (one instanceof Error) return one;
    parsed.push(one);
  }
  return { budget, suppressions: parsed };
}
