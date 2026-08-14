/**
 * The rule contract. A rule family is one file exporting one {@link RuleFamily};
 * adding a family never touches an existing one.
 *
 * A rule declares three things and implements one:
 *
 * - `capabilities` — what the collector must have produced. The kernel answers
 *   `not-collected` when any is absent, so **no rule may hand-check for missing
 *   data**. Inside `run` the context is already known to satisfy the contract.
 * - `grounding` — `declared` / `observed` / `classified`. This, not the rule's
 *   topic, decides whether it may fail.
 * - `scope` — `page` (the kernel iterates pages and merges the results, and
 *   `ctx.page` is non-nullable) or `site` (one call, `ctx.pages`).
 *
 * A jurisdiction-pack rule — any ID outside `core/` — must carry a `citation`.
 * That is enforced by the type: `CoreRule` accepts only `core/…` IDs, and
 * `PackRule` requires the citation, so a `ua/…` rule without one matches
 * neither member of the union. The kernel stamps the citation onto every
 * finding the rule emits, so a pack rule cannot forget it per-finding either.
 */

import type { Capability } from './capability';
import type { Classifier } from './classifier';
import type { Evidence, PageEvidence, ProbeEvidence } from './evidence';
import type { Citation, FindingDraft, Grounding, RuleScope } from './finding';

/**
 * What a rule sees. Generic over scope so a page rule's `page` is non-nullable
 * and a site rule's is statically `null` — a page rule can never be written to
 * ask whether it has a page.
 */
export interface RuleContext<S extends RuleScope = RuleScope> {
  /** The whole bundle, for rules that need the source kind or the stamps. */
  readonly evidence: Evidence;
  readonly capabilities: ReadonlySet<Capability>;
  /** Every collected page, in collection order. */
  readonly pages: readonly PageEvidence[];
  /**
   * Adjudicable probes only — `blocked` and `error` probes are dropped before
   * a rule sees them. Empty on filesystem evidence, where `http` / `matrix` /
   * `multi-vantage` are already `not-collected`.
   */
  readonly probes: readonly ProbeEvidence[];
  /** The page under adjudication. `null` for site-scoped rules. */
  readonly page: S extends 'page' ? PageEvidence : null;
  /** The classifier seam. Using it makes a finding `classified`. */
  readonly classify: Classifier;
}

/** What a rule returns. An empty `findings` list is normalized to `pass`. */
export type RuleOutcome =
  | { readonly status: 'pass' }
  | { readonly status: 'not-applicable'; readonly reason: string }
  | { readonly status: 'findings'; readonly findings: readonly FindingDraft[] };

/** Nothing to report: the rule checked, and the site is fine. */
export function pass(): RuleOutcome {
  return { status: 'pass' };
}

/**
 * The rule's subject is absent, so there is nothing to adjudicate. Distinct
 * from `not-collected` (the collector could not produce the input) and from
 * `pass` (the input was there and was fine). The reason is rendered.
 */
export function notApplicable(reason: string): RuleOutcome {
  return { status: 'not-applicable', reason };
}

/** Report one or more findings. */
export function findings(...drafts: FindingDraft[]): RuleOutcome {
  return { status: 'findings', findings: drafts };
}

interface RuleDefinition<S extends RuleScope> {
  /** One line, in the catalogue's voice: what the rule asserts. */
  readonly title: string;
  readonly capabilities: readonly Capability[];
  readonly grounding: Grounding;
  /**
   * Set on rules whose language determination may come from either the site's
   * declaration or the classifier. Only a hybrid rule may put `via` on a
   * finding; the kernel rejects `via` from any other rule.
   */
  readonly hybrid?: true;
  readonly scope: S;
  run(ctx: RuleContext<S>): RuleOutcome;
}

/** A neutral, jurisdiction-free rule. */
export interface CoreRule<S extends RuleScope = RuleScope> extends RuleDefinition<S> {
  readonly id: `core/${string}`;
}

/** A jurisdiction-pack rule. The citation is mandatory and is stamped on every finding. */
export interface PackRule<S extends RuleScope = RuleScope> extends RuleDefinition<S> {
  readonly id: `${string}/${string}`;
  readonly citation: Citation;
}

export type Rule = CoreRule<'page'> | CoreRule<'site'> | PackRule<'page'> | PackRule<'site'>;

/** One catalogue family — one file, one export, no contact with its siblings. */
export interface RuleFamily {
  /** Catalogue letter and slug, e.g. `'A. Page declaration'`. */
  readonly id: string;
  readonly title: string;
  readonly rules: readonly Rule[];
}

/** The citation a pack rule carries, or `null` for a core rule. */
export function ruleCitation(rule: Rule): Citation | null {
  return 'citation' in rule ? rule.citation : null;
}
