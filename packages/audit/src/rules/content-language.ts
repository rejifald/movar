/**
 * **Family E — content language.** The classifier's family, and the only one in
 * the catalogue that can never fail a build.
 *
 * Three properties are load-bearing, and each is a decision the ADR argues
 * rather than a style choice:
 *
 * 1. **Nothing here fails.** Every rule is `grounding: 'classified'`, so the
 *    draft type forbids `verdict: 'fail'` outright — see `finding.ts`. The
 *    shipped detector is ~92.7 % accurate on an independent corpus and
 *    materially weaker on short, topic-loaded text, which is what a web page is
 *    mostly made of; a published accusation about a named company must never
 *    rest on that. See `docs/no-llm-language-detection.md`.
 * 2. **Nothing here aggregates into "this page is Russian."** That is the same
 *    invariant the extension's content-filter layer holds, except that breaking
 *    it here costs a published accusation rather than a curtained card.
 *    `core/content-contradicts-declaration` is the closest the catalogue comes
 *    to a page verdict, which is exactly why it is an `observation` and a
 *    pointer at `core/lang-contradicts-*` — never a substitute for them.
 * 3. **Every finding states its denominator.** _"47 of 812 text nodes
 *    classified `ru`"_ is a finding; _"47 nodes"_ is a smear. The kernel
 *    rejects a draft that omits it, and every `summary` here is worded as a
 *    measurement with its denominator rather than as a verdict about the page.
 *
 * What text may be classified at all — the candidate set, the exclusions, and
 * the denominator — is **not** owned here. It lives in `../text-samples`,
 * because family A's hybrid `core/lang-part-unmarked` needs the same answers and
 * two copies would drift into two different verdicts on the only question that
 * decides whether a passage gets cited in a published document.
 *
 * @see ../../../../docs/movar-audit-rules.md — section E, and the grading law
 * @see ../../../../docs/no-llm-language-detection.md — why this family is bounded
 */

import { STATIC_ONLY } from '../capability';
import type { Classifier, ClassifiedText } from '../classifier';
import type { HeadTextField, HeadTextSample, PageEvidence, TextNodeSample } from '../evidence';
import type { ClassifiedFindingDraft, EvidenceRef } from '../finding';
import { nodeRef, pageRef, subjectOf } from '../finding';
import type { CoreRule, RuleContext, RuleFamily, RuleOutcome } from '../rule';
import { findings, notApplicable, pass } from '../rule';
import type { ClassifiedHeadText, ClassifiedSample } from '../text-samples';
import {
  classifiablePageLanguage,
  classifiableSnippet,
  classifyHeadTexts,
  classifySamples,
  CLASSIFIER_CANDIDATES,
  isInsideCodeElement,
  MAX_CITED_PASSAGES,
  textNodeDenominator,
} from '../text-samples';
import type { LanguageCode } from '@movar/lang-detect';

const CLASSIFIED = 'classified' as const;
const PAGE = 'page' as const;
const OBSERVATION = 'observation' as const;

/**
 * **Calibration-pending.** How many sampled nodes must classify before
 * `core/content-contradicts-declaration` will call any language "dominant" —
 * a plurality of one is not a measurement.
 */
export const MIN_CLASSIFIED_SAMPLES = 5;

/**
 * **Calibration-pending.** The share of classified nodes one language must hold
 * before `core/content-contradicts-declaration` reports it as dominant.
 */
const DOMINANT_LANGUAGE_SHARE = 0.6;

/** Regions that are page chrome rather than page content. */
const CHROME_REGIONS: ReadonlySet<string> = new Set(['nav', 'footer']);
const BODY_REGION = 'main';

const NO_DECLARED_LANGUAGE = '<html> declares no lang — core/lang-missing owns that case';
const NOTHING_CLASSIFIED =
  'no sampled text node was long enough, or distinctive enough, for the classifier to answer';
const MEASUREMENT_CAVEAT = 'a measurement of sampled text, not a verdict about the page';
/** See the same constant in `page-declaration.ts`: absent ≠ empty. */
const NO_HEAD = 'this bundle predates head collection (Evidence schemaVersion 1)';
/**
 * A head string is one short string, so silence is the honest answer far more
 * often than it is for body prose — see `HEAD_REPORT_RUNGS` in `../text-samples`.
 */
const HEAD_NOT_CLASSIFIED =
  'no head string was long enough, or distinctive enough, for the classifier to answer on a reportable rung';

interface LanguageGroup {
  readonly language: LanguageCode;
  readonly members: readonly ClassifiedSample[];
}

/** Largest group first; ties broken by code so the report is deterministic. */
function compareGroups(left: LanguageGroup, right: LanguageGroup): number {
  if (left.members.length !== right.members.length)
    return right.members.length - left.members.length;
  return left.language.localeCompare(right.language);
}

