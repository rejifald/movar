/**
 * **Family B — the hreflang mechanism.** Eight of the family's fifteen rules:
 * whether a page's own `hreflang` set is internally consistent, reciprocated
 * across the site, and resolves to real, correctly-served pages. The
 * remaining seven (`core/inventory-*`, `core/picker-*`) live in a sibling
 * file this one has no contact with.
 *
 * All eight are `declared`-grounded. `core/hreflang-target-wrong-language` is
 * the family's one hybrid: it prefers the target page's own `<html lang>`,
 * asking the classifier only when that is absent, and its classifier-answered
 * findings carry `via: 'classified'` so the kernel strips their failing power.
 *
 * Target resolution never fetches. A declared `href` is matched against
 * {@link RuleContext.pages} — the page set the collector already produced,
 * whether that came free from a filesystem build or from following a
 * declared target over the network (`traversal`). A target matching nothing
 * in that set is unresolvable; that is a finding, never a probe.
 *
 * @see ../../../../docs/movar-audit-rules.md — family B
 */

import { declaredLanguageOf, isWellFormedBCP47 } from '../bcp47';
import type { Capability } from '../capability';
import type { Classifier } from '../classifier';
import type { AlternateLink, NodePath, PageEvidence, ProbeEvidence } from '../evidence';
import type { Denominator, EvidenceRef, FindingSubject, GroundedFindingDraft } from '../finding';
import { alternateLanguage, X_DEFAULT } from '../inventory';
import type { Locator } from '../locator';
import { locatorOf, parseLocator, sameLocation, tryUrl } from '../locator';
import type { CoreRule, Rule } from '../rule';
import { findings, notApplicable, pass } from '../rule';
import { classifiablePageLanguage, classifySamples, textNodeDenominator } from '../text-samples';
import type { LanguageCode } from '@movar/lang-detect';

const STATIC_ONLY: readonly Capability[] = ['static'];
const SITE_ONLY: readonly Capability[] = ['site'];
const TRAVERSAL_ONLY: readonly Capability[] = ['traversal'];
const DECLARED = 'declared' as const;
const PAGE = 'page' as const;
const SITE = 'site' as const;
const FAIL = 'fail' as const;
const WARN = 'warn' as const;

const NO_ALTERNATES = 'the page declares no hreflang alternates';
const HTTP_STATUS_NOT_FOUND = 404;

/**
 * Resolution is the kernel's (`../locator`), not this file's: three other
 * families follow declared targets and all four must agree on what "the same
 * page" means. A local copy here missed directory-index normalization, so
 * `/uk/index.html` did not match a declared `/uk/` on filesystem evidence.
 *
 * These wrappers only tolerate `null` — a fragment-only or empty href declares
 * no target — so the call sites below stay readable.
 */
function sameLocator(one: Locator | null, other: Locator | null): boolean {
  return one !== null && other !== null && sameLocation(one, other);
}

function ownLocator(page: PageEvidence): Locator | null {
  return locatorOf(page);
}

function resolveTarget(
  pages: readonly PageEvidence[],
  locator: Locator | null,
): PageEvidence | null {
  if (locator === null) return null;
  return pages.find((page) => sameLocator(ownLocator(page), locator)) ?? null;
}

function locatorLabel(page: PageEvidence): string {
  return page.url ?? page.path ?? 'this page';
}

// Finding helpers, matching the page-declaration worked example.

function pageRef(page: PageEvidence): EvidenceRef {
  return { kind: 'page', pageId: page.id };
}

function nodeRef(page: PageEvidence, nodePath: NodePath): EvidenceRef {
  return { kind: 'node', pageId: page.id, nodePath };
}

/** `exactOptionalPropertyTypes` is on: absent fields are omitted, never `undefined`. */
function subjectOf(page: PageEvidence, node?: NodePath): FindingSubject {
  return {
    ...(page.url === undefined ? {} : { url: page.url }),
    ...(page.path === undefined ? {} : { path: page.path }),
    ...(node === undefined ? {} : { node }),
  };
}

function subjectAndEvidence(
  page: PageEvidence,
  alt: AlternateLink,
): { readonly subject: FindingSubject; readonly evidence: readonly EvidenceRef[] } {
  return {
    subject: subjectOf(page, alt.nodePath),
    evidence: alt.nodePath === undefined ? [pageRef(page)] : [nodeRef(page, alt.nodePath)],
  };
}

function presentLang(htmlLang: string | null): string | null {
  if (htmlLang === null) return null;
  const trimmed = htmlLang.trim();
  return trimmed === '' ? null : trimmed;
}

