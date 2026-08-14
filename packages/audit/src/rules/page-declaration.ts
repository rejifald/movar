/**
 * **Family A — page declaration.** WCAG 2.1 SC 3.1.1 (Language of Page, Level A)
 * and SC 3.1.2 (Language of Parts, Level AA). This family is why a team with no
 * interest in Ukrainian runs the tool.
 *
 * Every rule here is `declared`-grounded: the site's own markup is the witness,
 * so every one of them may fail a build.
 *
 * `core/lang-part-unmarked` is the family's one **hybrid**, and the only rule
 * here whose language determination comes from the classifier rather than from
 * the markup. It is still a declaration rule — **the failure is the missing
 * `lang`, not the presence of another language** — so it lives with its family
 * and borrows family E's text-sample vocabulary rather than the other way
 * round. Its findings carry `via: 'classified'`, which is what makes the kernel
 * strip their failing power.
 *
 * @see ../../../../docs/movar-audit-rules.md
 */

import { declaredLanguageOf, isWellFormedBCP47, presentLang } from '../bcp47';
import { STATIC_ONLY } from '../capability';
import type { ClassifiedText } from '../classifier';
import type { HeadLanguageDeclaration, LangAttribute, PageEvidence } from '../evidence';
import {
  headCarrierLabel,
  headDeclarationLanguages,
  headDeclarationsOf,
  isWellFormedOgLocale,
} from '../head-declaration';
import type { FindingDraft, GroundedFindingDraft } from '../finding';
import { nodeRef, pageRef, subjectOf } from '../finding';
import { locatorText } from '../locator';
import type { CoreRule, RuleFamily, RuleOutcome } from '../rule';
import { findings, notApplicable, pass } from '../rule';
import { urlLanguageMarker } from '../url-language';
import type { ClassifiedSample } from '../text-samples';
import {
  classifiablePageLanguage,
  classifySamples,
  MAX_CITED_PASSAGES,
  textNodeDenominator,
} from '../text-samples';
import { normalizeBCP47, normalizeLanguageCode } from '@movar/lang-detect';

const DECLARED = 'declared' as const;
const PAGE = 'page' as const;
const FAIL = 'fail' as const;
const WARN = 'warn' as const;

const NO_LANG = '<html> declares no lang — core/lang-missing owns that case';
const MALFORMED_LANG = '<html lang> is not well-formed — core/lang-malformed owns that case';
/**
 * Not the same as an empty head. A `schemaVersion` 1 bundle carries no `head`
 * at all, and saying so is the difference between "nothing was collected" and
 * "nothing was there" — the distinction `not-collected` exists to preserve, and
 * one a `pass` here would destroy.
 */
const NO_HEAD = 'this bundle predates head collection (Evidence schemaVersion 1)';

/**
 * The guard `core/lang-missing` and `core/lang-malformed` themselves enforce,
 * shared by every rule below them that needs a validated tag before it can
 * ask its own question. Returns the outcome to return immediately, or the
 * tag once both guards have cleared.
 */
function declaredTag(page: PageEvidence): RuleOutcome | { readonly tag: string } {
  const tag = presentLang(page.document.htmlLang);
  if (tag === null) return notApplicable(NO_LANG);
  if (!isWellFormedBCP47(tag)) return notApplicable(MALFORMED_LANG);
  return { tag };
}

const langMissing: CoreRule<'page'> = {
  id: 'core/lang-missing',
  title: '<html> carries no lang',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { htmlLang } = ctx.page.document;
    if (presentLang(htmlLang) !== null) return pass();
    return findings({
      grounding: DECLARED,
      verdict: FAIL,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page)],
      summary:
        htmlLang === null
          ? 'The <html> element carries no lang attribute, so nothing declares the page language (WCAG 2.1 SC 3.1.1).'
          : 'The <html> element carries an empty lang attribute, so nothing declares the page language (WCAG 2.1 SC 3.1.1).',
    });
  },
};