function groupByLanguage(samples: readonly ClassifiedSample[]): readonly LanguageGroup[] {
  const groups = new Map<LanguageCode, ClassifiedSample[]>();
  for (const sample of samples) {
    const bucket = groups.get(sample.verdict.language) ?? [];
    bucket.push(sample);
    groups.set(sample.verdict.language, bucket);
  }
  return [...groups]
    .map(([language, members]): LanguageGroup => ({ language, members }))
    .toSorted(compareGroups);
}

function citedNodes(page: PageEvidence, members: readonly ClassifiedSample[]): EvidenceRef[] {
  return members
    .slice(0, MAX_CITED_PASSAGES)
    .map((member) => nodeRef(page, member.sample.nodePath));
}

/**
 * The gather step `core/content-language-mixed` and
 * `core/content-contradicts-declaration` both start from: a classifiable
 * declaration and what the sampled text classifies as. Takes the rest of the
 * rule as a continuation rather than returning a gathered-or-outcome union,
 * so neither caller repeats the "did gathering short-circuit?" check — the
 * `notApplicable` half of the guard is `declarationReason`'s wording, not
 * either rule's own, and belongs in exactly one place.
 */
function withClassifiedAgainstDeclaration(
  page: PageEvidence,
  classify: Classifier,
  onGathered: (declared: LanguageCode, classified: readonly ClassifiedSample[]) => RuleOutcome,
): RuleOutcome {
  const declared = classifiablePageLanguage(page.document.htmlLang);
  if (declared === null) return notApplicable(declarationReason(page.document.htmlLang));
  return onGathered(declared, classifySamples(classify, page.document.textNodes));
}

const contentLanguageMixed: CoreRule<'page'> = {
  id: 'core/content-language-mixed',
  title: "Text nodes classify as a language other than the page's declared one",
  capabilities: STATIC_ONLY,
  grounding: CLASSIFIED,
  scope: PAGE,
  run(ctx) {
    const { document } = ctx.page;
    return withClassifiedAgainstDeclaration(ctx.page, ctx.classify, (declared, classified) => {
      if (classified.length === 0) return notApplicable(NOTHING_CLASSIFIED);
      const foreign = classified.filter((sample) => sample.verdict.language !== declared);
      if (foreign.length === 0) return pass();

      const drafts = groupByLanguage(foreign).map(
        ({ language, members }): ClassifiedFindingDraft => ({
          grounding: CLASSIFIED,
          verdict: OBSERVATION,
          subject: subjectOf(ctx.page, members[0]?.sample.nodePath),
          evidence: [pageRef(ctx.page), ...citedNodes(ctx.page, members)],
          summary: `${members.length} of ${document.textNodes.length} sampled text nodes classified ${language} where the page declares ${declared} — ${MEASUREMENT_CAVEAT}.`,
          denominator: textNodeDenominator(ctx.page, members.length),
        }),
      );
      return findings(...drafts);
    });
  },
};

const contentContradictsDeclaration: CoreRule<'page'> = {
  id: 'core/content-contradicts-declaration',
  title: 'The dominant classified language differs from <html lang>',
  capabilities: STATIC_ONLY,
  grounding: CLASSIFIED,
  scope: PAGE,
  run(ctx) {
    const { document } = ctx.page;
    return withClassifiedAgainstDeclaration(ctx.page, ctx.classify, (declared, classified) => {
      if (classified.length < MIN_CLASSIFIED_SAMPLES) {
        return notApplicable(
          `fewer than ${MIN_CLASSIFIED_SAMPLES} sampled text nodes classified, which is too few to call any language dominant`,
        );
      }
      const dominant = groupByLanguage(classified)[0];
      if (dominant === undefined) return notApplicable(NOTHING_CLASSIFIED);
      if (dominant.language === declared) return pass();
      if (dominant.members.length / classified.length < DOMINANT_LANGUAGE_SHARE) return pass();

      return findings({
        grounding: CLASSIFIED,
        verdict: OBSERVATION,
        subject: subjectOf(ctx.page, dominant.members[0]?.sample.nodePath),
        evidence: [pageRef(ctx.page), ...citedNodes(ctx.page, dominant.members)],
        summary: `${dominant.language} is the largest classified share of this page — ${dominant.members.length} of ${document.textNodes.length} sampled text nodes, and ${dominant.members.length} of the ${classified.length} that classified at all — where the page declares ${declared}; core/lang-contradicts-url and core/lang-contradicts-picker own the declaration-grounded verdict.`,
        denominator: textNodeDenominator(ctx.page, dominant.members.length),
      });
    });
  },
};

