/**
 * The text-sample vocabulary: what text a rule may classify at all, and how it
 * states the denominator when it does.
 *
 * This is kernel, not a rule family, because two families already need the same
 * answers — family E's `core/content-*` observations and family A's hybrid
 * `core/lang-part-unmarked`. Two copies of "is this snippet classifiable?" would
 * drift into two different answers to the only question that decides whether a
 * passage gets cited in a published document about a named company.
 *
 * Everything here is deliberately biased toward **under-firing**. The exclusions
 * (too short, proper-noun runs, `<code>`) and the widest-possible candidate set
 * all cost recall and buy precision, which is the correct trade for a tool whose
 * one fatal failure mode is a false accusation.
 *
 * Nothing here grants failing power. Text that survives these gates is still
 * `classified` evidence, and `grading.ts` strips its ability to fail.
 *
 * @see ../../../docs/movar-audit-rules.md — the grading law
 * @see ../../../docs/no-llm-language-detection.md — why classifier accuracy is bounded
 */

import type { Classifier, ClassifiedText } from './classifier';
import type { HeadTextSample, NodePath, PageEvidence, TextNodeSample } from './evidence';
import type { Denominator } from './finding';
import { hasProfile, normalizeBCP47, PROFILED_CODES } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

/**
 * The candidate set every classification in the audit runs against: every
 * language `@movar/lang-detect` ships a profile for.
 *
 * Deliberately the **widest** set rather than a `uk`/`ru` pair. Distinctiveness
 * is computed relative to the candidates, so keeping `be` and `bg` in scope
 * strips `uk` and `ru` of signals the two share with them — the classifier
 * abstains where it would otherwise have guessed. Under-firing is the safe
 * direction for a tool that names companies.
 */
export const CLASSIFIER_CANDIDATES: readonly LanguageCode[] = [...PROFILED_CODES];

/**
 * **Calibration-pending.** The catalogue lists the minimum string length as an
 * open question (`docs/movar-audit-rules.md` § Open); this is a defensible
 * default, not a measured one.
 *
 * 40 characters, chosen against the corpus in `docs/no-llm-language-detection.md`:
 * langtell refuses a trigram verdict below 24 characters, the corpus's `short`
 * stratum (median 32) is where the shipped cascade is weakest, and a citation
 * would rather examine fewer passages than quote a coin flip.
 */
export const MIN_CLASSIFIABLE_CHARS = 40;

/**
 * How many passages a single finding cites. A report-size bound, **not** a
 * detection threshold: the denominator always states the true totals.
 */
export const MAX_CITED_PASSAGES = 10;

/** Element names whose text is not prose and must never be classified. */
const CODE_ELEMENTS: ReadonlySet<string> = new Set(['code', 'samp', 'kbd']);

/** A node path is a CSS-ish path; these separate its steps. */
const PATH_STEP_SEPARATOR = /[\s>+~]+/u;
/** The bare element name a step starts with, before any class/id/pseudo. */
const LEADING_ELEMENT_NAME = /^[a-z][a-z\d-]*/u;
const RUN_OF_WHITESPACE = /\s+/u;
/** The same pattern, for `replaceAll` — which requires the `g` flag. */
const EVERY_RUN_OF_WHITESPACE = /\s+/gu;
const FIRST_LETTER = /\p{L}/u;

/**
 * The page's declared language, when Movar ships a profile that can classify
 * text *against* it.
 *
 * `normalizeBCP47` — not `declaredLanguageOf` — because the answer is about to
 * be compared with a classifier verdict rather than with another declaration.
 * `<html lang="de-DE">` yields `null` here on purpose: the classifier cannot
 * represent German, so "the text is not German" is a claim it must not be asked
 * to make.
 */
export function classifiablePageLanguage(htmlLang: string | null): LanguageCode | null {
  if (htmlLang === null) return null;
  const trimmed = htmlLang.trim();
  if (trimmed === '') return null;
  const code = normalizeBCP47(trimmed);
  if (code === null || !hasProfile(code)) return null;
  return code;
}

/** Is this node inside `<code>` / `<samp>` / `<kbd>`? */
export function isInsideCodeElement(nodePath: NodePath): boolean {
  return nodePath
    .toLowerCase()
    .split(PATH_STEP_SEPARATOR)
    .some((step) => CODE_ELEMENTS.has(LEADING_ELEMENT_NAME.exec(step)?.[0] ?? ''));
}

