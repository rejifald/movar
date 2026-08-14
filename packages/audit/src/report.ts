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

/** The `Report` wire-format version. */
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
  /** Present iff `verdict` is `not-applicable`. */
  readonly notApplicableReason?: string;
  /** Present iff `verdict` is `not-collected`: what the collector lacked. */
  readonly missingCapabilities?: readonly Capability[];
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
 */
export interface CoverageSummary {
  readonly rules: number;
  readonly ran: number;
  readonly notApplicable: number;
  readonly notCollected: number;
  readonly passed: number;
  readonly failed: number;
  readonly warned: number;
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
