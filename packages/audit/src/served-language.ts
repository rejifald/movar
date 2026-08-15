/**
 * "What language did this response actually serve, and who decided?"
 *
 * The hybrid contract, in one place. Families C, D and F all have to answer it,
 * and answering it differently would mean the same page graded `fail` by one
 * rule and `observation` by another — the grading law reduced to a coin toss.
 *
 * The order is the contract: **the response's own declaration wins, and the
 * classifier answers only when there is no declaration.** A finding built on a
 * declaration is `via: 'declared'` and may fail, because the site's own markup
 * is the witness; one built on the classifier is `via: 'classified'` and the
 * kernel strips its failing power. Reversing the preference — or reaching for
 * the classifier when a perfectly good `<html lang>` is present — silently
 * downgrades findings the site cannot argue with.
 */

import { declaredLanguageOf } from './bcp47';
import type { Classifier } from './classifier';
import type { PageEvidence } from './evidence';
import type { Denominator, Via } from './finding';
import { textNodeDenominator } from './text-samples';
import type { LanguageCode } from '@movar/lang-detect';

/** ≥2 of anything is what every differential question needs. */
const DIFFERENTIAL_MINIMUM = 2;

const CLASSIFIED = 'classified' as const;
const DECLARED = 'declared' as const;

/** A language, plus who decided it and — when classified — on what evidence. */
export interface Determination {
  readonly language: string;
  readonly via: Via;
  /** Set only for a classified determination; mandatory on the finding. */
  readonly denominator?: Denominator;
}

/** The page's own `<html lang>`, trimmed and normalized, or `null`. */
export function declaredPageLanguage(page: PageEvidence): string | null {
  const tag = page.document.htmlLang;
  if (tag === null) return null;
  const trimmed = tag.trim();
  return trimmed === '' ? null : declaredLanguageOf(trimmed);
}

/**
 * The dominant classified language of a page's sampled text, or `null`.
 *
 * Refuses to answer with fewer than two candidates: distinctiveness is
 * candidate-relative, so a one-language candidate set is not a classification —
 * it is a rubber stamp that returns whatever it was handed.
 *
 * The denominator is {@link textNodeDenominator}'s, never `samples.length`. The
 * collector caps body sampling, so the sample is a floor and quoting it as the
 * page understates `M` — which inflates the share, in the direction of the
 * accusation. The numerator stays the count over the sample the classifier
 * actually saw: that widest-honest pairing is what every other classified
 * denominator in the kernel uses, and it errs low.
 *
 * This is the seam rather than a rule, so the floor did not stay local:
 * {@link mergedDenominator} sums these across determinations, and family C's
 * hybrid `core/serving-*` findings summed one understated count per page.
 */
export function classifiedPageLanguage(
  page: PageEvidence,
  classify: Classifier,
  candidates: readonly LanguageCode[],
): Determination | null {
  if (candidates.length < DIFFERENTIAL_MINIMUM) return null;
  const samples = page.document.textNodes;
  if (samples.length === 0) return null;

  const counts = new Map<string, number>();
  for (const sample of samples) {
    const verdict = classify(sample.text, candidates);
    if (verdict === null) continue;
    counts.set(verdict.language, (counts.get(verdict.language) ?? 0) + 1);
  }

  let dominant: string | null = null;
  let matched = 0;
  for (const [language, count] of counts) {
    if (count <= matched) continue;
    dominant = language;
    matched = count;
  }
  if (dominant === null) return null;
  return {
    language: dominant,
    via: CLASSIFIED,
    denominator: textNodeDenominator(page, matched),
  };
}

/**
 * The language a response served. Declaration first, classifier only as a
 * fallback — see the module doc; that order is the hybrid contract itself.
 */
export function servedLanguage(
  page: PageEvidence | null,
  classify: Classifier,
  candidates: readonly LanguageCode[],
): Determination | null {
  if (page === null) return null;
  const declared = declaredPageLanguage(page);
  if (declared !== null) return { language: declared, via: DECLARED };
  return classifiedPageLanguage(page, classify, candidates);
}

/** A finding is only as strong as its weakest determination. */
export function weakestVia(determinations: readonly Determination[]): Via {
  return determinations.some((one) => one.via === CLASSIFIED) ? CLASSIFIED : DECLARED;
}

/** *"3 of 340 text nodes"* — summed across every classified determination cited. */
export function mergedDenominator(
  determinations: readonly Determination[],
): Denominator | undefined {
  let examined = 0;
  let matched = 0;
  let seen = false;
  for (const { denominator } of determinations) {
    if (denominator === undefined) continue;
    examined += denominator.examined;
    matched += denominator.matched;
    seen = true;
  }
  return seen ? { examined, matched } : undefined;
}
