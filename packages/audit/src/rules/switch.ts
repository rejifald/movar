/**
 * **Family D — switch integrity.** Does the language switcher switch?
 *
 * Verified by **fetching the declared target rather than clicking it**. A 301
 * chain is a fact that replays: no timing, no consent banner, no anti-bot in
 * the loop, and the same judgement runs offline against a built `dist/` where
 * the "next file" is right there. The browser tier appears in exactly one rule,
 * and only because a switcher with no navigable target cannot be followed at
 * all.
 *
 * The family's centre of gravity is `core/switch-bounces`: a `uk-ua` hreflang
 * that 301s straight back to the Russian URL. The site declares a Ukrainian
 * version, search engines index the declaration, and no user can ever reach it.
 * The evidence is the **complete redirect chain**, cited as a `redirect-chain`
 * ref — undeniable, replayable, and unambiguous about the fix.
 *
 * Two deliberate shapes:
 *
 * - **`core/switch-no-effect` is hybrid.** It prefers the target response's own
 *   `<html lang>` (`via: 'declared'`) and falls back to the classifier
 *   (`via: 'classified'` plus a denominator), which the kernel then strips of
 *   failing power. Only *cross-language* targets are considered — a
 *   self-referential hreflang obviously serves the same language, and reporting
 *   that would be a false accusation on correct markup.
 * - **`core/switch-requires-script` is `info`, never `pass`.** Confirming that a
 *   JavaScript-only switcher works for a human does not repair
 *   `core/picker-no-navigable-target`: crawlers and assistive technology still
 *   cannot reach the other languages.
 *
 * @see ../../../../docs/movar-audit-rules.md
 */

import { declaredLanguageOf } from '../bcp47';
import type { Capability } from '../capability';
import type { Classifier } from '../classifier';
import type {
  AlternateLink,
  NodePath,
  PageEvidence,
  ProbeEvidence,
  RedirectHop,
} from '../evidence';
import type {
  Denominator,
  EvidenceRef,
  FindingDraft,
  FindingSubject,
  GroundedFindingDraft,
  Via,
} from '../finding';
import type { Locator } from '../locator';
import { locatorOf, parseLocator, resolveTargetPage, sameLocation, tryUrl } from '../locator';
import type { CoreRule, RuleFamily } from '../rule';
import { findings, notApplicable, pass } from '../rule';
import { urlLanguageMarker } from '../url-language';
import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

/**
 * The catalogue reads "`static` | `traversal`" for three of these rules: an
 * alternation, not a conjunction. Filesystem evidence grants `traversal` for
 * free (`hasTraversal` in `capability.ts` — the next file is right there), so
 * declaring `traversal` alone is exactly what the alternation means, and the
 * kernel adds the implied `static` for a page-scoped rule.
 */
const TRAVERSAL_ONLY: readonly Capability[] = ['traversal'];
/** `core/switch-bounces` reads "`http` + `traversal`" — a genuine AND. */
const HTTP_AND_TRAVERSAL: readonly Capability[] = ['http', 'traversal'];
const BROWSER_ONLY: readonly Capability[] = ['browser'];

const DECLARED = 'declared' as const;
const OBSERVED = 'observed' as const;
const PAGE = 'page' as const;
const FAIL = 'fail' as const;
const INFO = 'info' as const;
const CLASSIFIED = 'classified' as const;

/** ≥2 candidates, or the classifier is a rubber stamp rather than a choice. */
const DIFFERENTIAL_MINIMUM = 2;

const X_DEFAULT = 'x-default';
const ROOT_PATH = '/';

const NO_LANG = '<html> declares no lang — core/lang-missing owns that case';
const NO_CROSS_LANGUAGE_TARGET = 'the page declares no target in another language';
const NO_RESOLVED_TARGET =
  'no declared target resolved to a collected page — core/hreflang-target-unresolvable owns that case';

/* -------------------------------------------------------------------------- */
/* Evidence plumbing                                                          */
/* -------------------------------------------------------------------------- */

function pageRef(page: PageEvidence): EvidenceRef {
  return { kind: 'page', pageId: page.id };
}

function nodeRef(page: PageEvidence, nodePath: NodePath): EvidenceRef {
  return { kind: 'node', pageId: page.id, nodePath };
}

/** `exactOptionalPropertyTypes` is on: absent fields are omitted, never `undefined`. */
function subjectOf(page: PageEvidence, node: NodePath | null): FindingSubject {
  return {
    ...(page.url === undefined ? {} : { url: page.url }),
    ...(page.path === undefined ? {} : { path: page.path }),
    ...(node === null ? {} : { node }),
  };
}