/**
 * Classify one region as a single sample.
 *
 * Joining is safe **within** a region and forbidden across regions: every node
 * in a page's navigation is the site's own chrome, so pooling them shares one
 * provenance, where pooling chrome with body text is exactly the case
 * `packages/lang-detect/AGENTS.md` warns about. It is also the only way to
 * reach a verdict on chrome at all — menu items are far shorter than
 * `MIN_CLASSIFIABLE_CHARS` (`../text-samples`) on their own.
 */
function classifyRegion(
  classify: Classifier,
  samples: readonly TextNodeSample[],
): ClassifiedText | null {
  const joined = samples
    .filter((sample) => !isInsideCodeElement(sample.nodePath))
    .map((sample) => sample.text)
    .join(' ');
  const text = classifiableSnippet(joined);
  if (text === null) return null;
  return classify(text, CLASSIFIER_CANDIDATES);
}

const contentChromeUntranslated: CoreRule<'page'> = {
  id: 'core/content-chrome-untranslated',
  title: 'Navigation/footer classify differently from the body',
  capabilities: STATIC_ONLY,
  grounding: CLASSIFIED,
  scope: PAGE,
  run(ctx) {
    const { textNodes } = ctx.page.document;
    const chrome = textNodes.filter(
      (sample) => sample.region !== undefined && CHROME_REGIONS.has(sample.region),
    );
    const body = textNodes.filter((sample) => sample.region === BODY_REGION);
    if (chrome.length === 0 || body.length === 0) {
      return notApplicable(
        'the collector marked no navigation/footer region, no main region, or neither',
      );
    }
    const chromeVerdict = classifyRegion(ctx.classify, chrome);
    const bodyVerdict = classifyRegion(ctx.classify, body);
    if (chromeVerdict === null || bodyVerdict === null) return notApplicable(NOTHING_CLASSIFIED);
    if (chromeVerdict.language === bodyVerdict.language) return pass();

    return findings({
      grounding: CLASSIFIED,
      verdict: OBSERVATION,
      subject: subjectOf(ctx.page, chrome[0]?.nodePath),
      evidence: [
        pageRef(ctx.page),
        ...chrome.slice(0, MAX_CITED_PASSAGES).map((sample) => nodeRef(ctx.page, sample.nodePath)),
      ],
      summary: `The navigation and footer text of this page — ${chrome.length} of ${textNodes.length} sampled text nodes, classified as one sample per region — classified ${chromeVerdict.language} where the main region classified ${bodyVerdict.language} — ${MEASUREMENT_CAVEAT}.`,
      denominator: textNodeDenominator(ctx.page, chrome.length),
    });
  },
};

/* -------------------------------------------------------------------------- */
/* E4 / E5 — the head                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The head is classified **separately from the body, and never joined to it**.
 *
 * Folding a `<title>` into `textNodes` would make it one short string among up
 * to a thousand-odd — invisible to `core/content-contradicts-declaration`'s
 * dominance vote, and skewing that rule's denominator on the way past. Kept
 * apart it gets its own small, honest denominator, which is the same treatment
 * `core/content-chrome-untranslated` gives navigation and footer, for the same
 * reason: joining is safe *within* a region and forbidden across them.
 *
 * Both rules matter because the head is what a reader meets *before* the page —
 * the browser tab, the search result, the shared link's preview card. A site
 * can serve a fully translated body under a title nobody ever translated, and
 * every surface that quotes the page rather than renders it stays in the wrong
 * language. Neither rule names a language: an English title on a `lang="uk"`
 * page is the same finding as a Russian one.
 */
function headTexts(page: PageEvidence, wanted: (field: HeadTextField) => boolean) {
  return (page.document.head?.texts ?? []).filter((sample) => wanted(sample.field));
}

/** How a finding names the field it read. */
const FIELD_LABEL: Readonly<Record<HeadTextField, string>> = {
  title: '<title>',
  'meta-description': '<meta name="description">',
  'og:title': 'og:title',
  'og:description': 'og:description',
  'twitter:title': 'twitter:title',
  'twitter:description': 'twitter:description',
};

/**
 * The whole gather step both head rules start from: a classifiable
 * declaration, a head that was collected, this rule's fields, a verdict on each
 * of them, and the subset that disagrees with the declaration.
 *
 * Takes the rest of the rule as a continuation rather than returning a
 * gathered-or-outcome union, for the reason `withClassifiedAgainstDeclaration`
 * gives above: neither caller repeats the "did gathering short-circuit?" check,
 * and every `notApplicable` wording lives in exactly one place. Both rules
 * would otherwise open with the same four lines, and two copies of "is a head
 * string reportable?" is two answers to the only question deciding whether a
 * string gets quoted in a published document.
 */
