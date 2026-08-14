/**
 * **Family C — serving behaviour.** The response matrix: the same URL fetched N
 * times varying only `Accept-Language`, everything else identical. This family
 * cannot run on static evidence at all, and says so rather than passing.
 *
 * Every rule here is `observed`-grounded: the witness is an HTTP fact — byte
 * identity, a response header, a per-vantage difference — never a judgement
 * about prose. Two of them (`core/serving-header-partial`,
 * `core/serving-declared-never-served`) must additionally answer "what language
 * was this response in?", so they are **hybrid**: they prefer the response's own
 * `<html lang>` and record `via: 'declared'`, and fall back to the classifier
 * with `via: 'classified'` plus a denominator, which the kernel then strips of
 * failing power.
 *
 * Three invariants are load-bearing here:
 *
 * 1. **`core/serving-header-ignored` needs no language determination at all.**
 *    Byte identity across ≥2 `Accept-Language` values is a fact the site cannot
 *    dispute. It touches neither `<html lang>` nor the classifier, and that is
 *    what makes it the most defensible finding the tool produces.
 * 2. **A leg is (url, vantage, cookieState).** That is exactly how
 *    `matrixLegKey` in `capability.ts` decided this evidence *has* a matrix, and
 *    re-deriving it differently would let a rule adjudicate a group the
 *    capability never admitted.
 * 3. **A vantage's country is a claim.** `core/serving-decided-by-ip` words
 *    every finding so an unverified claim reads as a claim — `Vantage.country`
 *    is `{ claimed, verified? }` by design.
 *
 * @see ../../../../docs/movar-audit-rules.md
 */