const hreflangSelfMissing: CoreRule<'page'> = {
  id: 'core/hreflang-self-missing',
  title: 'No self-referential hreflang on a page that declares alternates',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { alternates } = ctx.page.document;
    if (alternates.length === 0) return notApplicable(NO_ALTERNATES);
    const own = ownLocator(ctx.page);
    if (own === null) return notApplicable('the page carries neither a URL nor a build path');
    const selfReferenced = alternates.some((alt) => sameLocator(parseLocator(alt.href), own));
    if (selfReferenced) return pass();
    return findings({
      grounding: DECLARED,
      verdict: WARN,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page)],
      summary:
        'This page declares hreflang alternates for other languages but none of them links back to this page itself, so it is missing from its own translation set.',
    });
  },
};

function declaresLocator(page: PageEvidence, locator: Locator): boolean {
  return page.document.alternates.some((alt) => sameLocator(parseLocator(alt.href), locator));
}

const hreflangNotReciprocal: CoreRule<'site'> = {
  id: 'core/hreflang-not-reciprocal',
  title: 'An hreflang alternate is not declared back by its target',
  capabilities: SITE_ONLY,
  grounding: DECLARED,
  scope: SITE,
  run(ctx) {
    const drafts: GroundedFindingDraft[] = [];
    for (const source of ctx.pages) {
      const own = ownLocator(source);
      if (own === null) continue;
      for (const alt of source.document.alternates) {
        const targetLocator = parseLocator(alt.href);
        if (sameLocator(targetLocator, own)) continue; // a self-reference is trivially reciprocal
        const target = resolveTarget(ctx.pages, targetLocator);
        if (target === null || declaresLocator(target, own)) continue;
        drafts.push({
          grounding: DECLARED,
          verdict: FAIL,
          subject: subjectOf(source),
          evidence: [pageRef(source), pageRef(target)],
          summary: `${locatorLabel(source)} declares an hreflang alternate to ${locatorLabel(target)}, but ${locatorLabel(target)} does not declare one back, so the pair is not reciprocal.`,
        });
      }
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/** Groups by the *declared language*, not the literal string — `uk` and `uk-UA` name one code. */
function hreflangGroupKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === X_DEFAULT ? X_DEFAULT : declaredLanguageOf(trimmed);
}

/** A stable dedup key. `null` — no declared target — is its own bucket. */
function locatorKey(locator: Locator | null): string {
  return locator === null ? 'none' : JSON.stringify([locator.host, locator.path]);
}

function groupByCode(
  alternates: readonly AlternateLink[],
): ReadonlyMap<string, readonly AlternateLink[]> {
  const byCode = new Map<string, AlternateLink[]>();
  for (const alt of alternates) {
    const key = hreflangGroupKey(alt.hreflang);
    const entries = byCode.get(key) ?? [];
    entries.push(alt);
    byCode.set(key, entries);
  }
  return byCode;
}

/** The distinct hrefs a code resolves to, de-duplicated by locator so a repeated identical link is not a conflict. */
function distinctTargets(entries: readonly AlternateLink[]): readonly string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];
  for (const entry of entries) {
    const key = locatorKey(parseLocator(entry.href));
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(entry.href);
  }
  return distinct;
}

function duplicateDraft(
  page: PageEvidence,
  code: string,
  entries: readonly AlternateLink[],
  targets: readonly string[],
): GroundedFindingDraft {
  const evidence: EvidenceRef[] = [pageRef(page)];
  for (const entry of entries) {
    if (entry.nodePath !== undefined) evidence.push(nodeRef(page, entry.nodePath));
  }
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: subjectOf(page),
    evidence,
    summary: `hreflang="${code}" is declared ${entries.length} times on this page with different targets (${targets.join(', ')}), so user agents cannot resolve which one is correct.`,
  };
}

