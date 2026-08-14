/**
 * The grading law, enforced structurally.
 *
 * A false accusation is the one failure mode that kills this product, so the
 * kernel — not rule discipline — decides what a finding is allowed to assert:
 *
 * - **`classified` can never `fail`.** If a finding's effective grounding is
 *   `classified`, the kernel downgrades a `fail` to an `observation` and says
 *   so on the finding (`downgradedFrom`). A mis-written rule therefore cannot
 *   manufacture a build-breaking accusation out of a classifier verdict.
 * - **`classified` must state its denominator.** _"3 of 340 text nodes"_ is a
 *   finding; _"3 nodes"_ is a smear. The pure-classified case is a compile
 *   error (see `finding.ts`); the hybrid `via: 'classified'` case can only be
 *   caught here, and is rejected.
 * - **Pack findings must carry a citation.** The rule declares it once and the
 *   kernel stamps it, so a pack rule structurally cannot emit an uncited
 *   accusation.
 *
 * Violations throw {@link RuleContractError} rather than degrading quietly: a
 * mis-written rule must fail loudly in its own tests, never ship a softened
 * report.
 */

import type { Finding, FindingDraft, FindingVerdict, Via } from './finding';
import { effectiveGrounding } from './finding';
import type { Rule } from './rule';
import { ruleCitation } from './rule';

/** A rule violated the finding contract. Always a bug in the rule. */
export class RuleContractError extends Error {
  /** The offending rule's catalogue ID. */
  readonly rule: string;

  constructor(rule: string, message: string) {
    super(`${rule}: ${message}`);
    this.name = 'RuleContractError';
    this.rule = rule;
  }
}

/** `via` lives only on the non-classified draft variant. */
function draftVia(draft: FindingDraft): Via | null {
  if (draft.grounding === 'classified') return null;
  return draft.via ?? null;
}

/** A rule's ID is a pack ID unless it sits in the neutral `core/` set. */
function isPackRuleId(id: string): boolean {
  return !id.startsWith('core/');
}

function assertGroundingMatches(rule: Rule, draft: FindingDraft): void {
  if (draft.grounding === rule.grounding) return;
  throw new RuleContractError(
    rule.id,
    `finding grounding '${draft.grounding}' contradicts the rule's declared '${rule.grounding}' — ` +
      'a hybrid rule records the classifier with `via`, it does not restate its grounding',
  );
}

function assertViaIsDeclared(rule: Rule, via: Via | null): void {
  if (via === null || rule.hybrid === true) return;
  throw new RuleContractError(
    rule.id,
    `finding sets via: '${via}' but the rule is not declared hybrid`,
  );
}

function assertDenominator(rule: Rule, draft: FindingDraft): void {
  if (draft.denominator != null) return;
  throw new RuleContractError(
    rule.id,
    'a classified finding must carry a denominator — "3 of 340 text nodes" is a finding, "3 nodes" is a smear',
  );
}

function assertCitation(rule: Rule): void {
  if (!isPackRuleId(rule.id) || ruleCitation(rule) !== null) return;
  throw new RuleContractError(
    rule.id,
    'a jurisdiction-pack rule must declare a citation — the pack reports violation evidence with its source, never a bare verdict',
  );
}

/** `classified` loses failing power; everything else keeps its verdict. */
function gradeVerdict(
  verdict: FindingVerdict,
  isClassified: boolean,
): { readonly verdict: FindingVerdict; readonly downgraded: boolean } {
  if (!isClassified || verdict !== 'fail') return { verdict, downgraded: false };
  return { verdict: 'observation', downgraded: true };
}

/**
 * Validate a draft against the grading law and stamp the kernel-owned fields
 * (`rule`, `scope`, `citation`, `downgradedFrom`) onto it.
 *
 * @throws {RuleContractError} when the rule violated the finding contract.
 */
export function gradeFinding(rule: Rule, draft: FindingDraft): Finding {
  assertGroundingMatches(rule, draft);
  assertCitation(rule);

  const via = draftVia(draft);
  assertViaIsDeclared(rule, via);

  const isClassified = effectiveGrounding(draft.grounding, via ?? undefined) === 'classified';
  if (isClassified) assertDenominator(rule, draft);

  const { verdict, downgraded } = gradeVerdict(draft.verdict, isClassified);
  const citation = ruleCitation(rule);

  return {
    rule: rule.id,
    verdict,
    grounding: draft.grounding,
    scope: draft.scope ?? rule.scope,
    subject: draft.subject,
    evidence: draft.evidence,
    summary: draft.summary,
    ...(via === null ? {} : { via }),
    ...(draft.screenshot === undefined ? {} : { screenshot: draft.screenshot }),
    ...(citation === null ? {} : { citation }),
    ...(draft.denominator === undefined ? {} : { denominator: draft.denominator }),
    ...(downgraded ? { downgradedFrom: 'fail' as const } : {}),
  };
}
