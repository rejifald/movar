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
 * Three deliberate shapes:
 *
 * - **`core/switch-bounces` reads the chain, and only as far as it goes.** A
 *   chain the collector abandoned at a ceiling of its own — its hop cap, or
 *   its request budget (`redirectChainTruncated`, one flag for both) — is
 *   published as a `warn` naming the hops it
 *   did see, never as a bounce and never as a `pass`: the last hop's
 *   `Location` names a URL nobody fetched, so "lands on" would be a claim
 *   about an end the collector never reached, and passing would be the same
 *   silence the evidence exists to break.
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

import { declaredLanguageOf, presentLang } from '../bcp47';
import { TRAVERSAL_ONLY } from '../capability';
import type { Capability } from '../capability';
import type {
  AlternateLink,
  NodePath,
  PageEvidence,
  ProbeEvidence,
  RedirectHop,
} from '../evidence';
import type { EvidenceRef, FindingDraft, FindingSubject, GroundedFindingDraft } from '../finding';
import { nodeRef, pageRef } from '../finding';
import type { Locator } from '../locator';
import {
  declaredLocator,
  locatorOf,
  parseLocator,
  resolveTargetPage,
  sameLocation,
  tryUrl,
} from '../locator';
import type { Determination } from '../served-language';
import { servedLanguage } from '../served-language';
import type { CoreRule, RuleContext, RuleFamily, RuleOutcome } from '../rule';
import { findings, notApplicable, pass } from '../rule';
import { urlLanguageMarker } from '../url-language';
import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

/** `core/switch-bounces` reads "`http` + `traversal`" — a genuine AND. */
const HTTP_AND_TRAVERSAL: readonly Capability[] = ['http', 'traversal'];
const BROWSER_ONLY: readonly Capability[] = ['browser'];

const DECLARED = 'declared' as const;
const OBSERVED = 'observed' as const;
const PAGE = 'page' as const;
const FAIL = 'fail' as const;
const WARN = 'warn' as const;
const INFO = 'info' as const;
const CLASSIFIED = 'classified' as const;

const X_DEFAULT = 'x-default';
const ROOT_PATH = '/';

const NO_LANG = '<html> declares no lang — core/lang-missing owns that case';
const NO_CROSS_LANGUAGE_TARGET = 'the page declares no target in another language';
const NO_RESOLVED_TARGET =
  'no declared target resolved to a collected page — core/hreflang-target-unresolvable owns that case';

/* -------------------------------------------------------------------------- */
/* Evidence plumbing — `subjectOf` stays local: a switch target's `nodePath`  */
/* is `NodePath | null` (never absent-by-omission), unlike the rest of the    */
/* catalogue's `NodePath | undefined`.                                       */
/* -------------------------------------------------------------------------- */

/** `exactOptionalPropertyTypes` is on: absent fields are omitted, never `undefined`. */
function subjectOf(page: PageEvidence, node: NodePath | null): FindingSubject {
  return {
    ...(page.url === undefined ? {} : { url: page.url }),
    ...(page.path === undefined ? {} : { path: page.path }),
    ...(node === null ? {} : { node }),
  };
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

/**
 * The declared source language and own locator `core/switch-bounces` and
 * `core/switch-loses-path` both need before either can look at a declared
 * target at all. Centralizing the guard is what keeps their two
 * `notApplicable` reasons from drifting apart.
 */
function sourceOrigin(
  page: PageEvidence,
): RuleOutcome | { readonly language: string; readonly locator: Locator } {
  const language = pageLanguage(page);
  if (language === null) return notApplicable(NO_LANG);
  const locator = locatorOf(page);
  if (locator === null) {
    return notApplicable('the page carries neither a URL nor a build path');
  }
  return { language, locator };
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
    return `The ${source} page declares a ${target.language} version at ${target.href}, but that page declares no language of its own and ${matched} of ${examined} text nodes classify as ${determination.language} — following the switch does not change the language.`;
  }
  return `The ${source} page declares a ${target.language} version at ${target.href}, but following that ${target.source} serves ${determination.language} again — the switch does not change the language.`;
}