import { declaredLanguageOf, presentLang } from '../bcp47';
import type { Capability } from '../capability';
import type { Determination } from '../served-language';
import { mergedDenominator, servedLanguage, weakestVia } from '../served-language';
import { matrixLegKey, NO_PREFERENCE_KEY } from '../capability';
import type { Classifier } from '../classifier';
import type { PageEvidence, ProbeEvidence, Vantage } from '../evidence';
import { siteInventory } from '../inventory';
import type { EvidenceRef, FindingDraft, GroundedFindingDraft, Via } from '../finding';
import { pageRef } from '../finding';
import type { CoreRule, RuleFamily } from '../rule';
import { findings, notApplicable, pass } from '../rule';
import { normalizeBCP47, normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

const HTTP_ONLY: readonly Capability[] = ['http'];
const MATRIX_ONLY: readonly Capability[] = ['matrix'];
const MULTI_VANTAGE_ONLY: readonly Capability[] = ['multi-vantage'];

const OBSERVED = 'observed' as const;
const SITE = 'site' as const;
/** Findings name one URL, even though the matrix rules run once for the run. */
const PAGE_SCOPE = 'page' as const;
const FAIL = 'fail' as const;
const WARN = 'warn' as const;
const INFO = 'info' as const;
const CLASSIFIED = 'classified' as const;

/** ≥2 of anything is what every differential question needs. */
const DIFFERENTIAL_MINIMUM = 2;

const VARY_HEADER = 'vary';
const ACCEPT_LANGUAGE_FIELD = 'accept-language';
const ANY_FIELD = '*';

const NO_HASHES =
  'the collector recorded no response body hashes, so byte identity cannot be asserted';

/* -------------------------------------------------------------------------- */
/* Evidence plumbing                                                          */
/* -------------------------------------------------------------------------- */

function probeRef(probe: ProbeEvidence): EvidenceRef {
  return { kind: 'probe', probeId: probe.id };
}

/** The page a probe produced, when it produced one. */
function pageOfProbe(pages: readonly PageEvidence[], probe: ProbeEvidence): PageEvidence | null {
  if (probe.pageId === undefined) return null;
  return pages.find((page) => page.id === probe.pageId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Grouping — the matrix leg, exactly as `capability.ts` defines it            */
/* -------------------------------------------------------------------------- */

/**
 * Everything a matrix leg holds identical while `Accept-Language` varies.
 * The kernel's own definition, imported rather than mirrored: a rule that
 * grouped probes any other way would adjudicate a set `matrix` never admitted.
 */
const legKey = matrixLegKey;

/** Everything held identical while the *vantage* varies. The geo mirror of {@link legKey}. */
function vantageLegKey(probe: ProbeEvidence): string {
  return `${probe.url} ${headerKey(probe)} ${probe.cookieState}`;
}

/** The no-preference leg needs a key of its own; `capability.ts` uses the same sentinel. */
function headerKey(probe: ProbeEvidence): string {
  return probe.acceptLanguage ?? NO_PREFERENCE_KEY;
}

/** How the report says what a probe asked for. */
function headerLabel(probe: ProbeEvidence): string {
  return probe.acceptLanguage === null
    ? 'no Accept-Language'
    : `Accept-Language: ${probe.acceptLanguage}`;
}

function groupProbes(
  probes: readonly ProbeEvidence[],
  key: (probe: ProbeEvidence) => string,
): readonly (readonly ProbeEvidence[])[] {
  const groups = new Map<string, ProbeEvidence[]>();
  for (const probe of probes) {
    const group = groups.get(key(probe));
    if (group === undefined) groups.set(key(probe), [probe]);
    else group.push(probe);
  }
  return [...groups.values()];
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/** The groups that actually are a matrix: one leg, ≥2 different header values. */
function matrixLegs(probes: readonly ProbeEvidence[]): readonly (readonly ProbeEvidence[])[] {
  return groupProbes(probes, legKey).filter(
    (leg) => distinct(leg.map(headerKey)).length >= DIFFERENTIAL_MINIMUM,
  );
}

/** The URL a leg is about. Every probe in a leg shares it by construction. */
function legUrl(leg: readonly ProbeEvidence[]): string {
  return leg[0]?.url ?? '';
}

/* -------------------------------------------------------------------------- */
/* The declared inventory                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The language inventory, per the catalogue's definition: the union of what the
 * site **declares**. The derivation lives in `../inventory` because family B
 * adjudicates it and family F turns on it — one definition, or three families
 * answer "what did this site promise?" differently.
 */
function declaredInventory(pages: readonly PageEvidence[]): ReadonlySet<string> {
  return siteInventory(pages).languages;
}

/** The candidate set the classifier is allowed to choose between. */
function candidatesOf(inventory: ReadonlySet<string>): readonly LanguageCode[] {
  const codes = new Set<LanguageCode>();
  for (const language of inventory) {
    const code = normalizeLanguageCode(language);
    if (code !== null) codes.add(code);
  }
  return [...codes];
}

/**
 * The language a probe asked for. `Accept-Language` is a q-list; only the
 * leading tag is a preference the site can be held to.
 */
function requestedLanguage(probe: ProbeEvidence): LanguageCode | null {
  if (probe.acceptLanguage === null) return null;
  const leading = probe.acceptLanguage.split(',')[0]?.split(';')[0]?.trim() ?? '';
  if (leading === '') return null;
  return normalizeBCP47(leading);
}

/* -------------------------------------------------------------------------- */
/* The hybrid seam: what language did this response serve?                    */
/* -------------------------------------------------------------------------- */

/**
 * A served-language answer, tagged with which source produced it. `declared`
 * keeps a finding's failing power; `classified` costs it, and owes a
 * denominator.
 */

/** The parenthetical that keeps a classified summary honest about its source. */
function viaNote(via: Via): string {
  return via === CLASSIFIED
    ? ' (served language read from sampled text — the response declares none)'
    : '';
}

/** Everything one probe of a leg contributed. */
interface ProbeReading {
  readonly probe: ProbeEvidence;
  readonly page: PageEvidence | null;
  readonly requested: LanguageCode | null;
  readonly served: Determination | null;
}

function readLeg(
  leg: readonly ProbeEvidence[],
  pages: readonly PageEvidence[],
  classify: Classifier,
  candidates: readonly LanguageCode[],
): readonly ProbeReading[] {
  return leg.map((probe) => {
    const page = pageOfProbe(pages, probe);
    return {
      probe,
      page,
      requested: requestedLanguage(probe),
      served: servedLanguage(page, classify, candidates),
    };
  });
}

/** The readings that asked for a language the site declared, and got an answer. */
function adjudicableReadings(
  readings: readonly ProbeReading[],
  inventory: ReadonlySet<string>,
): readonly ProbeReading[] {
  return readings.filter(
    (reading) =>
      reading.requested !== null && inventory.has(reading.requested) && reading.served !== null,
  );
}

function readingRefs(readings: readonly ProbeReading[]): readonly EvidenceRef[] {
  return readings.flatMap((reading) => [
    probeRef(reading.probe),
    ...(reading.page === null ? [] : [pageRef(reading.page)]),
  ]);
}

function determinationsOf(readings: readonly ProbeReading[]): readonly Determination[] {
  return readings.flatMap((reading) => (reading.served === null ? [] : [reading.served]));
}

/** Everything a hybrid finding carries except the grounding fields the seam owns. */
type HybridBase = Omit<GroundedFindingDraft, 'grounding' | 'via' | 'denominator'>;

/** Assemble a hybrid draft, attaching the denominator the kernel will demand. */
function hybridDraft(base: HybridBase, determinations: readonly Determination[]): FindingDraft {
  const via = weakestVia(determinations);
  const denominator = mergedDenominator(determinations);
  return {
    ...base,
    grounding: OBSERVED,
    via,
    ...(denominator === undefined ? {} : { denominator }),
  };
}

/* -------------------------------------------------------------------------- */
/* C1 — core/serving-default-language                                         */
/* -------------------------------------------------------------------------- */

function defaultLanguageFinding(
  pages: readonly PageEvidence[],
  probe: ProbeEvidence,
): FindingDraft {
  const page = pageOfProbe(pages, probe);
  const declared = page === null ? null : presentLang(page.document.htmlLang);
  return {
    grounding: OBSERVED,
    verdict: INFO,
    scope: PAGE_SCOPE,
    subject: { url: probe.url },
    evidence: [probeRef(probe), ...(page === null ? [] : [pageRef(page)])],
    summary:
      declared === null
        ? `With no Accept-Language stated, ${probe.url} answered ${probe.status} with a response that declares no page language, so the default cannot be read from the site's own markup.`
        : `With no Accept-Language stated, ${probe.url} answered ${probe.status} and declared <html lang="${declared}"> (${declaredLanguageOf(declared)}) — the default every other serving finding reads against.`,
  };
}

const servingDefaultLanguage: CoreRule<'site'> = {
  id: 'core/serving-default-language',
  title: 'What language loads with no stated preference',
  capabilities: HTTP_ONLY,
  grounding: OBSERVED,
  scope: SITE,
  run(ctx) {
    const noPreference = ctx.probes.filter((probe) => probe.acceptLanguage === null);
    if (noPreference.length === 0) {
      return notApplicable(
        'every probe stated an Accept-Language, so the run observed no no-preference leg',
      );
    }
    return findings(...noPreference.map((probe) => defaultLanguageFinding(ctx.pages, probe)));
  },
};

/* -------------------------------------------------------------------------- */
/* C2 — core/serving-header-ignored                                           */
/* -------------------------------------------------------------------------- */

/** Byte identity is only assertable when every probe in the leg carries a hash. */
function isHashed(leg: readonly ProbeEvidence[]): boolean {
  return leg.every((probe) => probe.bodyHash !== undefined);
}

function bodyHashes(leg: readonly ProbeEvidence[]): readonly string[] {
  return leg.flatMap((probe) => (probe.bodyHash === undefined ? [] : [probe.bodyHash]));
}

function headerIgnoredFinding(
  leg: readonly ProbeEvidence[],
  inventory: ReadonlySet<string>,
): FindingDraft {
  const headers = distinct(leg.map(headerLabel));
  return {
    grounding: OBSERVED,
    verdict: FAIL,
    scope: PAGE_SCOPE,
    subject: { url: legUrl(leg) },
    evidence: leg.map(probeRef),
    summary: `${legUrl(leg)} returned a byte-identical response body for all ${headers.length} header values tested (${headers.join(', ')}), while the site declares ${inventory.size} languages (${[...inventory].join(', ')}).`,
  };
}

const servingHeaderIgnored: CoreRule<'site'> = {
  id: 'core/serving-header-ignored',
  title: 'Responses are byte-identical across every header value, with >1 declared',
  capabilities: MATRIX_ONLY,
  grounding: OBSERVED,
  scope: SITE,
  run(ctx) {
    const inventory = declaredInventory(ctx.pages);
    if (inventory.size < DIFFERENTIAL_MINIMUM) {
      return notApplicable(
        'the site declares fewer than two languages, so one response body for every header is not a broken promise',
      );
    }
    const legs = matrixLegs(ctx.probes).filter(isHashed);
    if (legs.length === 0) return notApplicable(NO_HASHES);

    const drafts = legs
      .filter((leg) => distinct(bodyHashes(leg)).length === 1)
      .map((leg) => headerIgnoredFinding(leg, inventory));
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/**
 * The walk `core/serving-header-partial` and `core/serving-declared-never-served`
 * both do: derive the site's declared inventory and candidate set once, then
 * visit every matrix leg's raw readings. `adjudicate` returns `null` for a leg
 * that answers neither rule's question, or the (possibly empty) drafts a leg
 * that *is* adjudicable produced — the two counters both rules report against
 * (`adjudicated` legs, cited `drafts`) are accumulated here so neither rule
 * has to restate the loop shape around its own decision.
 */
function walkMatrixLegs(
  pages: readonly PageEvidence[],
  probes: readonly ProbeEvidence[],
  classify: Classifier,
  adjudicate: (
    leg: readonly ProbeEvidence[],
    readings: readonly ProbeReading[],
    inventory: ReadonlySet<string>,
  ) => readonly FindingDraft[] | null,
): { readonly adjudicated: number; readonly drafts: readonly FindingDraft[] } {
  const inventory = declaredInventory(pages);
  const candidates = candidatesOf(inventory);
  const drafts: FindingDraft[] = [];
  let adjudicated = 0;
  for (const leg of matrixLegs(probes)) {
    const readings = readLeg(leg, pages, classify, candidates);
    const result = adjudicate(leg, readings, inventory);
    if (result === null) continue;
    adjudicated += 1;
    drafts.push(...result);
  }
  return { adjudicated, drafts };
}

/* -------------------------------------------------------------------------- */
/* C3 — core/serving-header-partial (hybrid)                                  */
/* -------------------------------------------------------------------------- */

function isHonoured(reading: ProbeReading): boolean {
  if (reading.served === null || reading.requested === null) return false;
  return reading.served.language === reading.requested;
}

function requestedList(readings: readonly ProbeReading[]): string {
  return distinct(readings.map((reading) => reading.requested ?? '')).join(', ');
}

function headerPartialFinding(
  leg: readonly ProbeEvidence[],
  honoured: readonly ProbeReading[],
  ignored: readonly ProbeReading[],
): FindingDraft {
  const cited = [...honoured, ...ignored];
  const example = ignored[0];
  const served = example?.served?.language ?? 'another language';
  return hybridDraft(
    {
      verdict: FAIL,
      scope: PAGE_SCOPE,
      subject: { url: legUrl(leg) },
      evidence: readingRefs(cited),
      summary: `At ${legUrl(leg)} the header was honoured for ${requestedList(honoured)} and ignored for ${requestedList(ignored)} — asking for ${example?.requested ?? ''} was answered in ${served}${viaNote(weakestVia(determinationsOf(cited)))}.`,
    },
    determinationsOf(cited),
  );
}

const servingHeaderPartial: CoreRule<'site'> = {
  id: 'core/serving-header-partial',
  title: 'Some declared languages honoured, others silently ignored',
  capabilities: MATRIX_ONLY,
  grounding: OBSERVED,
  hybrid: true,
  scope: SITE,
  run(ctx) {
    const { adjudicated, drafts } = walkMatrixLegs(
      ctx.pages,
      ctx.probes,
      ctx.classify,
      (leg, rawReadings, inventory) => {
        const readings = adjudicableReadings(rawReadings, inventory);
        if (readings.length < DIFFERENTIAL_MINIMUM) return null;
        const honoured = readings.filter(isHonoured);
        const ignored = readings.filter((reading) => !isHonoured(reading));
        if (honoured.length === 0 || ignored.length === 0) return [];
        return [headerPartialFinding(leg, honoured, ignored)];
      },
    );

    if (adjudicated === 0) {
      return notApplicable(
        'no leg asked for two or more declared languages and got a language back, so there is no partial split to report',
      );
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* C4 — core/serving-declared-never-served (hybrid)                           */
/* -------------------------------------------------------------------------- */

function neverServedFinding(
  leg: readonly ProbeEvidence[],
  language: string,
  askers: readonly ProbeReading[],
  servedLanguages: readonly string[],
): FindingDraft {
  const determinations = determinationsOf(askers);
  return hybridDraft(
    {
      verdict: FAIL,
      scope: PAGE_SCOPE,
      subject: { url: legUrl(leg) },
      evidence: readingRefs(askers),
      summary: `The site declares a ${language} version, but ${legUrl(leg)} never served ${language} under any header tested: the ${askers.length} request(s) that asked for it were answered in ${distinct(servedLanguages).join(', ')}${viaNote(weakestVia(determinations))}.`,
    },
    determinations,
  );
}

/** Only a language the matrix actually asked for can be said to be never served. */
function neverServedLanguages(
  readings: readonly ProbeReading[],
  inventory: ReadonlySet<string>,
): readonly string[] {
  const served = new Set(readings.flatMap((r) => (r.served === null ? [] : [r.served.language])));
  const asked = new Set(readings.flatMap((r) => (r.requested === null ? [] : [r.requested])));
  return [...asked].filter((language) => inventory.has(language) && !served.has(language));
}

const servingDeclaredNeverServed: CoreRule<'site'> = {
  id: 'core/serving-declared-never-served',
  title: 'A declared language is never served under any header',
  capabilities: MATRIX_ONLY,
  grounding: OBSERVED,
  hybrid: true,
  scope: SITE,
  run(ctx) {
    const { adjudicated, drafts } = walkMatrixLegs(
      ctx.pages,
      ctx.probes,
      ctx.classify,
      (leg, readings, inventory) => {
        const answered = readings.filter((reading) => reading.served !== null);
        if (answered.length === 0) return null;
        const servedLanguages = answered.map((reading) => reading.served?.language ?? '');
        const legDrafts: FindingDraft[] = [];
        for (const language of neverServedLanguages(readings, inventory)) {
          const askers = answered.filter((reading) => reading.requested === language);
          if (askers.length === 0) continue;
          legDrafts.push(neverServedFinding(leg, language, askers, servedLanguages));
        }
        return legDrafts;
      },
    );

    if (adjudicated === 0) {
      return notApplicable(
        'no matrix leg produced a response whose language could be determined, so nothing can be said to be never served',
      );
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* C5 — core/serving-vary-missing                                             */
/* -------------------------------------------------------------------------- */

/** HTTP header names are case-insensitive; a collector may record any casing. */
function headerValue(headers: Readonly<Record<string, string>>, name: string): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}

function variesOnAcceptLanguage(probe: ProbeEvidence): boolean {
  const vary = headerValue(probe.responseHeaders, VARY_HEADER);
  if (vary === null) return false;
  return vary.split(',').some((field) => {
    const name = field.trim().toLowerCase();
    return name === ACCEPT_LANGUAGE_FIELD || name === ANY_FIELD;
  });
}

function varyMissingFinding(
  leg: readonly ProbeEvidence[],
  uncached: readonly ProbeEvidence[],
): FindingDraft {
  return {
    grounding: OBSERVED,
    verdict: FAIL,
    scope: PAGE_SCOPE,
    subject: { url: legUrl(leg) },
    evidence: uncached.map(probeRef),
    summary: `${legUrl(leg)} returned ${distinct(bodyHashes(leg)).length} different response bodies across ${leg.length} Accept-Language values, and ${uncached.length} of them carried no Vary: Accept-Language — a shared cache will serve one visitor's language to everyone behind it.`,
  };
}

const servingVaryMissing: CoreRule<'site'> = {
  id: 'core/serving-vary-missing',
  title: 'Response varies by Accept-Language without Vary: Accept-Language',
  capabilities: MATRIX_ONLY,
  grounding: OBSERVED,
  scope: SITE,
  run(ctx) {
    const legs = matrixLegs(ctx.probes).filter(isHashed);
    if (legs.length === 0) return notApplicable(NO_HASHES);

    const varying = legs.filter((leg) => distinct(bodyHashes(leg)).length >= DIFFERENTIAL_MINIMUM);
    if (varying.length === 0) {
      return notApplicable(
        'the response body did not change with Accept-Language, so Vary: Accept-Language is not required',
      );
    }

    const drafts = varying.flatMap((leg) => {
      const uncached = leg.filter((probe) => !variesOnAcceptLanguage(probe));
      return uncached.length === 0 ? [] : [varyMissingFinding(leg, uncached)];
    });
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* C6 — core/serving-decided-by-ip                                            */
/* -------------------------------------------------------------------------- */

/**
 * How the report names a vantage. `Vantage.country` is a **claim**: an
 * unverified one is written as a claim, and a finding never asserts the country
 * a probe egressed from unless the collector confirmed it.
 */
function vantageLabel(vantage: Vantage): string {
  const { country } = vantage;
  if (country === undefined) return `vantage "${vantage.id}" (no country claimed)`;
  if (country.verified === true) {
    return `vantage "${vantage.id}" (egress country verified as ${country.claimed})`;
  }
  return `vantage "${vantage.id}" (claims country ${country.claimed}, unverified)`;
}

/** One vantage's declared answer. Declarations only — no classifier in this rule. */
interface VantageReading {
  readonly probe: ProbeEvidence;
  readonly declared: string;
  readonly language: string;
}

function vantageReadings(
  leg: readonly ProbeEvidence[],
  pages: readonly PageEvidence[],
): readonly VantageReading[] {
  const seen = new Set<string>();
  const readings: VantageReading[] = [];
  for (const probe of leg) {
    if (seen.has(probe.vantage.id)) continue;
    const declared = presentLang(pageOfProbe(pages, probe)?.document.htmlLang ?? null);
    if (declared === null) continue;
    seen.add(probe.vantage.id);
    readings.push({ probe, declared, language: declaredLanguageOf(declared) });
  }
  return readings;
}

function decidedByIpFinding(readings: readonly VantageReading[]): FindingDraft | null {
  const [first, second] = readings;
  if (first === undefined || second === undefined) return null;
  return {
    grounding: OBSERVED,
    verdict: FAIL,
    scope: PAGE_SCOPE,
    subject: { url: first.probe.url },
    evidence: readings.map((reading) => probeRef(reading.probe)),
    summary: `At ${first.probe.url} under an identical ${headerLabel(first.probe)}, ${vantageLabel(first.probe.vantage)} received <html lang="${first.declared}"> and ${vantageLabel(second.probe.vantage)} received <html lang="${second.declared}"> — the served language follows the network location, not the stated header.`,
  };
}

const servingDecidedByIp: CoreRule<'site'> = {
  id: 'core/serving-decided-by-ip',
  title: 'Identical headers, different languages per vantage',
  capabilities: MULTI_VANTAGE_ONLY,
  grounding: OBSERVED,
  scope: SITE,
  run(ctx) {
    const legs = groupProbes(ctx.probes, vantageLegKey);
    const comparable = legs
      .map((leg) => vantageReadings(leg, ctx.pages))
      .filter((readings) => readings.length >= DIFFERENTIAL_MINIMUM);
    if (comparable.length === 0) {
      return notApplicable(
        'no URL was fetched from two vantages under one header with a declared language on both responses',
      );
    }

    const drafts = comparable
      .filter(
        (readings) =>
          distinct(readings.map((reading) => reading.language)).length >= DIFFERENTIAL_MINIMUM,
      )
      .flatMap((readings) => {
        const draft = decidedByIpFinding(readings);
        return draft === null ? [] : [draft];
      });
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* C7 — core/serving-cookie-overrides-header                                  */
/* -------------------------------------------------------------------------- */

/** A cold/warm pair of one URL, one vantage, one explicit header. */
function cookiePairKey(probe: ProbeEvidence): string {
  return `${probe.url} ${probe.vantage.id} ${headerKey(probe)}`;
}

/** One probe's own declaration. Declarations only — no classifier in this rule. */
interface DeclaredReading {
  readonly probe: ProbeEvidence;
  readonly tag: string;
  readonly language: string;
}

function declaredReading(
  pages: readonly PageEvidence[],
  probe: ProbeEvidence | undefined,
): DeclaredReading | null {
  if (probe === undefined) return null;
  const tag = presentLang(pageOfProbe(pages, probe)?.document.htmlLang ?? null);
  if (tag === null) return null;
  return { probe, tag, language: declaredLanguageOf(tag) };
}

function cookieOverrideFinding(
  cold: DeclaredReading,
  warm: DeclaredReading,
  requested: string,
): FindingDraft {
  return {
    grounding: OBSERVED,
    verdict: WARN,
    scope: PAGE_SCOPE,
    subject: { url: warm.probe.url },
    evidence: [probeRef(cold.probe), probeRef(warm.probe)],
    summary: `At ${warm.probe.url}, ${headerLabel(warm.probe)} was honoured on a cold request (<html lang="${cold.tag}">) and answered with <html lang="${warm.tag}"> once a language cookie was present — a stored cookie is taking precedence over the stated ${requested} preference.`,
  };
}

/** The one cold/warm pair a key resolves to, when both halves exist and disagree. */
function cookieOverrideDraft(
  group: readonly ProbeEvidence[],
  pages: readonly PageEvidence[],
): FindingDraft | null {
  const cold = declaredReading(
    pages,
    group.find((probe) => probe.cookieState === 'cold'),
  );
  const warm = declaredReading(
    pages,
    group.find((probe) => probe.cookieState === 'warm'),
  );
  if (cold === null || warm === null) return null;
  const requested = requestedLanguage(warm.probe);
  if (requested === null) return null;
  // The header must have worked cold, or the defect is that it never worked —
  // core/serving-header-ignored and core/serving-header-partial own that case.
  if (cold.language !== requested || warm.language === requested) return null;
  return cookieOverrideFinding(cold, warm, requested);
}

const servingCookieOverridesHeader: CoreRule<'site'> = {
  id: 'core/serving-cookie-overrides-header',
  title: 'A warm language cookie overrides an explicit header preference',
  capabilities: MATRIX_ONLY,
  grounding: OBSERVED,
  scope: SITE,
  run(ctx) {
    // Cold by default: a warm leg is an operator opt-in, stamped in the
    // evidence. Without one there is no cookie to observe — `not-applicable`,
    // never a pass and never a fail.
    const warm = ctx.probes.filter((probe) => probe.cookieState === 'warm');
    if (warm.length === 0) {
      return notApplicable(
        'every probe in this run was cold, and a warm cookie leg is an opt-in this run did not carry',
      );
    }

    const explicit = ctx.probes.filter((probe) => probe.acceptLanguage !== null);
    const drafts = groupProbes(explicit, cookiePairKey).flatMap((group) => {
      const draft = cookieOverrideDraft(group, ctx.pages);
      return draft === null ? [] : [draft];
    });
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/** Family C — the `Accept-Language` response matrix, `Vary`, and the geo override. */
export const servingFamily: RuleFamily = {
  id: 'C. Serving',
  title: 'Serving behaviour — the Accept-Language response matrix',
  rules: [
    servingDefaultLanguage,
    servingHeaderIgnored,
    servingHeaderPartial,
    servingDeclaredNeverServed,
    servingVaryMissing,
    servingDecidedByIp,
    servingCookieOverridesHeader,
  ],
};
