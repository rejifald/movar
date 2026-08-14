/**
 * Findings and the grading vocabulary.
 *
 * The catalogue's governing law is that **grounding decides failing power**:
 *
 * | Grounding    | Source of truth                                    | May fail? |
 * | ------------ | -------------------------------------------------- | --------- |
 * | `declared`   | The site's own markup, headers, sitemap             | yes       |
 * | `observed`   | HTTP facts: byte identity, statuses, redirects      | yes       |
 * | `classified` | `@movar/lang-detect` on page text                   | **never** |
 *
 * That law is enforced here where the type system can carry it, and in
 * `grading.ts` where it cannot:
 *
 * - A `classified` draft **cannot be typed** with `verdict: 'fail'`, and
 *   **must** carry a `denominator`. Both are compile errors.
 * - A hybrid draft (grounding `declared`, `via: 'classified'`) can only be
 *   caught at runtime, because `via` is a value the rule computes. The kernel
 *   downgrades its verdict and rejects a missing denominator.
 */

import type { NodePath, PageEvidence, Rect } from './evidence';

/** What a whole rule reported. `not-collected` is **never** `pass`. */
export type Verdict = 'pass' | 'fail' | 'warn' | 'not-applicable' | 'not-collected';

/** What one finding asserts. Only `fail` counts as a broken promise. */
export type FindingVerdict = 'fail' | 'warn' | 'observation' | 'info';

/** Where a finding's language determination came from. */
export type Grounding = 'declared' | 'observed' | 'classified';

/**
 * A hybrid rule's per-finding grounding. One rule ID, one suppression, two
 * grades: the finding records which source actually answered.
 */
export type Via = 'declared' | 'classified';

/** Page-level or whole-site. */
export type RuleScope = 'page' | 'site';

/** What the finding is about. */
export interface FindingSubject {
  readonly url?: string;
  readonly path?: string;
  readonly node?: NodePath;
}

/**
 * A pointer into `Evidence`. Findings cite; they never inline. An
 * `attachment` ref is citable only — the attachment carries no content.
 */
export type EvidenceRef =
  | { readonly kind: 'page'; readonly pageId: string }
  | { readonly kind: 'node'; readonly pageId: string; readonly nodePath: NodePath }
  | { readonly kind: 'probe'; readonly probeId: string }
  | { readonly kind: 'redirect-chain'; readonly probeId: string }
  | { readonly kind: 'attachment'; readonly attachmentId: string };

/** Where in a captured screenshot the finding lives. */
export interface FindingScreenshot {
  readonly assetId: string;
  readonly region: Rect;
}

/**
 * The statute a jurisdiction-pack rule cites. Mandatory on every pack finding;
 * the kernel stamps it from the rule so a pack rule cannot forget it.
 */
export interface Citation {
  readonly source: string;
  readonly article: string;
  readonly url: string;
}

/**
 * *"3 of 340 text nodes"* is a finding; *"3 nodes"* is a smear. Mandatory on
 * every `classified` finding, including the hybrid `via: 'classified'` case.
 */
export interface Denominator {
  readonly examined: number;
  readonly matched: number;
}

/** Fields every finding carries, whatever its grounding. */
interface FindingCore {
  readonly verdict: FindingVerdict;
  /** Defaults to the rule's own scope when omitted. */
  readonly scope?: RuleScope;
  readonly subject: FindingSubject;
  readonly evidence: readonly EvidenceRef[];
  readonly screenshot?: FindingScreenshot;
  /** One sentence, in the report's voice. A measurement, not a verdict. */
  readonly summary: string;
  readonly denominator?: Denominator;
}

/**
 * A finding a `classified` rule emits. The type forbids `fail` outright and
 * requires the denominator — a classifier-grounded rule cannot be written into
 * a build-breaking accusation even by mistake.
 */
export interface ClassifiedFindingDraft extends FindingCore {
  readonly grounding: 'classified';
  readonly verdict: Exclude<FindingVerdict, 'fail'>;
  readonly denominator: Denominator;
}

/** A finding a `declared` or `observed` rule emits. May fail. */
export interface GroundedFindingDraft extends FindingCore {
  readonly grounding: 'declared' | 'observed';
  /**
   * Hybrid rules only. Set to `'classified'` when the classifier — not the
   * site's own markup — answered "what language was this?". The kernel then
   * strips this finding's failing power and demands a denominator.
   */
  readonly via?: Via;
}

/** What a rule hands the kernel. The kernel stamps the rest. */
export type FindingDraft = ClassifiedFindingDraft | GroundedFindingDraft;

/** A graded finding, as it appears in a `Report`. */
export interface Finding {
  /** The stable catalogue ID, stamped by the kernel from the rule. */
  readonly rule: string;
  readonly verdict: FindingVerdict;
  readonly grounding: Grounding;
  readonly via?: Via;
  readonly scope: RuleScope;
  readonly subject: FindingSubject;
  readonly evidence: readonly EvidenceRef[];
  readonly screenshot?: FindingScreenshot;
  readonly summary: string;
  /** Stamped by the kernel from a jurisdiction-pack rule's own citation. */
  readonly citation?: Citation;
  readonly denominator?: Denominator;
  /**
   * Set when the kernel stripped this finding's failing power because its
   * effective grounding was `classified`. The report says so on its face
   * rather than quietly softening the wording.
   */
  readonly downgradedFrom?: 'fail';
}

/**
 * The grounding that actually decides this finding's failing power: a hybrid
 * rule's `via` overrides the rule's own grounding.
 */
export function effectiveGrounding(grounding: Grounding, via: Via | undefined): Grounding {
  return via ?? grounding;
}

/*
 * -----------------------------------------------------------------------
 * Evidence citation helpers
 * -----------------------------------------------------------------------
 * Nearly every rule family needs to point a finding at a page or a node
 * inside one, and needs to build the `FindingSubject` that names what a
 * finding is about. Both were copied, byte for byte, into six rule files
 * before landing here — a rule file that hand-rolls `subjectOf` risks
 * getting the `exactOptionalPropertyTypes` omission wrong, since a `url` or
 * `path` key set to `undefined` is a different shape than the key being
 * absent, and only an absent key is legal on `FindingSubject`.
 */

/** Cite the page itself — the finding is about the page as a whole. */
export function pageRef(page: PageEvidence): EvidenceRef {
  return { kind: 'page', pageId: page.id };
}

/** Cite one node inside a page — the finding is about that element. */
export function nodeRef(page: PageEvidence, nodePath: NodePath): EvidenceRef {
  return { kind: 'node', pageId: page.id, nodePath };
}

/** `exactOptionalPropertyTypes` is on: absent fields are omitted, never `undefined`. */
export function subjectOf(page: PageEvidence, node?: NodePath): FindingSubject {
  return {
    ...(page.url === undefined ? {} : { url: page.url }),
    ...(page.path === undefined ? {} : { path: page.path }),
    ...(node === undefined ? {} : { node }),
  };
}