/** The declared tag, trimmed, or `null` when the attribute is absent or blank. */
function presentLang(htmlLang: string | null): string | null {
  if (htmlLang === null) return null;
  const trimmed = htmlLang.trim();
  return trimmed === '' ? null : trimmed;
}

/* -------------------------------------------------------------------------- */
/* Locators live in `../locator` — three families resolve declared targets and */
/* must agree on what "the same page" means.                                   */
/* -------------------------------------------------------------------------- */

/**
 * The path with a leading language segment removed. Strict alias matching only,
 * so the product slug `/ru-return-warranty` keeps its segment — the Bosch
 * regression, guarded here as well as in `url-language.ts`.
 */
function pathRemainder(path: string): string {
  const segments = path.split(ROOT_PATH).filter((segment) => segment !== '');
  const first = segments[0];
  if (first !== undefined && normalizeLanguageCode(first) !== null) segments.shift();
  return segments.length === 0 ? ROOT_PATH : `${ROOT_PATH}${segments.join(ROOT_PATH)}`;
}

function isSiteRoot(locator: Locator): boolean {
  return pathRemainder(locator.path) === ROOT_PATH;
}

/* -------------------------------------------------------------------------- */
/* Declared switch targets                                                     */
/* -------------------------------------------------------------------------- */

/** A target the site itself published as "the other language over here". */
interface SwitchTarget {
  readonly href: string;
  /** The language the site declares this target to be. */
  readonly language: string;
  readonly nodePath: NodePath | null;
  readonly source: string;
}

const HREFLANG_SOURCE = 'hreflang alternate';
const PICKER_SOURCE = 'picker entry';

function alternateTarget(alternate: AlternateLink): SwitchTarget | null {
  const value = alternate.hreflang.trim();
  if (value === '' || value.toLowerCase() === X_DEFAULT) return null;
  return {
    href: alternate.href,
    language: declaredLanguageOf(value),
    nodePath: alternate.nodePath ?? null,
    source: HREFLANG_SOURCE,
  };
}

/**
 * Every navigable target the page declares, from its hreflang alternates and
 * its picker. Declaration only — nothing here is inferred by probing.
 */
function declaredTargets(page: PageEvidence): readonly SwitchTarget[] {
  const targets: SwitchTarget[] = [];
  for (const alternate of page.document.alternates) {
    const target = alternateTarget(alternate);
    if (target !== null) targets.push(target);
  }
  const { picker } = page.document;
  if (picker === null) return targets;
  for (const option of picker.options) {
    if (option.href === null || option.active) continue;
    const language = normalizeLanguageCode(option.label);
    if (language === null) continue;
    targets.push({
      href: option.href,
      language,
      nodePath: option.nodePath,
      source: PICKER_SOURCE,
    });
  }
  return targets;
}

/** Targets that promise a *different* language. A self-alternate is correct markup. */
function crossLanguageTargets(page: PageEvidence, language: string): readonly SwitchTarget[] {
  return declaredTargets(page).filter((target) => target.language !== language);
}

/** The page's own declared language, or `null` when it declares none. */
function pageLanguage(page: PageEvidence): string | null {
  const tag = presentLang(page.document.htmlLang);
  return tag === null ? null : declaredLanguageOf(tag);
}

/** What the classifier is allowed to choose between: the languages in play. */
function candidatesOf(source: string, targets: readonly SwitchTarget[]): readonly LanguageCode[] {
  const codes = new Set<LanguageCode>();
  for (const language of [source, ...targets.map((target) => target.language)]) {
    const code = normalizeLanguageCode(language);
    if (code !== null) codes.add(code);
  }
  return [...codes];
}

/* -------------------------------------------------------------------------- */
/* The hybrid seam: what language did the target actually serve?               */
/* -------------------------------------------------------------------------- */

interface Determination {
  readonly language: string;
  readonly via: Via;
  readonly denominator?: Denominator;
}

function classifiedLanguage(
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
    denominator: { examined: samples.length, matched },
  };
}

/** Prefer the response's own declaration; the classifier answers only when it is absent. */
function servedLanguage(
  page: PageEvidence,
  classify: Classifier,
  candidates: readonly LanguageCode[],
): Determination | null {
  const declared = pageLanguage(page);
  if (declared !== null) return { language: declared, via: DECLARED };
  return classifiedLanguage(page, classify, candidates);
}

/** Everything a hybrid finding carries except the grounding fields the seam owns. */
type HybridBase = Omit<GroundedFindingDraft, 'grounding' | 'via' | 'denominator'>;

function hybridDraft(base: HybridBase, determination: Determination): FindingDraft {
  return {
    ...base,
    grounding: DECLARED,
    via: determination.via,
    ...(determination.denominator === undefined ? {} : { denominator: determination.denominator }),
  };
}

