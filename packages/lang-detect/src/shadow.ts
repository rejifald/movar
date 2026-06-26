/**
 * Shadow-oracle comparison for the per-snippet classifier (see
 * docs/per-snippet-language-detection.md). Pure: compares the classifier's
 * verdict against an off-path franc oracle and returns a trichotomy. The
 * extension runs this off the hot path (idle, batched) and records only
 * contradictions — this module owns the *decision*, not the plumbing.
 */
import type { RungVerdict } from './classify';
import type { LanguageCode } from './lang-codes';

export type DivergenceKind = 'confirm' | 'contradict' | 'abstain';

/** What the franc oracle concluded for a snippet. `null` = franc abstained. */
export interface OracleVerdict {
  language: LanguageCode;
  /** franc score-gap (top1 − top2), 0..1. */
  margin: number;
}

export interface DivergenceOptions {
  /** Min classifier lead (rung-1/2 count) to treat its verdict as confident. */
  minClassifierMargin?: number;
  /** Min franc score-gap to treat the oracle as confident. */
  minOracleMargin?: number;
}

/**
 * Compare a classifier verdict against the franc oracle:
 * - `abstain` — either side is not confident (franc abstained or weak, or the
 *   classifier was 'unknown' / below its margin). "No evidence" is never a
 *   disagreement; this is most snippets.
 * - `confirm` — both confident and agree.
 * - `contradict` — both confident and disagree. The only case worth recording.
 */
export function classifyDivergence(
  classifier: RungVerdict,
  oracle: OracleVerdict | null,
  { minClassifierMargin = 1, minOracleMargin = 0.1 }: DivergenceOptions = {},
): DivergenceKind {
  const classifierConfident =
    classifier.language !== 'unknown' && classifier.margin >= minClassifierMargin;
  const oracleConfident = oracle !== null && oracle.margin >= minOracleMargin;
  if (!classifierConfident || !oracleConfident) return 'abstain';
  return classifier.language === oracle.language ? 'confirm' : 'contradict';
}