const langMalformed: CoreRule<'page'> = {
  id: 'core/lang-malformed',
  title: '<html lang> is not a well-formed BCP-47 tag',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const tag = presentLang(ctx.page.document.htmlLang);
    if (tag === null) return notApplicable(NO_LANG);
    if (isWellFormedBCP47(tag)) return pass();
    return findings({
      grounding: DECLARED,
      verdict: FAIL,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page)],
      summary: `<html lang="${tag}"> is not a well-formed BCP-47 language tag, so user agents cannot resolve the page language (WCAG 2.1 SC 3.1.1).`,
    });
  },
};

const langContradictsUrl: CoreRule<'page'> = {
  id: 'core/lang-contradicts-url',
  title: "<html lang> disagrees with the URL's own language marker",
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const guard = declaredTag(ctx.page);
    if (!('tag' in guard)) return guard;
    const { tag } = guard;
    const locator = locatorText(ctx.page);
    if (locator === null) return notApplicable('the page carries neither a URL nor a build path');
    const marker = urlLanguageMarker(locator);
    if (marker === null) return notApplicable('the URL carries no language marker');
    const declared = declaredLanguageOf(tag);
    if (declared === marker.language) return pass();
    return findings({
      grounding: DECLARED,
      verdict: FAIL,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page)],
      summary: `The ${marker.source} marker "${marker.token}" declares ${marker.language}, but <html lang="${tag}"> declares ${declared}. The page contradicts its own URL.`,
    });
  },
};

const langContradictsPicker: CoreRule<'page'> = {
  id: 'core/lang-contradicts-picker',
  title: "<html lang> disagrees with the picker's active entry",
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const guard = declaredTag(ctx.page);
    if (!('tag' in guard)) return guard;
    const { tag } = guard;
    const { picker } = ctx.page.document;
    if (picker === null) return notApplicable('the page exposes no language picker');
    const label = picker.activeLabel?.trim() ?? '';
    if (label === '') return notApplicable('the picker marks no entry active');
    // A picker label is free text — a code, a `value="UA"`, or localized prose.
    // Strict alias matching only; never `normalizeBCP47` on a label.
    const active = normalizeLanguageCode(label);
    if (active === null) {
      return notApplicable(
        `the picker's active entry ("${label}") is not a language Movar recognises`,
      );
    }
    const declared = declaredLanguageOf(tag);
    if (declared === active) return pass();
    return findings({
      grounding: DECLARED,
      verdict: FAIL,
      subject: subjectOf(ctx.page, picker.nodePath),
      evidence: [pageRef(ctx.page), nodeRef(ctx.page, picker.nodePath)],
      summary: `The language picker marks "${label}" (${active}) as the active entry, but <html lang="${tag}"> declares ${declared}. The page contradicts its own switcher.`,
    });
  },
};

/* -------------------------------------------------------------------------- */
/* The head declaration surface                                                */
/* -------------------------------------------------------------------------- */

/**
 * A head declaration contradicts `<html lang>` when it names a **different
 * language** — never merely a different region.
 *
 * `<html lang="uk">` beside `og:locale="uk_UA"` is a page declaring a language
 * and a market, which is not a defect and must not be reported as one. The
 * comparison therefore runs on `declaredLanguageOf`'s output on both sides,
 * which collapses `uk-UA` to `uk` before the two ever meet.
 *
 * Agreement with **any** declared value is agreement: `Content-Language:
 * en, uk` on a `lang="uk"` page says the response is in both, and it is.
 */
function contradicts(declared: string, declaration: HeadLanguageDeclaration): boolean {
  const languages = headDeclarationLanguages(declaration);
  if (languages.length === 0) return false;
  return !languages.includes(declared);
}