const hreflangDuplicate: CoreRule<'page'> = {
  id: 'core/hreflang-duplicate',
  title: 'The same hreflang code is declared twice with different targets',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const drafts: GroundedFindingDraft[] = [];
    for (const [code, entries] of groupByCode(ctx.page.document.alternates)) {
      const targets = distinctTargets(entries);
      if (targets.length > 1) drafts.push(duplicateDraft(ctx.page, code, entries, targets));
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

function isMalformedHreflang(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === X_DEFAULT ? false : !isWellFormedBCP47(trimmed);
}

const hreflangMalformed: CoreRule<'page'> = {
  id: 'core/hreflang-malformed',
  title: 'hreflang value is not a well-formed BCP-47 tag or x-default',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const malformed = ctx.page.document.alternates.filter((alt) =>
      isMalformedHreflang(alt.hreflang),
    );
    if (malformed.length === 0) return pass();
    return findings(
      ...malformed.map((alt): GroundedFindingDraft => {
        const { subject, evidence } = subjectAndEvidence(ctx.page, alt);
        return {
          grounding: DECLARED,
          verdict: FAIL,
          subject,
          evidence,
          summary: `hreflang="${alt.hreflang}" is not a well-formed BCP-47 language tag or "x-default", so user agents cannot resolve which language it declares.`,
        };
      }),
    );
  },
};

function isAbsoluteUrl(href: string): boolean {
  return tryUrl(href) !== null;
}

const hreflangTargetRelative: CoreRule<'page'> = {
  id: 'core/hreflang-target-relative',
  title: 'An hreflang target is not an absolute URL',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const relative = ctx.page.document.alternates.filter((alt) => !isAbsoluteUrl(alt.href));
    if (relative.length === 0) return pass();
    return findings(
      ...relative.map((alt): GroundedFindingDraft => {
        const { subject, evidence } = subjectAndEvidence(ctx.page, alt);
        return {
          grounding: DECLARED,
          verdict: WARN,
          subject,
          evidence,
          summary: `The hreflang="${alt.hreflang}" target "${alt.href}" is not an absolute URL, so search engines may fail to resolve it.`,
        };
      }),
    );
  },
};

function declaredLanguageCount(alternates: readonly AlternateLink[]): number {
  const codes = new Set<string>();
  for (const alt of alternates) {
    const language = alternateLanguage(alt);
    if (language !== null) codes.add(language);
  }
  return codes.size;
}

function hasXDefault(alternates: readonly AlternateLink[]): boolean {
  return alternates.some((alt) => alt.hreflang.trim().toLowerCase() === X_DEFAULT);
}

const hreflangXDefaultMissing: CoreRule<'page'> = {
  id: 'core/hreflang-x-default-missing',
  title: 'A multi-language page declares no x-default',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { alternates } = ctx.page.document;
    const languageCount = declaredLanguageCount(alternates);
    if (languageCount < 2)
      return notApplicable('the page declares fewer than two hreflang languages');
    if (hasXDefault(alternates)) return pass();
    return findings({
      grounding: DECLARED,
      verdict: WARN,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page)],
      summary: `This page declares hreflang for ${languageCount} languages but no x-default fallback, so a visitor whose language matches none of them has no defined destination.`,
    });
  },
};

function matchingProbe(
  probes: readonly ProbeEvidence[],
  locator: Locator | null,
): ProbeEvidence | null {
  if (locator === null) return null;
  return probes.find((probe) => sameLocator(parseLocator(probe.url), locator)) ?? null;
}

function unresolvableDraft(
  page: PageEvidence,
  alt: AlternateLink,
  probe: ProbeEvidence | null,
): GroundedFindingDraft {
  const { subject, evidence } = subjectAndEvidence(page, alt);
  const probeRef: EvidenceRef[] = probe === null ? [] : [{ kind: 'probe', probeId: probe.id }];
  const detail =
    probe?.status === HTTP_STATUS_NOT_FOUND
      ? 'returned a 404 response'
      : 'is absent from the collected page set';
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject,
    evidence: [...evidence, ...probeRef],
    summary: `The hreflang="${alt.hreflang}" target "${alt.href}" ${detail}, so the declared alternate cannot be reached.`,
  };
}