function startsUppercase(word: string): boolean {
  const letter = FIRST_LETTER.exec(word)?.[0];
  if (letter === undefined) return false;
  return letter !== letter.toLowerCase();
}

/**
 * Does this snippet read as a run of proper nouns — a brand, a name, a product
 * line — rather than prose?
 *
 * Structural rather than a brand list on purpose: an audit tool with an
 * allowlist of companies is not a standard, and the list would be wrong in
 * every market it has not been curated for. A run whose every word is
 * capitalised carries no lowercase function words, which is both the shape of a
 * proper noun and the shape the classifier has least to work with. Title-cased
 * prose is excluded too — that is under-firing, the safe direction.
 */
export function isProperNounRun(text: string): boolean {
  const words = text.split(RUN_OF_WHITESPACE).filter((word) => FIRST_LETTER.test(word));
  if (words.length === 0) return true;
  return words.every(startsUppercase);
}

/**
 * The normalized snippet a rule may hand the classifier, or `null` when this
 * text is excluded: too short to classify, or a run of proper nouns.
 */
export function classifiableSnippet(text: string): string | null {
  const collapsed = text.replaceAll(EVERY_RUN_OF_WHITESPACE, ' ').trim();
  if (collapsed.length < MIN_CLASSIFIABLE_CHARS) return null;
  if (isProperNounRun(collapsed)) return null;
  return collapsed;
}

/** One sampled text node the classifier actually answered about. */
export interface ClassifiedSample {
  readonly sample: TextNodeSample;
  /** The normalized text handed to the classifier — never the raw node text. */
  readonly text: string;
  readonly verdict: ClassifiedText;
}

/**
 * Classify each sampled text node **on its own**.
 *
 * Per node, never joined across nodes: `@movar/lang-detect` is count-based and
 * provenance-blind, so pooling text of different provenance lets a few tokens
 * outvote a short body. See `packages/lang-detect/AGENTS.md` § Pitfall.
 *
 * `candidates` defaults to {@link CLASSIFIER_CANDIDATES} and every family that
 * asks "what language is this passage?" should leave it there. The one
 * legitimate narrowing is the *different* question families C, D and F ask —
 * "of the languages this site declares, or this switch names, which did the
 * response serve?" — where the set in play is the site's own and a verdict of
 * `bg` about a uk/en site would answer a question nobody asked. Narrowing costs
 * exactly what the constant's doc says it costs: fewer abstentions, because
 * distinctiveness is candidate-relative. It never relaxes the **gates** above,
 * which is the whole reason there is one implementation of them.
 */
export function classifySamples(
  classify: Classifier,
  samples: readonly TextNodeSample[],
  candidates: readonly LanguageCode[] = CLASSIFIER_CANDIDATES,
): readonly ClassifiedSample[] {
  const classified: ClassifiedSample[] = [];
  for (const sample of samples) {
    if (isInsideCodeElement(sample.nodePath)) continue;
    const text = classifiableSnippet(sample.text);
    if (text === null) continue;
    const verdict = classify(text, candidates);
    if (verdict === null) continue;
    classified.push({ sample, text, verdict });
  }
  return classified;
}

/**
 * The denominator every classified finding carries: matched against **every**
 * text node the collector examined, not against the subset that survived the
 * exclusions — nor against the subset that survived the collector's sampling
 * cap. The widest honest denominator is the least smeary one.
 *
 * `textSampling.examined` is what the walker actually saw; `textNodes.length`
 * is only what fitted in the bundle. On a capped page the two differ by the
 * whole truncation — a 4000-node page quoted as 1500 inflates every share the
 * report publishes by 2.7×, in the direction of the accusation. A bundle
 * collected before `schemaVersion` 3 carries no counts, so it falls back to the
 * sample length it did quote.
 */
export function textNodeDenominator(page: PageEvidence, matched: number): Denominator {
  const { textNodes, textSampling } = page.document;
  return { examined: textSampling?.examined ?? textNodes.length, matched };
}

/** ≥2 of anything is what every differential question needs. */
const DIFFERENTIAL_MINIMUM = 2;

/** The majority verdict over a page's body text, and the share that carried it. */
export interface DominantLanguage {
  readonly language: LanguageCode;
  readonly denominator: Denominator;
}

