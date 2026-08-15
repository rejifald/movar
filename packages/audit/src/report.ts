/**
 * The `Report` shape.
 *
 * **No score.** Weights would be arguments that cannot be won, and a single
 * number would laminate facts (a 301 chain) onto judgements (a classifier
 * verdict) so the weakest input sets the credibility of the whole thing. The
 * headline is a count of broken promises.
 *
 * Two stamps make a report replayable. The **ruleset stamp** is what keeps
 * replay meaningful: without it, re-adjudicated evidence cannot distinguish
 * "the site changed" from "the rules changed". The **evidence stamp** carries
 * the schema version, the collector, and — for a network run — the vantage the
 * observations were made from, so a report from `localhost` says on its face
 * that geo-override was not observed.
 */

import type { Capability } from './capability';
import type { CollectorStamp, Vantage } from './evidence';
import type { Finding, Grounding, RuleScope, Verdict } from './finding';

/**
 * The `Report` wire-format version.
 *
 * Growth is additive: a field added later is optional, so a stored report still
 * satisfies this type and still replays. This version is **not** bumped for
 * additive growth, and is reserved for a change a reader must fork on — a field
 * removed, retyped, or given a new meaning (a rename is one of those).
 *
 * That is the opposite of `EVIDENCE_SCHEMA_VERSION` (`./evidence`), which bumps
 * on every additive change — deliberately opposite, and the difference is the
 * number of producers, not a disagreement about tidiness. `Evidence` is
 * written by every runtime's own collector — the split is the point — so its
 * version is the one thing a bundle carries that is independent of who wrote
 * it, and stepping it on every addition is how a kernel years later can say
 * what a bundle was entitled to contain. A `Report` has exactly one producer,
 * `evaluate()` in this package: there is no second implementation that could
 * emit a different field set at the same version, so the fields are already
 * their own provenance and a version number could only ever restate them.
 *
 * The cost, stated rather than hidden: **presence is the discriminator**. In a
 * stored report, a page-scoped rule whose verdict is anything but
 * `not-collected` and which carries no {@link RuleResult.pagesAdjudicated} is a
 * report written before the counts existed. That read is sound — the kernel
 * emits both counts for every page rule it invokes — but it is the only signal
 * there is, so do not default an absent count to `0`.
 */
export const REPORT_SCHEMA_VERSION = 1;

/** What one rule reported, whether or not it ran. */
export interface RuleResult {
  readonly rule: string;
  readonly title: string;
  readonly grounding: Grounding;
  readonly scope: RuleScope;
  /** Everything the rule needed, including the kernel's implied `static`. */
  readonly capabilities: readonly Capability[];
  readonly verdict: Verdict;
  readonly findings: readonly Finding[];
  /**
   * The first of {@link notApplicableReasons}, for a one-line render. Present
   * iff `verdict` is `not-applicable`. Read the list, not this, to learn what
   * the *rest* of the pages said.
   */
  readonly notApplicableReason?: string;
  /**
   * Every distinct reason the pages gave, in first-seen order. Present iff
   * `verdict` is `not-applicable`; length 1 whenever the pages agreed, which
   * is always the case for a site rule.
   */
  readonly notApplicableReasons?: readonly string[];
  /** Present iff `verdict` is `not-collected`: what the collector lacked. */
  readonly missingCapabilities?: readonly Capability[];
  /**
   * How many collected pages this rule reached a judgement on — passed, or
   * emitted findings about. `0` is a real value, and says the rule judged no
   * page at all.
   *
   * Present iff the kernel invoked a page-scoped rule, which is not
   * {@link CoverageSummary.ran}'s sense of "ran": a rule invoked on every page
   * and `not-applicable` on all of them carries both counts and is excluded
   * from `ran`. Absent for a site rule (it iterates no pages), for a
   * `not-collected` one (never called), and in a report predating the counts.
   * **Never default an absent count to `0`** — that is the difference between
   * "judged nothing" and "we do not know".
   */
  readonly pagesAdjudicated?: number;
  /**
   * How many collected pages had nothing for this rule to adjudicate. Present
   * under the same condition; sums with {@link pagesAdjudicated} to the
   * collected page count, which is what makes "1 of 3" legible.
   */
  readonly pagesNotApplicable?: number;
}

/** The ruleset a report was adjudicated against. Floats with the package. */
export interface RulesetStamp {
  readonly id: string;
  readonly version: string;
  readonly ruleIds: readonly string[];
}

/** Where the evidence came from, without repeating the evidence. */
export interface EvidenceStamp {
  readonly schemaVersion: number;
  readonly sourceKind: 'network' | 'filesystem';
  readonly collectedAt: string;
  readonly collector: CollectorStamp;
  /** Network runs only. Its `country` is a claim — never an observed fact. */
  readonly vantage?: Vantage;
  /** Filesystem runs only. */
  readonly root?: string;
  readonly capabilities: readonly Capability[];
}

/**
 * How much of the catalogue actually ran. `notCollected` is rendered per rule
 * and never rolled up into a pass.
 *
 * The first seven counts are **rules**. The two `rulePages*` counts are
 * **rule-pages** — one rule's look at one page — summed over every page-scoped
 * rule the kernel invoked, which is deliberately *not* {@link ran}'s sense: a
 * rule that was invoked on all 20 pages and found nothing to adjudicate on any
 * of them contributes 20 rule-pages here while counting as `notApplicable`,
 * not `ran`. The unit is in the name because these are the only counts here
 * that are not rules, and because 580 rule-pages across a 20-page site would
 * otherwise read as an impossible number of pages.
 */
export interface CoverageSummary {
  readonly rules: number;
  readonly ran: number;
  readonly notApplicable: number;
  readonly notCollected: number;
  readonly passed: number;
  readonly failed: number;
  readonly warned: number;
  /**
   * Rule-pages a page rule reached a judgement on. Over its sum with
   * {@link rulePagesNotApplicable} it is how much of the site the page rules
   * actually judged — a rule-level `pass` that skipped the site says so here.
   *
   * `0` is a real value; absence means the report predates these counts. The
   * kernel always emits both, even when every page rule is `not-collected`.
   */
  readonly rulePagesAdjudicated?: number;
  /** Rule-pages where the rule had nothing to adjudicate. */
  readonly rulePagesNotApplicable?: number;
}

/** The language conformance report. */
export interface Report {
  readonly schemaVersion: number;
  readonly ruleset: RulesetStamp;
  readonly evidence: EvidenceStamp;
  readonly results: readonly RuleResult[];
  /** Every graded finding, flattened in rule order. */
  readonly findings: readonly Finding[];
  readonly coverage: CoverageSummary;
  /** The headline: how many `fail` findings. Observations are not scored. */
  readonly brokenPromises: number;
}
