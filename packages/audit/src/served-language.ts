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
import { dominantSampleLanguage } from './text-samples';
import type { LanguageCode } from '@movar/lang-detect';

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
 * The vote itself is {@link dominantSampleLanguage}'s, so this seam classifies
 * exactly the passages `text-samples.ts` says may be classified — the
 * 40-character floor, the proper-noun-run exclusion and the `<code>` exclusion
 * all included. It used to hand the classifier raw `sample.text`, which put the
 * three families that ask this question outside every gate the catalogue
 * publishes and let a page of two-character words be served up as a verdict
 * about a named site (#435). All this adds is the `via` tag: the answer came
 * from the classifier, so the kernel will strip whatever cites it of its
 * failing power.
 */
export function classifiedPageLanguage(
  page: PageEvidence,
  classify: Classifier,
  candidates: readonly LanguageCode[],
): Determination | null {
  const dominant = dominantSampleLanguage(classify, page, candidates);
  if (dominant === null) return null;
  return { language: dominant.language, via: CLASSIFIED, denominator: dominant.denominator };
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