/* -------------------------------------------------------------------------- */
/* D1 — core/switch-no-effect (hybrid)                                         */
/* -------------------------------------------------------------------------- */

function noEffectSummary(
  target: SwitchTarget,
  source: string,
  determination: Determination,
): string {
  if (determination.via === CLASSIFIED) {
    const { examined = 0, matched = 0 } = determination.denominator ?? {};
    return `The ${source} page declares a ${target.language} version at ${target.href}, but that page declares no language of its own and ${matched} of ${examined} sampled text nodes classify as ${determination.language} — following the switch does not change the language.`;
  }
  return `The ${source} page declares a ${target.language} version at ${target.href}, but following that ${target.source} serves ${determination.language} again — the switch does not change the language.`;
}

const switchNoEffect: CoreRule<'page'> = {
  id: 'core/switch-no-effect',
  title: 'Following the declared target serves the same language',
  capabilities: TRAVERSAL_ONLY,
  grounding: DECLARED,
  hybrid: true,
  scope: PAGE,
  run(ctx) {
    const source = pageLanguage(ctx.page);
    if (source === null) return notApplicable(NO_LANG);
    const targets = crossLanguageTargets(ctx.page, source);
    if (targets.length === 0) return notApplicable(NO_CROSS_LANGUAGE_TARGET);

    const candidates = candidatesOf(source, targets);
    const drafts: FindingDraft[] = [];
    let resolved = 0;

    for (const target of targets) {
      const page = resolveTargetPage(ctx.pages, ctx.page, target.href);
      if (page === null) continue;
      resolved += 1;
      const served = servedLanguage(page, ctx.classify, candidates);
      if (served === null) continue;
      if (served.language !== source) continue;
      drafts.push(
        hybridDraft(
          {
            verdict: FAIL,
            subject: subjectOf(ctx.page, target.nodePath),
            evidence: [
              pageRef(ctx.page),
              pageRef(page),
              ...(target.nodePath === null ? [] : [nodeRef(ctx.page, target.nodePath)]),
            ],
            summary: noEffectSummary(target, source, served),
          },
          served,
        ),
      );
    }

    if (resolved === 0) return notApplicable(NO_RESOLVED_TARGET);
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* D2 — core/switch-bounces                                                    */
/* -------------------------------------------------------------------------- */

/** Where a redirect chain actually ended up, with the href kept for the marker read. */
interface Destination {
  readonly href: string;
  readonly locator: Locator;
}

function finalDestination(chain: readonly RedirectHop[]): Destination | null {
  const last = chain.at(-1);
  if (last === undefined) return null;
  const url = tryUrl(last.location, last.url);
  const href = url?.href ?? last.location;
  const locator = parseLocator(href);
  return locator === null ? null : { href, locator };
}

function probeForTarget(
  probes: readonly ProbeEvidence[],
  from: PageEvidence,
  href: string,
): ProbeEvidence | null {
  const target = parseLocator(href, from.url);
  if (target === null) return null;
  return (
    probes.find((probe) => {
      const locator = parseLocator(probe.url);
      return locator !== null && sameLocation(locator, target);
    }) ?? null
  );
}

/**
 * A bounce is the chain landing back where the switch started: the source page
 * itself, or another URL marked with the source language rather than the one
 * the target declared.
 */
function isBounce(
  destination: Destination,
  source: Locator,
  sourceLanguage: string,
  target: SwitchTarget,
): boolean {
  if (sameLocation(destination.locator, source)) return true;
  const marker = urlLanguageMarker(destination.href);
  if (marker === null) return false;
  return marker.language === sourceLanguage && marker.language !== target.language;
}

function chainSummary(chain: readonly RedirectHop[]): string {
  return chain.map((hop) => hop.status).join(' → ');
}

function bounceFinding(
  page: PageEvidence,
  target: SwitchTarget,
  probe: ProbeEvidence,
  destination: Destination,
  sourceLanguage: string,
): FindingDraft {
  return {
    grounding: OBSERVED,
    verdict: FAIL,
    subject: subjectOf(page, target.nodePath),
    evidence: [
      { kind: 'redirect-chain', probeId: probe.id },
      { kind: 'probe', probeId: probe.id },
      pageRef(page),
      ...(target.nodePath === null ? [] : [nodeRef(page, target.nodePath)]),
    ],
    summary: `The ${target.language} version declared at ${target.href} answers ${chainSummary(probe.redirectChain)} and lands on ${destination.href}, the ${sourceLanguage} page the switch was meant to leave — the declared ${target.language} version cannot be reached.`,
  };
}

const switchBounces: CoreRule<'page'> = {
  id: 'core/switch-bounces',
  title: 'The target redirects back to the original language version',
  capabilities: HTTP_AND_TRAVERSAL,
  grounding: OBSERVED,
  scope: PAGE,
  run(ctx) {
    const sourceLanguage = pageLanguage(ctx.page);
    if (sourceLanguage === null) return notApplicable(NO_LANG);
    const source = locatorOf(ctx.page);
    if (source === null) return notApplicable('the page carries neither a URL nor a build path');
    const targets = crossLanguageTargets(ctx.page, sourceLanguage);
    if (targets.length === 0) return notApplicable(NO_CROSS_LANGUAGE_TARGET);

    const drafts: FindingDraft[] = [];
    let followed = 0;

    for (const target of targets) {
      const probe = probeForTarget(ctx.probes, ctx.page, target.href);
      if (probe === null) continue;
      followed += 1;
      const destination = finalDestination(probe.redirectChain);
      if (destination === null) continue;
      if (!isBounce(destination, source, sourceLanguage, target)) continue;
      drafts.push(bounceFinding(ctx.page, target, probe, destination, sourceLanguage));
    }

    if (followed === 0) {
      return notApplicable('no probe followed a target this page declares');
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* D3 — core/switch-loses-path                                                 */
/* -------------------------------------------------------------------------- */

function losesPathFinding(
  page: PageEvidence,
  target: SwitchTarget,
  source: Locator,
  landing: Locator,
): FindingDraft {
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: subjectOf(page, target.nodePath),
    evidence: [
      pageRef(page),
      ...(target.nodePath === null ? [] : [nodeRef(page, target.nodePath)]),
    ],
    summary: `Switching to ${target.language} from ${source.path} lands on ${landing.path}, the site root, instead of the ${target.language} version of ${pathRemainder(source.path)}.`,
  };
}

const switchLosesPath: CoreRule<'page'> = {
  id: 'core/switch-loses-path',
  title: 'Switching lands on the homepage instead of the translated page',
  capabilities: TRAVERSAL_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const sourceLanguage = pageLanguage(ctx.page);
    if (sourceLanguage === null) return notApplicable(NO_LANG);
    const source = locatorOf(ctx.page);
    if (source === null) return notApplicable('the page carries neither a URL nor a build path');
    if (isSiteRoot(source)) {
      return notApplicable('the page is the site root, so switching from it cannot lose a path');
    }
    const targets = crossLanguageTargets(ctx.page, sourceLanguage);
    if (targets.length === 0) return notApplicable(NO_CROSS_LANGUAGE_TARGET);

    const drafts: FindingDraft[] = [];
    let resolved = 0;

    for (const target of targets) {
      const page = resolveTargetPage(ctx.pages, ctx.page, target.href);
      if (page === null) continue;
      const landing = locatorOf(page);
      if (landing === null) continue;
      resolved += 1;
      if (!isSiteRoot(landing)) continue;
      drafts.push(losesPathFinding(ctx.page, target, source, landing));
    }

    if (resolved === 0) return notApplicable(NO_RESOLVED_TARGET);
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* D4 — core/switch-requires-script                                            */
/* -------------------------------------------------------------------------- */

const switchRequiresScript: CoreRule<'page'> = {
  id: 'core/switch-requires-script',
  title: 'A switcher with no navigable target does work when clicked',
  capabilities: BROWSER_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    // Deliberately `info` and never `pass`: a switcher that works under script
    // is still unreachable to a crawler, so confirming it does not repair
    // core/picker-no-navigable-target.
    if (!ctx.page.rendered) {
      return notApplicable('this page digest came from a static tier, not a rendered one');
    }
    const { picker } = ctx.page.document;
    if (picker === null) return notApplicable('the page exposes no language picker');

    const scriptOnly = picker.options.filter((option) => option.href === null && !option.active);
    if (scriptOnly.length === 0) {
      return notApplicable('every picker entry exposes a URL, so no script is needed to follow it');
    }

    const labels = scriptOnly.map((option) => option.label).join(', ');
    return findings({
      grounding: DECLARED,
      verdict: INFO,
      subject: subjectOf(ctx.page, picker.nodePath),
      evidence: [pageRef(ctx.page), nodeRef(ctx.page, picker.nodePath)],
      summary: `A rendered browser resolved ${scriptOnly.length} of ${picker.options.length} entries in this ${picker.kind} switcher (${labels}) that expose no URL: the switcher works for a person running JavaScript, and remains unreachable to search engines and assistive technology — see core/picker-no-navigable-target.`,
    });
  },
};

/** Family D — the hreflang-bounce class, and the rest of switch integrity. */
export const switchFamily: RuleFamily = {
  id: 'D. Switch',
  title: 'Switch integrity — does the language switcher switch?',
  rules: [switchNoEffect, switchBounces, switchLosesPath, switchRequiresScript],
};