const hreflangTargetUnresolvable: CoreRule<'page'> = {
  id: 'core/hreflang-target-unresolvable',
  title: 'An hreflang target is absent from the collected page set',
  capabilities: TRAVERSAL_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { alternates } = ctx.page.document;
    if (alternates.length === 0) return notApplicable(NO_ALTERNATES);
    const own = ownLocator(ctx.page);
    const drafts: GroundedFindingDraft[] = [];
    for (const alt of alternates) {
      const locator = parseLocator(alt.href);
      if (own !== null && sameLocator(locator, own)) continue;
      if (resolveTarget(ctx.pages, locator) !== null) continue;
      drafts.push(unresolvableDraft(ctx.page, alt, matchingProbe(ctx.probes, locator)));
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/** The hybrid: prefers the target's own declaration, asks the classifier only when that is absent. */
interface DominantLanguage {
  readonly language: LanguageCode;
  readonly denominator: Denominator;
}

/** The majority classified language among a target page's sampled text, or `null` with nothing to classify. */
function dominantClassifiedLanguage(
  classify: Classifier,
  target: PageEvidence,
): DominantLanguage | null {
  const classified = classifySamples(classify, target.document.textNodes);
  const counts = new Map<LanguageCode, number>();
  let language: LanguageCode | null = null;
  let best = 0;
  for (const sample of classified) {
    const count = (counts.get(sample.verdict.language) ?? 0) + 1;
    counts.set(sample.verdict.language, count);
    if (count > best) {
      best = count;
      language = sample.verdict.language;
    }
  }
  return language === null
    ? null
    : { language, denominator: textNodeDenominator(target, classified.length) };
}

function declaredMismatchDraft(
  page: PageEvidence,
  alt: AlternateLink,
  target: PageEvidence,
  declared: string,
  served: string,
): GroundedFindingDraft {
  const { subject, evidence } = subjectAndEvidence(page, alt);
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject,
    evidence: [...evidence, pageRef(target)],
    summary: `The hreflang="${alt.hreflang}" target declares <html lang> as ${served}, not the ${declared} the alternate promises, so it serves the wrong language.`,
  };
}

function classifiedMismatchDraft(
  page: PageEvidence,
  alt: AlternateLink,
  target: PageEvidence,
  declared: string,
  dominant: DominantLanguage,
): GroundedFindingDraft {
  const { subject, evidence } = subjectAndEvidence(page, alt);
  return {
    grounding: DECLARED,
    via: 'classified',
    verdict: FAIL,
    subject,
    evidence: [...evidence, pageRef(target)],
    summary: `The hreflang="${alt.hreflang}" target carries no usable <html lang>; ${dominant.denominator.matched} of ${dominant.denominator.examined} sampled text nodes on that page classified ${dominant.language}, not the declared ${declared}.`,
    denominator: dominant.denominator,
  };
}

/**
 * `declared` (via {@link alternateLanguage}) is only for comparing against the
 * target's own declaration. The classifier branch recomputes its own
 * {@link classifiablePageLanguage} instead of reusing it — never compare a
 * declaration to a classifier verdict through the same normalization that
 * compares two declarations (see `bcp47.ts`).
 */
function wrongLanguageDraft(
  page: PageEvidence,
  classify: Classifier,
  alt: AlternateLink,
  target: PageEvidence,
  declared: string,
): GroundedFindingDraft | null {
  const tag = presentLang(target.document.htmlLang);
  if (tag !== null && isWellFormedBCP47(tag)) {
    const served = declaredLanguageOf(tag);
    return served === declared ? null : declaredMismatchDraft(page, alt, target, declared, served);
  }
  const declaredCode = classifiablePageLanguage(alt.hreflang);
  if (declaredCode === null) return null; // Movar ships no profile for this language — no evidence either way
  const dominant = dominantClassifiedLanguage(classify, target);
  if (dominant === null || dominant.language === declaredCode) return null;
  return classifiedMismatchDraft(page, alt, target, declaredCode, dominant);
}

const hreflangTargetWrongLanguage: CoreRule<'page'> = {
  id: 'core/hreflang-target-wrong-language',
  title: 'An hreflang target serves a language other than declared',
  capabilities: TRAVERSAL_ONLY,
  grounding: DECLARED,
  hybrid: true,
  scope: PAGE,
  run(ctx) {
    const { alternates } = ctx.page.document;
    if (alternates.length === 0) return notApplicable(NO_ALTERNATES);
    const drafts: GroundedFindingDraft[] = [];
    for (const alt of alternates) {
      const declared = alternateLanguage(alt);
      if (declared === null) continue; // x-default is routing, not a language
      const target = resolveTarget(ctx.pages, parseLocator(alt.href));
      if (target === null) continue; // unresolvable — core/hreflang-target-unresolvable's job
      const draft = wrongLanguageDraft(ctx.page, ctx.classify, alt, target, declared);
      if (draft !== null) drafts.push(draft);
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/** Family B's hreflang-mechanism rules, in catalogue order. The caller assembles family B from this array plus the sibling inventory/picker rules. */
export const hreflangRules: readonly Rule[] = [
  hreflangSelfMissing,
  hreflangNotReciprocal,
  hreflangDuplicate,
  hreflangMalformed,
  hreflangTargetRelative,
  hreflangXDefaultMissing,
  hreflangTargetUnresolvable,
  hreflangTargetWrongLanguage,
];