/** The head-declaration rules share one shape; only the carrier differs. */
function headContradictionRule(
  id: `core/${string}`,
  title: string,
  kind: HeadLanguageDeclaration['kind'],
  absent: string,
): CoreRule<'page'> {
  return {
    id,
    title,
    capabilities: STATIC_ONLY,
    grounding: DECLARED,
    scope: PAGE,
    run(ctx) {
      const guard = declaredTag(ctx.page);
      if (!('tag' in guard)) return guard;
      const { tag } = guard;
      if (ctx.page.document.head === undefined) return notApplicable(NO_HEAD);
      const declarations = headDeclarationsOf(ctx.page, kind);
      if (declarations.length === 0) return notApplicable(absent);

      const declared = declaredLanguageOf(tag);
      const drafts = declarations
        .filter((declaration) => contradicts(declared, declaration))
        .map(
          (declaration): GroundedFindingDraft => ({
            grounding: DECLARED,
            verdict: FAIL,
            subject: subjectOf(ctx.page, declaration.nodePath),
            evidence: [pageRef(ctx.page), ...headEvidenceRefs(ctx.page, declaration)],
            // `contradicts` already established a non-empty language list, so
            // the join always names at least one.
            summary: `${headCarrierLabel(declaration)} declares ${headDeclarationLanguages(declaration).join(', ')} ("${declaration.value.trim()}"), but <html lang="${tag}"> declares ${declared}. The page contradicts its own head.`,
          }),
        );
      return drafts.length === 0 ? pass() : findings(...drafts);
    },
  };
}

/** A head declaration cites its element when it has one; the header has none. */
function headEvidenceRefs(page: PageEvidence, declaration: HeadLanguageDeclaration) {
  return declaration.nodePath === undefined ? [] : [nodeRef(page, declaration.nodePath)];
}

const langContradictsOgLocale = headContradictionRule(
  'core/lang-contradicts-og-locale',
  '<html lang> disagrees with og:locale',
  'og-locale',
  'the page declares no og:locale',
);

/**
 * One rule, two carriers. `<meta http-equiv="content-language">` is obsolete in
 * HTML5 and still emitted by most CMS themes; the `Content-Language` response
 * header is the live spelling of the same assertion. The collector folds the
 * header into the document digest — exactly as it already does for `Link:`
 * alternates — so this rule stays `static` and adjudicates identically against
 * a stored bundle. On filesystem evidence only the meta carrier can be present,
 * which is a real difference in what was collected, not a difference in what
 * the rule asserts.
 */
const langContradictsContentLanguage = headContradictionRule(
  'core/lang-contradicts-content-language',
  '<html lang> disagrees with a declared Content-Language',
  'content-language',
  'neither a Content-Language header nor a content-language meta was collected',
);

/**
 * `warn`, where `core/lang-malformed` is `fail`, and the asymmetry is the
 * point: a malformed `<html lang>` breaks assistive technology and every user
 * agent's language resolution, while a malformed `og:locale` degrades a social
 * preview card to whichever default the scraper falls back to. Real, trivially
 * fixable, and not an accessibility failure.
 *
 * Both `og:locale` and `og:locale:alternate` are checked — they share one
 * grammar, and a broken alternate is the more common of the two.
 */
const ogLocaleMalformed: CoreRule<'page'> = {
  id: 'core/og-locale-malformed',
  title: 'og:locale is not a well-formed ll_CC Open Graph locale',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    if (ctx.page.document.head === undefined) return notApplicable(NO_HEAD);
    const declared = [
      ...headDeclarationsOf(ctx.page, 'og-locale'),
      ...headDeclarationsOf(ctx.page, 'og-locale-alternate'),
    ];
    if (declared.length === 0) {
      return notApplicable('the page declares no og:locale or og:locale:alternate');
    }
    const malformed = declared.filter((declaration) => !isWellFormedOgLocale(declaration.value));
    if (malformed.length === 0) return pass();

    const drafts: FindingDraft[] = malformed.map((declaration) => ({
      grounding: DECLARED,
      verdict: WARN,
      subject: subjectOf(ctx.page, declaration.nodePath),
      evidence: [pageRef(ctx.page), ...headEvidenceRefs(ctx.page, declaration)],
      summary: `${headCarrierLabel(declaration)} carries "${declaration.value.trim()}", which is not Open Graph's language_TERRITORY form (e.g. uk_UA), so a scraper that cannot parse it falls back to its own default locale.`,
    }));
    return findings(...drafts);
  },
};