/**
 * One cross-language target's resolution: unresolved against the collected
 * page set, or a `switch-no-effect` finding when following it serves the
 * source language again. Split out of `run` so the loop below states only
 * the two counters every family-D rule accumulates, not each target's own
 * decision.
 */
function noEffectFindingForTarget(
  ctx: RuleContext<'page'>,
  source: string,
  candidates: readonly LanguageCode[],
  target: SwitchTarget,
): { readonly resolved: boolean; readonly draft: FindingDraft | null } {
  const page = resolveTargetPage(ctx.pages, ctx.page, target.href);
  if (page === null) return { resolved: false, draft: null };
  const served = servedLanguage(page, ctx.classify, candidates);
  if (served?.language !== source) return { resolved: true, draft: null };
  return {
    resolved: true,
    draft: hybridDraft(
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
  };
}

/**
 * The accumulation `core/switch-no-effect` and `core/switch-loses-path` both
 * walk: try every cross-language target, count how many resolved against the
 * collected page set, and collect whatever findings resolving them produced.
 * Only what "resolve one target" means differs between the two rules — that
 * is `resolve`'s job — so it belongs in one place rather than two identical
 * loops.
 */
function targetsResolution(
  targets: readonly SwitchTarget[],
  resolve: (target: SwitchTarget) => {
    readonly resolved: boolean;
    readonly draft: FindingDraft | null;
  },
): RuleOutcome {
  const drafts: FindingDraft[] = [];
  let resolved = 0;
  for (const target of targets) {
    const outcome = resolve(target);
    if (outcome.resolved) resolved += 1;
    if (outcome.draft !== null) drafts.push(outcome.draft);
  }
  if (resolved === 0) return notApplicable(NO_RESOLVED_TARGET);
  return drafts.length === 0 ? pass() : findings(...drafts);
}

const switchNoEffect: CoreRule<'page'> = {
  id: 'core/switch-no-effect',
  title: 'Following the declared target serves the same language',
  /**
   * The catalogue reads "`static` | `traversal`" for this rule and
   * `core/switch-loses-path`: an alternation, not a conjunction. Filesystem
   * evidence grants `traversal` for free (`hasTraversal` in `capability.ts`),
   * so declaring `traversal` alone is exactly what the alternation means, and
   * the kernel adds the implied `static` for a page-scoped rule.
   */
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
    return targetsResolution(targets, (target) =>
      noEffectFindingForTarget(ctx, source, candidates, target),
    );
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
  const target = declaredLocator(from, href);
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

/** The chain's evidence refs, cited the same way whichever finding carries them. */
function chainEvidence(
  page: PageEvidence,
  target: SwitchTarget,
  probe: ProbeEvidence,
): readonly EvidenceRef[] {
  return [
    { kind: 'redirect-chain', probeId: probe.id },
    { kind: 'probe', probeId: probe.id },
    pageRef(page),
    ...(target.nodePath === null ? [] : [nodeRef(page, target.nodePath)]),
  ];
}

/**
 * A chain the collector abandoned at a ceiling of its own — its hop cap, or
 * its request budget running out mid-walk. One flag marks both, and this
 * finding serves both: the summary names the hops it did see and never counts
 * them against a ceiling, so it reads the same whichever one stopped the walk.
 *
 * Reported rather than passed over, and reported as what it is. The hops are
 * observed fact — a declared alternate that answers eleven redirects and no
 * page is a defect on its own terms — but the last one's `Location` names a
 * URL nobody fetched, so this must not say where the chain "lands": that is
 * the claim {@link bounceFinding} earns by having seen the end.
 */
function unfinishedChainFinding(
  page: PageEvidence,
  target: SwitchTarget,
  probe: ProbeEvidence,
): FindingDraft {
  const chain = probe.redirectChain;
  return {
    grounding: OBSERVED,
    verdict: WARN,
    subject: subjectOf(page, target.nodePath),
    evidence: chainEvidence(page, target, probe),
    summary: `The ${target.language} version declared at ${target.href} answers ${chainSummary(chain)} — ${chain.length} redirects without serving a page, and the collector stopped there rather than follow the chain further. Whether the declared ${target.language} version is reachable was not determined.`,
  };
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
    evidence: chainEvidence(page, target, probe),
    summary: `The ${target.language} version declared at ${target.href} answers ${chainSummary(probe.redirectChain)} and lands on ${destination.href}, the ${sourceLanguage} page the switch was meant to leave — the declared ${target.language} version cannot be reached.`,
  };
}

/**
 * One declared target's bounce check: not (yet) probed, probed but clean, a
 * chain the collector never saw the end of, or a `switch-bounces` finding.
 * Split out of `run` for the same reason as {@link noEffectFindingForTarget} —
 * the loop states only the counters, not each target's own decision.
 *
 * A truncated chain counts as **followed**, and it is the one case where that
 * must not settle into silence: the target was followed, eleven hops of it, so
 * calling it unfollowed would discard the chain the same way the collector
 * used to — and letting it through as clean would publish `pass` off a chain
 * whose end nobody saw.
 */
function bounceOutcomeForTarget(
  probes: readonly ProbeEvidence[],
  page: PageEvidence,
  source: Locator,
  sourceLanguage: string,
  target: SwitchTarget,
): { readonly followed: boolean; readonly draft: FindingDraft | null } {
  const probe = probeForTarget(probes, page, target.href);
  if (probe === null) return { followed: false, draft: null };
  if (probe.redirectChainTruncated === true) {
    return { followed: true, draft: unfinishedChainFinding(page, target, probe) };
  }
  const destination = finalDestination(probe.redirectChain);
  if (destination === null || !isBounce(destination, source, sourceLanguage, target)) {
    return { followed: true, draft: null };
  }
  return { followed: true, draft: bounceFinding(page, target, probe, destination, sourceLanguage) };
}

const switchBounces: CoreRule<'page'> = {
  id: 'core/switch-bounces',
  title: 'The target redirects back to the original language version',
  capabilities: HTTP_AND_TRAVERSAL,
  grounding: OBSERVED,
  scope: PAGE,
  run(ctx) {
    const origin = sourceOrigin(ctx.page);
    if (!('language' in origin)) return origin;
    const { language: sourceLanguage, locator: source } = origin;
    const targets = crossLanguageTargets(ctx.page, sourceLanguage);
    if (targets.length === 0) return notApplicable(NO_CROSS_LANGUAGE_TARGET);

    const drafts: FindingDraft[] = [];
    let followed = 0;

    for (const target of targets) {
      const outcome = bounceOutcomeForTarget(ctx.probes, ctx.page, source, sourceLanguage, target);
      if (outcome.followed) followed += 1;
      if (outcome.draft !== null) drafts.push(outcome.draft);
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

/**
 * One declared target's resolution: unresolved (no collected page, or one
 * with no locator of its own), or a `switch-loses-path` finding when it
 * lands on the site root. Split out of `run` for the same reason as
 * {@link noEffectFindingForTarget}.
 */
function losesPathOutcomeForTarget(
  pages: readonly PageEvidence[],
  page: PageEvidence,
  source: Locator,
  target: SwitchTarget,
): { readonly resolved: boolean; readonly draft: FindingDraft | null } {
  const resolvedPage = resolveTargetPage(pages, page, target.href);
  if (resolvedPage === null) return { resolved: false, draft: null };
  const landing = locatorOf(resolvedPage);
  if (landing === null) return { resolved: false, draft: null };
  if (!isSiteRoot(landing)) return { resolved: true, draft: null };
  return { resolved: true, draft: losesPathFinding(page, target, source, landing) };
}

const switchLosesPath: CoreRule<'page'> = {
  id: 'core/switch-loses-path',
  title: 'Switching lands on the homepage instead of the translated page',
  capabilities: TRAVERSAL_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const origin = sourceOrigin(ctx.page);
    if (!('language' in origin)) return origin;
    const { language: sourceLanguage, locator: source } = origin;
    if (isSiteRoot(source)) {
      return notApplicable('the page is the site root, so switching from it cannot lose a path');
    }
    const targets = crossLanguageTargets(ctx.page, sourceLanguage);
    if (targets.length === 0) return notApplicable(NO_CROSS_LANGUAGE_TARGET);

    return targetsResolution(targets, (target) =>
      losesPathOutcomeForTarget(ctx.pages, ctx.page, source, target),
    );
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