function withForeignHeadText(
  ctx: RuleContext<'page'>,
  wanted: (field: HeadTextField) => boolean,
  absent: string,
  onForeign: (
    declared: LanguageCode,
    texts: readonly HeadTextSample[],
    foreign: readonly ClassifiedHeadText[],
  ) => RuleOutcome,
): RuleOutcome {
  const { page } = ctx;
  const declared = classifiablePageLanguage(page.document.htmlLang);
  if (declared === null) return notApplicable(declarationReason(page.document.htmlLang));
  if (page.document.head === undefined) return notApplicable(NO_HEAD);
  const texts = headTexts(page, wanted);
  if (texts.length === 0) return notApplicable(absent);

  const classified = classifyHeadTexts(ctx.classify, texts);
  if (classified.length === 0) return notApplicable(HEAD_NOT_CLASSIFIED);
  const foreign = classified.filter((entry) => entry.verdict.language !== declared);
  if (foreign.length === 0) return pass();
  return onForeign(declared, texts, foreign);
}

/**
 * The draft shape both head rules emit. Only the summary and how the members
 * were grouped differ; the denominator is always "of the fields this rule
 * examined", never of the body.
 */
function headDraft(
  page: PageEvidence,
  members: readonly ClassifiedHeadText[],
  examined: number,
  summary: string,
): ClassifiedFindingDraft {
  return {
    grounding: CLASSIFIED,
    verdict: OBSERVATION,
    subject: subjectOf(page, members[0]?.sample.nodePath),
    evidence: [pageRef(page), ...members.map((entry) => nodeRef(page, entry.sample.nodePath))],
    summary,
    denominator: { examined, matched: members.length },
  };
}

const titleContradictsDeclaration: CoreRule<'page'> = {
  id: 'core/title-contradicts-declaration',
  title: "<title> classifies as a language other than the page's declared one",
  capabilities: STATIC_ONLY,
  grounding: CLASSIFIED,
  scope: PAGE,
  run(ctx) {
    return withForeignHeadText(
      ctx,
      (field) => field === 'title',
      'the page has no <title>, or it is empty',
      (declared, texts, foreign) =>
        findings(
          ...foreign.map((entry) =>
            headDraft(
              ctx.page,
              [entry],
              texts.length,
              `This page's <title> — one string of ${entry.text.length} characters — classified ${entry.verdict.language} where the page declares ${declared}; it is the browser tab, the search result and the shared link's preview, so it is what a reader meets before the page — ${MEASUREMENT_CAVEAT}.`,
            ),
          ),
        ),
    );
  },
};

const headMetadataContradictsDeclaration: CoreRule<'page'> = {
  id: 'core/head-metadata-contradicts-declaration',
  title: 'Description / og: / twitter: preview text classifies differently',
  capabilities: STATIC_ONLY,
  grounding: CLASSIFIED,
  scope: PAGE,
  run(ctx) {
    return withForeignHeadText(
      ctx,
      (field) => field !== 'title',
      'the page declares no description, og: or twitter: preview text',
      (declared, texts, foreign) =>
        findings(
          ...groupHeadByLanguage(foreign).map(([language, members]) =>
            headDraft(
              ctx.page,
              members,
              texts.length,
              `${members.length} of ${texts.length} head preview fields on this page — ${describeFields(members)} — classified ${language} where the page declares ${declared}; these are what a search result and a shared link render, not the page itself — ${MEASUREMENT_CAVEAT}.`,
            ),
          ),
        ),
    );
  },
};

/** Largest group first; ties broken by code so the report is deterministic. */
function groupHeadByLanguage(
  entries: readonly ClassifiedHeadText[],
): readonly (readonly [LanguageCode, readonly ClassifiedHeadText[]])[] {
  const groups = new Map<LanguageCode, ClassifiedHeadText[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.verdict.language) ?? [];
    bucket.push(entry);
    groups.set(entry.verdict.language, bucket);
  }
  return [...groups].toSorted(([leftCode, left], [rightCode, right]) =>
    left.length === right.length ? leftCode.localeCompare(rightCode) : right.length - left.length,
  );
}

function describeFields(entries: readonly ClassifiedHeadText[]): string {
  return entries.map((entry) => FIELD_LABEL[entry.sample.field]).join(', ');
}

/** Why a page's own declaration cannot anchor a classified comparison. */
function declarationReason(htmlLang: string | null): string {
  if (htmlLang === null || htmlLang.trim() === '') return NO_DECLARED_LANGUAGE;
  return `Movar ships no detection profile for the declared language "${htmlLang.trim()}", so its text cannot be classified against it`;
}

/**
 * Family E. Cited observations only — the catalogue's "Can fail" column reads
 * **no** for every rule here, and the draft type is what enforces it.
 */
export const contentLanguageFamily: RuleFamily = {
  id: 'E. Content language',
  title: 'Classifier-grounded observations — never a build failure, never a page verdict',
  rules: [
    contentLanguageMixed,
    contentContradictsDeclaration,
    contentChromeUntranslated,
    titleContradictsDeclaration,
    headMetadataContradictsDeclaration,
  ],
};