/**
 * **Calibration-pending.** The catalogue lists the rung/franc gate for
 * `core/lang-part-unmarked` as an open question (`docs/movar-audit-rules.md`
 * § Open); these are defensible defaults, not measured ones.
 *
 * The catalogue asks for "rung 1–2 with franc concurrence". Franc concurrence
 * is **not reachable** through the frozen `Classifier` seam: it returns the
 * first rung that decided, and rung 3 (franc) fires only when rungs 1–2 already
 * abstained, so no call can produce both a distinctive-signal verdict and an
 * independent franc verdict. The gate therefore substitutes two properties the
 * seam does expose, both of which must hold for a passage to reach `fail`:
 *
 * - the deciding rung was a **distinctive-signal** rung (1 / 2a / 2b). A rung-3
 *   verdict means nothing distinctive was found and franc guessed alone, and
 *   franc is the weakest engine measured in `docs/no-llm-language-detection.md`
 *   (73.2 %) — it cannot carry an accusation on its own.
 * - the passage cleared {@link UNMARKED_PART_FAIL_MIN_CHARS}. Length is the
 *   dominant accuracy term in that same corpus: 90.9 % on short text against
 *   100 % on paragraphs.
 */
const UNMARKED_PART_FAIL_RUNGS: ReadonlySet<ClassifiedText['rung']> = new Set<
  ClassifiedText['rung']
>([1, '2a', '2b']);

/** See {@link UNMARKED_PART_FAIL_RUNGS}. Calibration-pending. */
export const UNMARKED_PART_FAIL_MIN_CHARS = 80;

/**
 * The language in effect for a sampled passage: the nearest ancestor's declared
 * `lang`, or the page's own when no ancestor narrows it.
 *
 * `normalizeBCP47`, not `declaredLanguageOf`, because the result is about to be
 * compared with a **classifier verdict** rather than with another declaration.
 * `null` — a declaration outside Movar's set, e.g. `lang="de"` — means the
 * classifier cannot contradict it and the passage is skipped.
 */
function languageInEffect(sample: ClassifiedSample, htmlLang: string): string | null {
  const own = presentLang(sample.sample.inheritedLang) ?? htmlLang;
  return normalizeBCP47(own);
}

/** A classified passage and the language actually declared for it. */
interface UnmarkedPassage {
  readonly sample: ClassifiedSample;
  readonly declared: string;
}

/**
 * The passages whose classified language is not the language declared for them.
 *
 * An element that **does** declare the other language is absent from this list:
 * that is the correct markup, and `TextNodeSample.inheritedLang` is how it is
 * seen.
 */
function unmarkedPassages(
  samples: readonly ClassifiedSample[],
  htmlLang: string,
): readonly UnmarkedPassage[] {
  const unmarked: UnmarkedPassage[] = [];
  for (const sample of samples) {
    const declared = languageInEffect(sample, htmlLang);
    if (declared === null || declared === sample.verdict.language) continue;
    unmarked.push({ sample, declared });
  }
  return unmarked;
}

/**
 * `fail` only for a verdict the classifier reached by **choosing between
 * same-script candidates** on a distinctive-signal rung, over a passage long
 * enough to be worth choosing over.
 *
 * `discriminating: false` is precisely the cross-script case — the winner was
 * the lone candidate in its script, picked by script alone. That is what an
 * English fragment inside a Ukrainian page looks like (`en` is the only Latin
 * candidate), so `en`-in-`uk` structurally cannot exceed `warn`, exactly as the
 * catalogue requires, without this rule naming a single language pair.
 */
function unmarkedPartVerdict(passage: UnmarkedPassage): typeof FAIL | typeof WARN {
  const { verdict, text } = passage.sample;
  const decisive =
    verdict.discriminating &&
    UNMARKED_PART_FAIL_RUNGS.has(verdict.rung) &&
    text.length >= UNMARKED_PART_FAIL_MIN_CHARS;
  return decisive ? FAIL : WARN;
}

