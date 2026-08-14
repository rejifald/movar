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
 * satisfies this type and still replays. The version is reserved for a change a
 * reader must **fork on** — a field removed, retyped, or given a new meaning.
 * The per-page counts below are not that: absent simply means "not available",
 * and every consumer's correct response to absence is to render nothing.
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
   * emitted findings about. Present iff a page-scoped rule ran, so absent for
   * a site rule (it iterates no pages) and for a `not-collected` one (it was
   * never called, and a `0` would read as a judgement it never made).
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
 * The first seven counts are rules. The two `page*` counts are **(rule, page)
 * pairs** summed over every page-scoped rule that ran — deliberately named
 * apart from {@link RuleResult.pagesAdjudicated}, which counts distinct pages
 * for one rule, so the two granularities cannot be read for each other.
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
   * (rule, page) pairs a page rule reached a judgement on. Over its sum with
   * {@link pageNotApplicable} it is how much of the site the page rules
   * actually judged — a rule-level `pass` that skipped the site says so here.
   */
  readonly pageAdjudications?: number;
  /** (rule, page) pairs where the rule had nothing to adjudicate. */
  readonly pageNotApplicable?: number;
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