/**
 * The dominant classified language of a page's body text, or `null` when no
 * passage survived the gates above and no verdict was reached.
 *
 * The single implementation of the page-level vote, for the same reason the
 * gates have one: families C, D and F each ran their own copy over raw
 * `sample.text` and so classified text the catalogue's own gates exclude — a
 * page whose passages were two two-character words and a `<code>` node came
 * back `uk`, a published observation naming a site and resting on nothing
 * (#435). A fabricated determination there does not only mis-state; in
 * `core/switch-no-effect` "the target serves a different language" is what
 * *suppresses* the draft, so the wrong answer silences a real finding.
 *
 * Refuses to answer with fewer than two candidates: distinctiveness is
 * candidate-relative, so a one-language candidate set is not a classification —
 * it is a rubber stamp that returns whatever it was handed.
 *
 * The vote is taken over the surviving sample, which is all the bundle carries,
 * but the denominator is the population {@link textNodeDenominator} states.
 * Every narrowing here — the cap, the sampling, the exclusions — runs in the
 * direction of the accusation, so none of them may reach the share the report
 * publishes.
 */
export function dominantSampleLanguage(
  classify: Classifier,
  page: PageEvidence,
  candidates: readonly LanguageCode[],
): DominantLanguage | null {
  if (candidates.length < DIFFERENTIAL_MINIMUM) return null;
  const counts = new Map<LanguageCode, number>();
  for (const { verdict } of classifySamples(classify, page.document.textNodes, candidates)) {
    counts.set(verdict.language, (counts.get(verdict.language) ?? 0) + 1);
  }
  let dominant: LanguageCode | null = null;
  let matched = 0;
  for (const [language, count] of counts) {
    if (count <= matched) continue;
    dominant = language;
    matched = count;
  }
  if (dominant === null) return null;
  return { language: dominant, denominator: textNodeDenominator(page, matched) };
}

/* -------------------------------------------------------------------------- */
/* Head strings                                                                */
/* -------------------------------------------------------------------------- */

/**
 * **Calibration-pending.** The catalogue lists the head-string gate as an open
 * question separate from `core/lang-part-unmarked`'s, because the input is
 * shorter and there is exactly one of it (`docs/movar-audit-rules.md` § Open).
 *
 * The catalogue asks for "a high rung with franc concurrence". Franc
 * concurrence is not reachable through the frozen `Classifier` seam — see the
 * same argument at `rules/page-declaration.ts` — so this substitutes the half
 * the seam does expose: the deciding rung must have found something
 * **distinctive**. A rung-3 verdict means rungs 1–2 abstained and franc guessed
 * alone at the weakest accuracy measured in `docs/no-llm-language-detection.md`
 * (73.2 %), which cannot carry an observation about a single short string.
 *
 * `discriminating` is deliberately **not** required here, and that is the one
 * place this gate parts company with `UNMARKED_PART_FAIL_RUNGS`. A
 * non-discriminating verdict is the cross-script case — the winner was the lone
 * candidate in its script — which for Latin-vs-Cyrillic is the *most* reliable
 * determination the classifier makes, not the least. `core/lang-part-unmarked`
 * caps that case at `warn` because an English phrase inside a Ukrainian
 * paragraph is often deliberate, which is a claim about fragments; a `<title>`
 * is not a fragment but the whole of its surface, so an English one is reported
 * exactly as a Russian one is.
 */
const HEAD_REPORT_RUNGS: ReadonlySet<ClassifiedText['rung']> = new Set<ClassifiedText['rung']>([
  1,
  '2a',
  '2b',
]);

/** One head string the classifier answered about, on a rung worth reporting. */
export interface ClassifiedHeadText {
  readonly sample: HeadTextSample;
  /** The normalized text handed to the classifier — never the raw value. */
  readonly text: string;
  readonly verdict: ClassifiedText;
}

/**
 * Classify each head string **on its own**, dropping every verdict that did not
 * clear {@link HEAD_REPORT_RUNGS}.
 *
 * Per field, never joined: a `<title>` and an `og:description` are different
 * strings written at different times, and pooling them would let a long
 * description outvote a title that is the actual defect.
 */
export function classifyHeadTexts(
  classify: Classifier,
  texts: readonly HeadTextSample[],
): readonly ClassifiedHeadText[] {
  const classified: ClassifiedHeadText[] = [];
  for (const sample of texts) {
    const text = classifiableSnippet(sample.text);
    if (text === null) continue;
    const verdict = classify(text, CLASSIFIER_CANDIDATES);
    if (verdict === null || !HEAD_REPORT_RUNGS.has(verdict.rung)) continue;
    classified.push({ sample, text, verdict });
  }
  return classified;
}