function unmarkedPartDraft(
  page: PageEvidence,
  passage: UnmarkedPassage,
  matched: number,
): GroundedFindingDraft {
  const { nodePath } = passage.sample.sample;
  return {
    grounding: DECLARED,
    via: 'classified',
    verdict: unmarkedPartVerdict(passage),
    subject: subjectOf(page, nodePath),
    evidence: [pageRef(page), nodeRef(page, nodePath)],
    summary: `This passage classified ${passage.sample.verdict.language} while the language declared for it is ${passage.declared}, so the passage's own language is not declared (WCAG 2.1 SC 3.1.2); ${matched} of ${page.document.textNodes.length} sampled text nodes on this page classified against the language declared for them.`,
    denominator: textNodeDenominator(page, matched),
  };
}

/**
 * The hybrid. **The failure is the missing `lang`, not the presence of another
 * language** — mixing languages is legal HTML, mixing them undeclared is a
 * WCAG 2.1 SC 3.1.2 failure — so the classifier only points at where to look.
 *
 * Every finding it emits sets `via: 'classified'` and a denominator, which is
 * what makes the kernel downgrade the `fail` to a cited observation stamped
 * `downgradedFrom: 'fail'`. The catalogue grade stays `fail` because the
 * assertion is about a missing attribute; the report stays honest about what
 * actually answered.
 */
const langPartUnmarked: CoreRule<'page'> = {
  id: 'core/lang-part-unmarked',
  title: 'A passage is in another language and carries no lang',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  hybrid: true,
  scope: PAGE,
  run(ctx) {
    const guard = declaredTag(ctx.page);
    if (!('tag' in guard)) return guard;
    const { tag } = guard;
    if (classifiablePageLanguage(tag) === null) {
      return notApplicable(
        `Movar ships no detection profile for the declared language "${tag}", so a passage cannot be classified against it`,
      );
    }
    const classified = classifySamples(ctx.classify, ctx.page.document.textNodes);
    const unmarked = unmarkedPassages(classified, tag);
    if (unmarked.length === 0) return pass();

    // Strongest first, so the report-size cap never drops a fail for a warn.
    const decisive = unmarked.filter((passage) => unmarkedPartVerdict(passage) === FAIL);
    const rest = unmarked.filter((passage) => unmarkedPartVerdict(passage) !== FAIL);
    const drafts = [...decisive, ...rest]
      .slice(0, MAX_CITED_PASSAGES)
      .map((passage) => unmarkedPartDraft(ctx.page, passage, unmarked.length));
    return findings(...drafts);
  },
};

/**
 * `lang=""` is legal HTML — it explicitly declares the language unknown — so
 * an empty value is skipped rather than reported as malformed.
 */
function malformedLangAttributes(attributes: readonly LangAttribute[]): readonly LangAttribute[] {
  return attributes.filter((attribute) => {
    const value = attribute.value.trim();
    return value !== '' && !isWellFormedBCP47(value);
  });
}

const langPartMalformed: CoreRule<'page'> = {
  id: 'core/lang-part-malformed',
  title: "An element's lang is not a well-formed BCP-47 tag",
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const malformed = malformedLangAttributes(ctx.page.document.langAttributes);
    if (malformed.length === 0) return pass();
    const drafts: FindingDraft[] = malformed.map((attribute) => ({
      grounding: DECLARED,
      verdict: FAIL,
      subject: subjectOf(ctx.page, attribute.nodePath),
      evidence: [nodeRef(ctx.page, attribute.nodePath)],
      summary: `lang="${attribute.value}" is not a well-formed BCP-47 language tag, so the passage's language cannot be resolved (WCAG 2.1 SC 3.1.2).`,
    }));
    return findings(...drafts);
  },
};

/** Family A, in catalogue order. */
export const pageDeclarationFamily: RuleFamily = {
  id: 'A. Page declaration',
  title: 'WCAG 2.1 SC 3.1.1 Language of Page / SC 3.1.2 Language of Parts',
  rules: [
    langMissing,
    langMalformed,
    langContradictsUrl,
    langContradictsPicker,
    langContradictsOgLocale,
    langContradictsContentLanguage,
    ogLocaleMalformed,
    langPartUnmarked,
    langPartMalformed,
  ],
};
