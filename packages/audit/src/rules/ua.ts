/**
 * **Family F — the `ua` jurisdiction pack.** Grounded in Ukraine's Law
 * 2704-VIII, *On ensuring the functioning of Ukrainian as the state
 * language*, Art. 27 §6: a business selling goods or services in Ukraine
 * must have a state-language version that loads by default and is no
 * lesser in volume and content than its other-language versions.
 *
 * > **Requires legal review before shipping.** The article number, its
 * > effective date, its enforcement scope, and the exact wording used in a
 * > report that may reach a regulator are open questions (see
 * > docs/movar-audit.md and docs/movar-audit-rules.md, both §"Open"/"Open
 * > questions"). Nothing in this file should be quoted to a site owner or a
 * > regulator as a legal conclusion.
 *
 * Every rule here is a jurisdiction-pack rule and therefore carries
 * {@link UA_CITATION} — one exported constant, stamped by the kernel onto
 * every finding these rules emit (see `rule.ts`'s `PackRule`).
 *
 * **The pack applies only where the site itself declares the Ukrainian
 * market** — a `.ua` TLD, UAH pricing, an ЄДРПОУ code, a Ukrainian
 * legal-entity block, a `uk-UA` hreflang alternate, or a Ukrainian postal
 * address (see {@link determineMarket}). An undeterminable market makes
 * every other rule in this file `not-applicable`, never `fail` — that is
 * the safety property this pack exists to preserve, and it is exercised
 * hard in `ua.test.ts`. `ua/market-determination` does not gate on itself:
 * it is `info`-graded and always reports which signals fired (or that none
 * did), so the applicability decision is auditable by the site it names.
 *
 * **The pack reports found / not-found violation evidence. It never
 * renders a legal verdict.** Every summary says what was observed and what
 * the cited article requires — never "this site is illegal" or "you are in
 * violation".
 *
 * `ua/state-language-absent` is the one rule here the neutral core
 * structurally cannot produce: it fires only when BOTH halves hold — no
 * Ukrainian version declared anywhere, and none served by default — which
 * is what makes it safe despite the declared-only discipline the rest of
 * the catalogue holds. It never infers a hidden translation and never
 * probes a guessed URL like `/uk/`.
 *
 * `ua/state-language-not-default` is the pack's one hybrid rule: it prefers
 * the response's own `<html lang>` and falls back to the classifier only
 * when that is absent, recording `via: 'classified'` with a denominator
 * when it does. The kernel strips its failing power automatically in that
 * case.
 *
 * `ua/state-language-version-lesser` has nothing to do with the
 * classifier — it compares per-language counts and per-page content volume
 * across hreflang pairs. The two sides of that count are bounded in opposite
 * directions and so are counted differently: other languages by **version**,
 * because `/` copied from `/en/` is one version enumerated at two paths;
 * Ukrainian by **collected page, end to end** — pages serving it and pages
 * naming an uncollected Ukrainian counterpart alike, never merged. Merging
 * either Ukrainian term would manufacture deficits rather than prevent them —
 * see the note above that rule. What the collector enumerated is a fact about the crawl; only what
 * the site declares may carry the citation. Its volume-delta threshold
 * ({@link UA_VERSION_VOLUME_DELTA_THRESHOLD}) is a calibration-pending
 * default, not a statutory number. Its volume half compares **sampled**
 * text, so it refuses the comparison outright when either side's sample
 * was truncated by the collector's node cap (`textSampling.cappedAt`) and
 * reports the pair as unmeasured — above that cap every page measures the
 * same, and a parity or a deficit read off two truncated sums is a fact
 * about the collector, not about the site being cited.
 *
 * @see ../../../../docs/movar-audit-rules.md — section F
 * @see ../../../../docs/movar-audit.md — §1, why statute lives in packs
 */

import { declaredLanguageOf, presentLang } from '../bcp47';
import type { Capability } from '../capability';
import { STATIC_ONLY, SITE_ONLY } from '../capability';
import type { Classifier } from '../classifier';
import type {
  DocumentEvidence,
  NodePath,
  PageEvidence,
  ProbeEvidence,
  TextNodeSample,
  Vantage,
} from '../evidence';
import type { Citation, Denominator, EvidenceRef, FindingDraft } from '../finding';
import { nodeRef, pageRef, subjectOf } from '../finding';
import { alternateLanguage } from '../inventory';
import type { PackRule, RuleFamily } from '../rule';
import { locatorOf, locatorText, parseLocator, resolveTargetPage } from '../locator';
import { findings, notApplicable, pass } from '../rule';
import { textNodeDenominator } from '../text-samples';
import { normalizeLanguageCode, PROFILED_CODES } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

// --- shared literals ---------------------------------------------------------

const HTTP_ONLY: readonly Capability[] = ['http'];
const MULTI_VANTAGE_ONLY: readonly Capability[] = ['multi-vantage'];

const DECLARED = 'declared' as const;
const CLASSIFIED_VIA = 'classified' as const;
const PAGE_SCOPE = 'page' as const;
const SITE_SCOPE = 'site' as const;
const FAIL = 'fail' as const;
const WARN = 'warn' as const;
const INFO = 'info' as const;

/** Movar's canonical code for Ukrainian, reused for both plain string and `LanguageCode` positions. */
const UK = 'uk' as const;

/**
 * The one citation every rule in this file carries. Stamped by the kernel
 * onto every finding (`grading.ts`'s `ruleCitation`), so it is defined once
 * here rather than six times.
 */
export const UA_CITATION: Citation = {
  source: 'Law 2704-VIII',
  article: 'Art. 27 §6',
  url: 'https://zakon.rada.gov.ua/laws/show/2704-19',
};

/**
 * The fraction by which a Ukrainian-language page's sampled content volume
 * may trail its hreflang counterpart before `ua/state-language-version-lesser`
 * fires. **Calibration-pending.** Art. 27 §6 reads "no lesser," which taken
 * literally is any deficit at all; 20% is a deliberately generous first cut
 * chosen to absorb ordinary CMS/template noise (a shorter nav label, a
 * missing meta description, sampling variance) without accusing a
 * good-faith translation of a statutory violation over a trivial gap.
 * Revisit once the pack has run against real sites.
 */
export const UA_VERSION_VOLUME_DELTA_THRESHOLD = 0.2;

const UA_DEFAULT_LOADING_CLAUSE =
  'Art. 27 §6 requires a Ukrainian-language version that loads by default';
const UA_VOLUME_PARITY_CLAUSE =
  'Art. 27 §6 requires the Ukrainian-language version to be no lesser in volume and content than other-language versions';
const UA_SERVICE_OBLIGATION_CLAUSE =
  'this is the state-language service question Art. 27 §6 governs';

const MARKET_NOT_DETERMINED =
  'the site declares no Ukrainian-market signal (.ua TLD, UAH pricing, ЄДРПОУ code, ' +
  'Ukrainian legal-entity block, uk-UA hreflang, Ukrainian postal address) — see ua/market-determination';
const NO_UK_DECLARED =
  'no Ukrainian version is declared anywhere on this page — ua/state-language-absent owns that case';
const NO_DEFAULT_LANGUAGE_DETERMINABLE =
  'the page carries no <html lang> and no sampled text could be classified into a default language';
const PAGE_NOT_UK_SERVING =
  'the page itself does not declare Ukrainian (<html lang> is not uk) — nothing to compare its interface chrome against';
const NO_CHROME_TEXT_SAMPLED = 'no navigation, header, or footer text was sampled on this page';
const NO_COMPARABLE_VANTAGE = 'no single URL was observed from more than one vantage';

const MIN_COMPARABLE_VANTAGES = 2;
const PERCENT_SCALE = 100;
const SIGNAL_DETAIL_MAX_LENGTH = 60;

// --- generic small helpers ---------------------------------------------------

function probesForPage(probes: readonly ProbeEvidence[], pageId: string): readonly ProbeEvidence[] {
  return probes.filter((probe) => probe.pageId === pageId);
}

function probeRefs(probes: readonly ProbeEvidence[]): readonly EvidenceRef[] {
  return probes.map((probe) => ({ kind: 'probe', probeId: probe.id }));
}

/**
 * The FAIL draft `ua/state-language-absent` and the declared-tag branch of
 * `ua/state-language-not-default` both build once a page turns out not to
 * serve Ukrainian by default; only the summary differs.
 */
function notDefaultUkrainianFail(
  page: PageEvidence,
  probes: readonly ProbeEvidence[],
  summary: string,
): FindingDraft {
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: subjectOf(page),
    evidence: [pageRef(page), ...probeRefs(probesForPage(probes, page.id))],
    summary,
  };
}

/**
 * Does any page in the collected set determine the Ukrainian market? The
 * site-scope guard `ua/state-language-not-default-by-ip` and
 * `ua/state-language-version-lesser` both start from, before either looks at
 * its own site-wide question.
 */
function marketAppliesSitewide(pages: readonly PageEvidence[]): boolean {
  return pages.some((page) => determineMarket(page).length > 0);
}

/** What this page's own `<html lang>` declares, normalized — or `null` when absent. */
function declaredServedLanguage(doc: DocumentEvidence): string | null {
  const tag = presentLang(doc.htmlLang);
  return tag === null ? null : declaredLanguageOf(tag);
}

/**
 * Does this page declare a Ukrainian version *anywhere* — an hreflang
 * alternate, a picker option, or a link target? Deliberately excludes the
 * page's own `<html lang>`: that is what {@link declaredServedLanguage}
 * answers, and conflating the two would make "declared" trivially true
 * whenever "served" already is.
 */
function declaresUkrainianVersion(doc: DocumentEvidence): boolean {
  const altUk = doc.alternates.some((alt) => declaredLanguageOf(alt.hreflang) === UK);
  const linkUk = doc.links.some(
    (link) => link.hreflang !== undefined && declaredLanguageOf(link.hreflang) === UK,
  );
  const pickerUk =
    doc.picker?.options.some((option) => normalizeLanguageCode(option.label) === UK) ?? false;
  return altUk || linkUk || pickerUk;
}

const WORD_SPLIT_PATTERN = /[^\p{L}\p{N}]+/u;
const DIGITS_ONLY = /^\d+$/u;

/** Unicode-aware word tokens: splits on anything that isn't a letter or digit. */
function tokensOf(text: string): readonly string[] {
  return text.split(WORD_SPLIT_PATTERN).filter((token) => token.length > 0);
}

function upperTokensOf(text: string): readonly string[] {
  return tokensOf(text).map((token) => token.toUpperCase());
}

function isDigitsOfLength(token: string, length: number): boolean {
  return token.length === length && DIGITS_ONLY.test(token);
}

/** A short, report-safe excerpt of a text node — never the whole sampled string. */
function snippet(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > SIGNAL_DETAIL_MAX_LENGTH
    ? `${trimmed.slice(0, SIGNAL_DETAIL_MAX_LENGTH)}…`
    : trimmed;
}

// --- market determination ----------------------------------------------------
//
// Declarations only, per docs/movar-audit-rules.md §F: ".ua TLD, UAH pricing,
// an ЄДРПОУ code, a Ukrainian legal-entity block, uk-UA hreflang, a Ukrainian
// postal address." Every signal here reads the site's own markup/text; none
// of it probes a guessed URL or infers anything the site did not publish.

type MarketSignalKind =
  | 'tld'
  | 'currency'
  | 'edrpou'
  | 'legal-entity'
  | 'hreflang'
  | 'postal-address';

interface MarketSignal {
  readonly kind: MarketSignalKind;
  /** The literal token or fact that fired, for the report's summary. */
  readonly detail: string;
  readonly nodePath?: NodePath;
}

const UA_TLD_SUFFIX = '.ua';

function tldSignal(page: PageEvidence): MarketSignal | null {
  if (page.url === undefined) return null;
  let hostname: string;
  try {
    hostname = new URL(page.url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return hostname.endsWith(UA_TLD_SUFFIX) ? { kind: 'tld', detail: hostname } : null;
}

const UAH_SYMBOL = '₴';
const UAH_WORD_TOKENS: ReadonlySet<string> = new Set(['ГРН', 'UAH']);

function currencySignal(page: PageEvidence): MarketSignal | null {
  for (const node of page.document.textNodes) {
    const hasSymbol = node.text.includes(UAH_SYMBOL);
    const hasWord = upperTokensOf(node.text).some((token) => UAH_WORD_TOKENS.has(token));
    if (hasSymbol || hasWord)
      return { kind: 'currency', detail: snippet(node.text), nodePath: node.nodePath };
  }
  return null;
}

const EDRPOU_LABEL = 'ЄДРПОУ';
const EDRPOU_DIGIT_LENGTH = 8;

/**
 * Looks for the label token "ЄДРПОУ" and an 8-digit code either in the same
 * text node or the next one (a common table/label-value DOM layout).
 */
function edrpouSignal(page: PageEvidence): MarketSignal | null {
  const nodes = page.document.textNodes;
  for (const [index, node] of nodes.entries()) {
    const tokens = upperTokensOf(node.text);
    if (!tokens.includes(EDRPOU_LABEL)) continue;
    const sameNodeCode = tokens.find((token) => isDigitsOfLength(token, EDRPOU_DIGIT_LENGTH));
    if (sameNodeCode !== undefined) {
      return { kind: 'edrpou', detail: sameNodeCode, nodePath: node.nodePath };
    }
    const next = nodes[index + 1];
    const nextCode =
      next === undefined
        ? undefined
        : upperTokensOf(next.text).find((token) => isDigitsOfLength(token, EDRPOU_DIGIT_LENGTH));
    if (nextCode !== undefined)
      return { kind: 'edrpou', detail: nextCode, nodePath: node.nodePath };
  }
  return null;
}

const LEGAL_ENTITY_TOKENS: ReadonlySet<string> = new Set(['ТОВ', 'ТЗОВ', 'ПРАТ', 'ПАТ', 'ФОП']);

function legalEntitySignal(page: PageEvidence): MarketSignal | null {
  for (const node of page.document.textNodes) {
    const hit = upperTokensOf(node.text).some((token) => LEGAL_ENTITY_TOKENS.has(token));
    if (hit) return { kind: 'legal-entity', detail: snippet(node.text), nodePath: node.nodePath };
  }
  return null;
}

const UK_UA_HREFLANG = 'uk-ua';

function hreflangSignal(page: PageEvidence): MarketSignal | null {
  const alternate = page.document.alternates.find(
    (alt) => alt.hreflang.trim().toLowerCase() === UK_UA_HREFLANG,
  );
  if (alternate === undefined) return null;
  return {
    kind: 'hreflang',
    detail: alternate.href,
    ...(alternate.nodePath === undefined ? {} : { nodePath: alternate.nodePath }),
  };
}

const UKRAINE_NAME_TOKENS: ReadonlySet<string> = new Set(['УКРАЇНА', 'UKRAINE']);
const POSTAL_CODE_LENGTH = 5;

function postalAddressSignal(page: PageEvidence): MarketSignal | null {
  for (const node of page.document.textNodes) {
    const tokens = upperTokensOf(node.text);
    const hasCountry = tokens.some((token) => UKRAINE_NAME_TOKENS.has(token));
    const hasPostcode = tokens.some((token) => isDigitsOfLength(token, POSTAL_CODE_LENGTH));
    if (hasCountry && hasPostcode) {
      return { kind: 'postal-address', detail: snippet(node.text), nodePath: node.nodePath };
    }
  }
  return null;
}

const MARKET_SIGNAL_DETECTORS: readonly ((page: PageEvidence) => MarketSignal | null)[] = [
  tldSignal,
  currencySignal,
  edrpouSignal,
  legalEntitySignal,
  hreflangSignal,
  postalAddressSignal,
];

/**
 * Every Ukrainian-market signal this page's own declarations carry. Empty
 * means the market is undeterminable — every gated rule in this file treats
 * that as `not-applicable`, never `fail`.
 */
function determineMarket(page: PageEvidence): readonly MarketSignal[] {
  const found: MarketSignal[] = [];
  for (const detect of MARKET_SIGNAL_DETECTORS) {
    const signal = detect(page);
    if (signal !== null) found.push(signal);
  }
  return found;
}

function hasNodePath(signal: MarketSignal): signal is MarketSignal & { nodePath: NodePath } {
  return signal.nodePath !== undefined;
}

const SIGNAL_LABEL: Readonly<Record<MarketSignalKind, string>> = {
  tld: '.ua top-level domain',
  currency: 'UAH pricing',
  edrpou: 'an ЄДРПОУ code',
  'legal-entity': 'a Ukrainian legal-entity block',
  hreflang: 'a uk-UA hreflang alternate',
  'postal-address': 'a Ukrainian postal address',
};

const ALL_SIGNAL_LABELS = Object.values(SIGNAL_LABEL).join(', ');

function describeSignal(signal: MarketSignal): string {
  return `${SIGNAL_LABEL[signal.kind]} ("${signal.detail}")`;
}

function marketDeterminationSummary(signals: readonly MarketSignal[]): string {
  if (signals.length === 0) {
    return `No Ukrainian-market signal was found on this page (checked: ${ALL_SIGNAL_LABELS}) — the ua pack does not apply here.`;
  }
  return `The Ukrainian market was determined for this page from: ${signals.map(describeSignal).join('; ')}.`;
}

const marketDetermination: PackRule<'page'> = {
  id: 'ua/market-determination',
  title: 'How the Ukrainian market was determined, or that it was not',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE_SCOPE,
  citation: UA_CITATION,
  run(ctx) {
    const signals = determineMarket(ctx.page);
    const nodeEvidence = signals
      .filter(hasNodePath)
      .map((signal) => nodeRef(ctx.page, signal.nodePath));
    return findings({
      grounding: DECLARED,
      verdict: INFO,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page), ...nodeEvidence],
      summary: marketDeterminationSummary(signals),
    });
  },
};

// --- ua/state-language-absent -------------------------------------------------

const stateLanguageAbsent: PackRule<'page'> = {
  id: 'ua/state-language-absent',
  title: 'No Ukrainian version is declared anywhere, and none is served',
  capabilities: HTTP_ONLY,
  grounding: DECLARED,
  scope: PAGE_SCOPE,
  citation: UA_CITATION,
  run(ctx) {
    const signals = determineMarket(ctx.page);
    if (signals.length === 0) return notApplicable(MARKET_NOT_DETERMINED);
    if (declaresUkrainianVersion(ctx.page.document)) return pass();
    const served = declaredServedLanguage(ctx.page.document);
    if (served === UK) return pass();
    return findings(
      notDefaultUkrainianFail(
        ctx.page,
        ctx.probes,
        'No Ukrainian-language version is declared anywhere on this page — no uk/uk-UA hreflang ' +
          `alternate, picker option, or link target — and the page itself does not serve Ukrainian by ` +
          `default. ${UA_DEFAULT_LOADING_CLAUSE}.`,
      ),
    );
  },
};

// --- ua/state-language-not-default (hybrid) -----------------------------------

const PROFILED_LANGUAGE_CODES: readonly LanguageCode[] = [...PROFILED_CODES];
const PROFILED_LANGUAGE_STRINGS: readonly string[] = PROFILED_LANGUAGE_CODES;

function isProfiledLanguage(code: string): code is LanguageCode {
  return PROFILED_LANGUAGE_STRINGS.includes(code);
}

/**
 * `uk` plus every other declared, profiled language (from alternates and the
 * picker). Falls back to the full profiled roster when nothing else is
 * declared, so the classifier always has something to discriminate against.
 */
function candidateLanguages(doc: DocumentEvidence): readonly LanguageCode[] {
  const codes = new Set<LanguageCode>([UK]);
  for (const alternate of doc.alternates) {
    const code = declaredLanguageOf(alternate.hreflang);
    if (isProfiledLanguage(code)) codes.add(code);
  }
  for (const option of doc.picker?.options ?? []) {
    const code = normalizeLanguageCode(option.label);
    if (code !== null && isProfiledLanguage(code)) codes.add(code);
  }
  return codes.size <= 1 ? PROFILED_LANGUAGE_CODES : [...codes];
}

interface ClassifiedDefault {
  readonly language: LanguageCode;
  readonly denominator: Denominator;
}

/**
 * Classifies every sampled text node and takes the majority verdict as the
 * page's default language. Used only as the hybrid fallback when the page
 * carries no `<html lang>` at all.
 *
 * The denominator is {@link textNodeDenominator}'s — every text node the
 * collector *examined*, not the sample that reached the bundle. The blank
 * filter below narrows only what is handed to the classifier, exactly as
 * `classifySamples` narrows for the core families: the numerator counts over
 * the sample, and the denominator stays the widest honest population. A real
 * collector's `examined` already excludes blank nodes, so the two agree on any
 * uncapped page; on a capped one, quoting the sample would understate `M` and
 * inflate the share this rule publishes — with a statute cited, about a named
 * company.
 */
function classifyDefaultLanguage(
  classify: Classifier,
  page: PageEvidence,
  candidates: readonly LanguageCode[],
): ClassifiedDefault | null {
  const nodes = page.document.textNodes.filter((node) => node.text.trim().length > 0);
  if (nodes.length === 0) return null;
  const counts = new Map<LanguageCode, number>();
  for (const node of nodes) {
    const verdict = classify(node.text, candidates);
    if (verdict === null) continue;
    counts.set(verdict.language, (counts.get(verdict.language) ?? 0) + 1);
  }
  let bestLanguage: LanguageCode | null = null;
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) {
      bestLanguage = language;
      bestCount = count;
    }
  }
  return bestLanguage === null
    ? null
    : { language: bestLanguage, denominator: textNodeDenominator(page, bestCount) };
}

const stateLanguageNotDefault: PackRule<'page'> = {
  id: 'ua/state-language-not-default',
  title: 'A Ukrainian version exists but is not what loads by default',
  capabilities: HTTP_ONLY,
  grounding: DECLARED,
  hybrid: true,
  scope: PAGE_SCOPE,
  citation: UA_CITATION,
  run(ctx) {
    const signals = determineMarket(ctx.page);
    if (signals.length === 0) return notApplicable(MARKET_NOT_DETERMINED);
    if (!declaresUkrainianVersion(ctx.page.document)) return notApplicable(NO_UK_DECLARED);

    const tag = presentLang(ctx.page.document.htmlLang);
    if (tag !== null) {
      if (declaredLanguageOf(tag) === UK) return pass();
      return findings(
        notDefaultUkrainianFail(
          ctx.page,
          ctx.probes,
          `The page declares a Ukrainian version, but <html lang="${tag}"> is what loads by default. ${UA_DEFAULT_LOADING_CLAUSE}.`,
        ),
      );
    }

    const classified = classifyDefaultLanguage(
      ctx.classify,
      ctx.page,
      candidateLanguages(ctx.page.document),
    );
    if (classified === null) return notApplicable(NO_DEFAULT_LANGUAGE_DETERMINABLE);
    if (classified.language === UK) return pass();
    const { denominator } = classified;
    return findings({
      grounding: DECLARED,
      verdict: FAIL,
      via: CLASSIFIED_VIA,
      denominator,
      subject: subjectOf(ctx.page),
      evidence: [pageRef(ctx.page)],
      summary:
        `The page declares a Ukrainian version, but its default text classifies as ${classified.language} ` +
        `(${denominator.matched} of ${denominator.examined} text nodes) rather than Ukrainian. ${UA_DEFAULT_LOADING_CLAUSE}.`,
    });
  },
};

// --- ua/state-language-not-default-by-ip --------------------------------------

interface VantageObservation {
  readonly page: PageEvidence;
  readonly vantage: Vantage;
  readonly language: string;
}

function vantageOfPage(probes: readonly ProbeEvidence[], pageId: string): Vantage | null {
  return probes.find((probe) => probe.pageId === pageId)?.vantage ?? null;
}

function observeVantageLanguages(
  pages: readonly PageEvidence[],
  probes: readonly ProbeEvidence[],
): readonly VantageObservation[] {
  const observations: VantageObservation[] = [];
  for (const page of pages) {
    const vantage = vantageOfPage(probes, page.id);
    const language = declaredServedLanguage(page.document);
    if (vantage !== null && language !== null) observations.push({ page, vantage, language });
  }
  return observations;
}

function groupPagesByUrl(pages: readonly PageEvidence[]): Map<string, PageEvidence[]> {
  const groups = new Map<string, PageEvidence[]>();
  for (const page of pages) {
    if (page.url === undefined) continue;
    const group = groups.get(page.url) ?? [];
    group.push(page);
    groups.set(page.url, group);
  }
  return groups;
}

/**
 * Names a vantage for the report without ever presenting its claimed
 * country as an observed fact — `Vantage.country` is `{ claimed, verified? }`
 * by design (see evidence.ts).
 */
function vantageLabel(vantage: Vantage): string {
  const claimed = vantage.country?.claimed;
  return claimed === undefined
    ? `the vantage "${vantage.id}"`
    : `the vantage claiming country ${claimed} ("${vantage.id}")`;
}

function describeVantageSplit(observations: readonly VantageObservation[]): string {
  const parts = observations.map(
    (observation) =>
      `${vantageLabel(observation.vantage)} received a page declaring ${observation.language} by default`,
  );
  return `${parts.join('; ')}. ${UA_DEFAULT_LOADING_CLAUSE}.`;
}

function vantageSplitFinding(
  url: string,
  observations: readonly VantageObservation[],
): FindingDraft | null {
  if (observations.length < MIN_COMPARABLE_VANTAGES) return null;
  const sawUk = observations.some((observation) => observation.language === UK);
  const sawNonUk = observations.some((observation) => observation.language !== UK);
  if (!sawUk || !sawNonUk) return null;
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: { url },
    evidence: observations.map((observation) => pageRef(observation.page)),
    summary: describeVantageSplit(observations),
  };
}

const stateLanguageNotDefaultByIp: PackRule<'site'> = {
  id: 'ua/state-language-not-default-by-ip',
  title: 'Ukrainian loads by default from some vantages but not others',
  capabilities: MULTI_VANTAGE_ONLY,
  grounding: DECLARED,
  scope: SITE_SCOPE,
  citation: UA_CITATION,
  run(ctx) {
    if (!marketAppliesSitewide(ctx.pages)) return notApplicable(MARKET_NOT_DETERMINED);

    const groups = groupPagesByUrl(ctx.pages);
    const drafts: FindingDraft[] = [];
    let comparable = false;
    for (const [url, pages] of groups) {
      const observations = observeVantageLanguages(pages, ctx.probes);
      if (observations.length >= MIN_COMPARABLE_VANTAGES) comparable = true;
      const draft = vantageSplitFinding(url, observations);
      if (draft !== null) drafts.push(draft);
    }
    if (drafts.length > 0) return findings(...drafts);
    return comparable ? pass() : notApplicable(NO_COMPARABLE_VANTAGE);
  },
};

// --- ua/state-language-version-lesser -----------------------------------------

// **What the count half counts, and why the two sides are counted differently.**
//
// To say the Ukrainian version is lesser you need a *lower* bound on the other
// language's version count and an *upper* bound on Ukrainian's. Those bounds
// point in opposite directions, so the two sides cannot be counted the same way:
//
//   - **Other languages are counted by version.** A page count is a property of
//     the crawl, not of the site: `/` copied from `/en/` is one version
//     enumerated at two paths, and one URL observed from two vantages is one
//     version observed twice. Counting either as two reported `en: 2, uk: 1` on
//     a build with exact 1:1 parity, with Law 2704-VIII stamped on it (#441).
//     Merging only ever shrinks this side, which is the safe direction here.
//   - **Ukrainian is counted by collected page, end to end** — `served` and
//     `credited` alike, never merged. A partial collection cannot upper-bound
//     how many Ukrainian pages a site has, so the most generous count the
//     evidence permits is the only honest one.
//
// Counting either Ukrainian term by version would be symmetric and wrong.
// Three Ukrainian pages that each declare `hreflang="uk" href="/uk/"` — the
// widespread "alternates name the language homepages" pattern — merge into a
// single version and manufacture a deficit against three Russian pages that
// declare nothing. The same reaches Ukrainian through the *credit* when the
// sloppy hreflang sits on the other-language pages: three English pages naming
// one another collapse to one version and drag three credited Ukrainian
// counterparts down to one, while the Russian count stands still.
//
// So the safety property is not "merging only joins" — that is false — and not
// "merging is barred from the Ukrainian side", which was believed once while
// `credited` quietly iterated versions. It is that **every term of the
// Ukrainian side is page-counted**. A merge can move the other-language side
// only, in the direction that weakens the accusation.

/**
 * A page's own location, as a comparable key. Falls back to the page id when
 * the page carries neither a URL nor a build path, so an unlocatable page is
 * its own version rather than silently merging with every other one.
 */
function locationKey(page: PageEvidence): string {
  const locator = locatorOf(page);
  return locator === null ? `id:${page.id}` : `at:${locator.host ?? ''}:${locator.path}`;
}

function rootKey(parents: Map<string, string>, key: string): string {
  let current = key;
  let parent = parents.get(current);
  while (parent !== undefined && parent !== current) {
    current = parent;
    parent = parents.get(current);
  }
  return current;
}

function mergeKeys(parents: Map<string, string>, one: string, other: string): void {
  const left = rootKey(parents, one);
  const right = rootKey(parents, other);
  if (left !== right) parents.set(right, left);
}

/**
 * Merges this page's location with every alternate it declares that names a
 * language *and* resolves to a collected page.
 *
 * `x-default` and a blank `hreflang` are skipped — {@link alternateLanguage}
 * returns `null` for both. They are routing declarations, and while they never
 * decide a *language* here, cluster membership feeds a per-language count, so
 * letting them merge would let a routing hint decide which language is
 * deficient: three Ukrainian pages declaring `x-default` and three Russian
 * pages declaring nothing became a Law 2704-VIII finding on exact 3-versus-3
 * parity. Nothing needs them — the duplicated root of #441 is unified with
 * `/en/` by its own `hreflang="en"`.
 */
function mergeDeclaredCluster(
  parents: Map<string, string>,
  pages: readonly PageEvidence[],
  page: PageEvidence,
): void {
  for (const alternate of page.document.alternates) {
    if (alternateLanguage(alternate) === null) continue;
    const target = resolveTargetPage(pages, page, alternate.href);
    if (target !== null) mergeKeys(parents, locationKey(page), locationKey(target));
  }
}

/**
 * The collected pages, grouped into versions: same location, or joined by an
 * hreflang alternate one of them declares. Used for the **other-language** side
 * of the comparison only — see the note at the top of this section for why
 * merging the Ukrainian side manufactures deficits instead of preventing them.
 */
function versionsOf(pages: readonly PageEvidence[]): readonly (readonly PageEvidence[])[] {
  const parents = new Map<string, string>();
  for (const page of pages) parents.set(locationKey(page), locationKey(page));
  for (const page of pages) mergeDeclaredCluster(parents, pages, page);
  const versions = new Map<string, PageEvidence[]>();
  for (const page of pages) {
    const root = rootKey(parents, locationKey(page));
    const members = versions.get(root) ?? [];
    members.push(page);
    versions.set(root, members);
  }
  return [...versions.values()];
}

/**
 * Does this page declare a Ukrainian counterpart that names a target the run
 * did not collect?
 *
 * The href must **parse to a locator**. `href="#"` and `href=""` declare no
 * target at all — `parseLocator`'s own doc says so — and reading that `null`
 * as "the counterpart exists, we just did not fetch it" let markup asserting
 * nothing silence a statutory check.
 *
 * Where it does parse, the absence is a fact about the crawl — a budget, a
 * sitemap cap, a `--follow` that was not passed — and the site's own markup
 * asserts the version exists. Probing the href to check is precisely what this
 * pack may not do, so the claim is credited rather than counted against the
 * site. Deliberately narrower than {@link declaresUkrainianVersion}: an
 * hreflang alternate declares *this page's* counterpart, while a picker option
 * is site-wide chrome that would credit every version on any site with a
 * language menu.
 *
 * **The dangling href may go unreported on an ordinary network run.**
 * `core/hreflang-target-unresolvable` needs `traversal`, which network evidence
 * only carries when some page was reached as a declared target — so a run whose
 * declared targets all dangle, or which never followed them at all, produces no
 * such page and that rule reads `not-collected`. *One* target that resolves
 * lifts the gate for the whole bundle, and the ubiquitous self-referential
 * `<link rel="alternate" hreflang="en" href="/">` is one, so the hole is
 * narrower than it looks — but it is not closed, and a fabricated `uk`
 * alternate on a page that declares nothing else still goes unremarked. That is
 * a deliberate, documented cost: the alternative is failing every site whose
 * Ukrainian pages merely fell outside the crawl budget, and a missed violation
 * is recoverable where a false accusation carrying a statute is not. The same
 * hole is already load-bearing in `ua/state-language-absent`, which passes on a
 * declared-but-unverified Ukrainian alternate for the same reason.
 */
function declaresUncollectedUkrainian(page: PageEvidence, pages: readonly PageEvidence[]): boolean {
  return page.document.alternates.some(
    (alternate) =>
      alternateLanguage(alternate) === UK &&
      parseLocator(alternate.href, page.url) !== null &&
      resolveTargetPage(pages, page, alternate.href) === null,
  );
}

function servesUkrainian(page: PageEvidence): boolean {
  return declaredServedLanguage(page.document) === UK;
}

/** How many versions this language covers — each version counted once, however many pages it holds. */
function countOtherLanguageVersions(
  versions: readonly (readonly PageEvidence[])[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const version of versions) {
    const languages = new Set<string>();
    for (const page of version) {
      const language = declaredServedLanguage(page.document);
      if (language !== null && language !== UK) languages.add(language);
    }
    for (const language of languages) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return counts;
}

/**
 * The Ukrainian side of the comparison, kept as generous as the evidence
 * permits: every collected page that serves Ukrainian, plus every collected
 * page that serves another language while naming an uncollected Ukrainian
 * counterpart.
 *
 * **Both terms are page-counted, and that is the safety property** — not
 * "merging only joins", which is false, and not "merging is barred from the
 * Ukrainian side", which was believed once while `credited` quietly iterated
 * versions. Version-counting is safe on the side that needs a *lower* bound
 * and unsafe on the side that needs an *upper* one; every merge that joined
 * two credited versions removed a unit from Ukrainian's side while the
 * other-language counts stood still, so three English pages using the
 * "alternates name the language homepages" pattern manufactured a deficit
 * against Ukrainian pages the site had declared at exact parity. Nothing here
 * may consult {@link versionsOf}.
 */
interface UkrainianCoverage {
  readonly served: number;
  readonly credited: number;
  readonly total: number;
}

function ukrainianCoverage(pages: readonly PageEvidence[]): UkrainianCoverage {
  const served = pages.filter((page) => servesUkrainian(page)).length;
  const credited = pages.filter(
    (page) => !servesUkrainian(page) && declaresUncollectedUkrainian(page, pages),
  ).length;
  return { served, credited, total: served + credited };
}

/** Names the Ukrainian side by what it actually rests on — collected pages, and credited claims. */
function describeUkrainianCoverage(coverage: UkrainianCoverage): string {
  const servedClause = `${coverage.served} collected page(s) declaring Ukrainian`;
  return coverage.credited === 0
    ? servedClause
    : `${servedClause} and ${coverage.credited} page(s) naming a Ukrainian counterpart this run did not collect`;
}

/** Sitewide: does the state-language version cover fewer of the collected versions than some other language? */
function versionCountFindings(pages: readonly PageEvidence[]): readonly FindingDraft[] {
  const versions = versionsOf(pages);
  const counts = countOtherLanguageVersions(versions);
  const coverage = ukrainianCoverage(pages);
  const drafts: FindingDraft[] = [];
  for (const [language, count] of counts) {
    if (coverage.total >= count) continue;
    drafts.push({
      grounding: DECLARED,
      verdict: FAIL,
      subject: {},
      evidence: pages
        .filter((page) => {
          const declared = declaredServedLanguage(page.document);
          return declared === UK || declared === language;
        })
        .map((page) => pageRef(page)),
      summary:
        `The ${pages.length} collected pages resolve to ${count} version(s) declaring ${language} — pages ` +
        `joined by an hreflang alternate, or sharing one location, counted once — against ` +
        `${describeUkrainianCoverage(coverage)}. ${UA_VOLUME_PARITY_CLAUSE}.`,
    });
  }
  return drafts;
}

/**
 * Sum of sampled text length — a digest proxy for a page's content volume.
 *
 * A *sampled* sum, and therefore only ever comparable with another untruncated
 * one: above the collector's node cap every page measures the same, so two
 * capped pages of wildly different size read as exact parity. See
 * {@link truncationDetail}, the gate this number goes through.
 */
function contentVolume(page: PageEvidence): number {
  let total = 0;
  for (const node of page.document.textNodes) total += node.text.trim().length;
  return total;
}

/**
 * *"…/uk/ (1500 of 4000 examined text nodes)"* when the collector truncated
 * this page's text sample, `null` when the sample is all there was.
 *
 * The flag is the **presence of `textSampling.cappedAt`** — never `examined >
 * sampled`, and never the sample length measured against a ceiling this module
 * would have to hard-code. `MAX_TEXT_NODE_SAMPLES` is the collector's number,
 * and the kernel adjudicates bundles written by collectors it has never seen.
 *
 * A bundle collected before `schemaVersion` 3 carries no report at all and is
 * read as untruncated. That is the only reading available to it, it is exactly
 * how such a bundle was always compared, and reading an unknown as a truncation
 * would silence the rule on every stored bundle — including the small pages the
 * cap never came near.
 */
function truncationDetail(page: PageEvidence, locator: string): string | null {
  const sampling = page.document.textSampling;
  if (sampling?.cappedAt === undefined) return null;
  return `${locator} (${sampling.sampled} of ${sampling.examined} examined text nodes)`;
}

interface Counterpart {
  readonly page: PageEvidence;
  readonly language: string;
}

/**
 * The other-language pages this Ukrainian page's own hreflang alternates
 * declare.
 *
 * Goes through {@link alternateLanguage}, not `declaredLanguageOf`, so an
 * `x-default` alternate is skipped rather than becoming a phantom `x`
 * language: it is a routing declaration, and the page it points at is
 * conventionally the largest one on the site, so counting it would report the
 * Ukrainian version deficient against "its x counterpart" — with the statute
 * cited on it.
 */
function counterpartsOf(
  page: PageEvidence,
  pages: readonly PageEvidence[],
): readonly Counterpart[] {
  const result: Counterpart[] = [];
  for (const alternate of page.document.alternates) {
    const language = alternateLanguage(alternate);
    if (language === null || language === UK) continue;
    const counterpart = resolveTargetPage(pages, page, alternate.href);
    if (counterpart !== null) result.push({ page: counterpart, language });
  }
  return result;
}

function volumeFindingForPair(
  ukPage: PageEvidence,
  counterpart: PageEvidence,
  otherLanguage: string,
): FindingDraft | null {
  const ukLocator = locatorText(ukPage) ?? 'the Ukrainian page';
  const otherLocator = locatorText(counterpart) ?? 'its counterpart';

  // The sampling cap first: two sampled sums are only each other's units when
  // neither sample was truncated. A truncated pair is silently comparable in
  // both directions at once — a Ukrainian version genuinely a third the size of
  // its counterpart reads as parity if both sides overflowed, and a pair
  // straddling the cap reports a deficit that belongs to the collector rather
  // than to the site. Neither may carry a statute citation, so the pair is
  // reported as unmeasured instead of measured wrong.
  const truncated = [
    truncationDetail(ukPage, ukLocator),
    truncationDetail(counterpart, otherLocator),
  ].filter((detail): detail is string => detail !== null);
  if (truncated.length > 0) {
    return {
      grounding: DECLARED,
      verdict: INFO,
      subject: subjectOf(ukPage),
      evidence: [pageRef(ukPage), pageRef(counterpart)],
      summary:
        `Content volume was not measured between ${ukLocator} and its ${otherLanguage} counterpart ` +
        `at ${otherLocator}: the collector's text-sampling cap truncated ${truncated.join(' and ')}, ` +
        `so comparing their sampled character counts would measure that cap rather than these pages. ` +
        `${UA_VOLUME_PARITY_CLAUSE}; this pair was not assessed against that requirement.`,
    };
  }

  const ukVolume = contentVolume(ukPage);
  const otherVolume = contentVolume(counterpart);
  if (otherVolume === 0) return null;
  const deficit = (otherVolume - ukVolume) / otherVolume;
  if (deficit <= UA_VERSION_VOLUME_DELTA_THRESHOLD) return null;
  const percent = Math.round(deficit * PERCENT_SCALE);
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: subjectOf(ukPage),
    evidence: [pageRef(ukPage), pageRef(counterpart)],
    summary:
      `${ukLocator} carries ${ukVolume} sampled content characters against ${otherVolume} for its ` +
      `${otherLanguage} counterpart at ${otherLocator} (${percent}% less). ${UA_VOLUME_PARITY_CLAUSE}.`,
  };
}

/** Per-page content volume compared across each Ukrainian page's declared hreflang pairs. */
function volumePairFindings(pages: readonly PageEvidence[]): readonly FindingDraft[] {
  const drafts: FindingDraft[] = [];
  const ukPages = pages.filter((page) => declaredServedLanguage(page.document) === UK);
  for (const ukPage of ukPages) {
    for (const counterpart of counterpartsOf(ukPage, pages)) {
      const draft = volumeFindingForPair(ukPage, counterpart.page, counterpart.language);
      if (draft !== null) drafts.push(draft);
    }
  }
  return drafts;
}

const stateLanguageVersionLesser: PackRule<'site'> = {
  id: 'ua/state-language-version-lesser',
  title: 'The Ukrainian version is smaller in volume or content than another',
  capabilities: SITE_ONLY,
  grounding: DECLARED,
  scope: SITE_SCOPE,
  citation: UA_CITATION,
  run(ctx) {
    if (!marketAppliesSitewide(ctx.pages)) return notApplicable(MARKET_NOT_DETERMINED);
    const drafts = [...versionCountFindings(ctx.pages), ...volumePairFindings(ctx.pages)];
    return drafts.length > 0 ? findings(...drafts) : pass();
  },
};

// --- ua/state-language-interface-elements -------------------------------------
//
// Deliberately NOT hybrid (not marked so in the catalogue) — this rule never
// touches the classifier. It only catches interface chrome the site's own
// markup explicitly declares in another language (TextNodeSample.inheritedLang),
// on a page that itself declares Ukrainian. Chrome text with NO declared lang
// at all is core/lang-part-unmarked's territory (classifier-gated, not yet
// implemented), not this rule's.

const CHROME_REGIONS: ReadonlySet<string> = new Set(['nav', 'footer', 'header']);

function chromeTextNodes(doc: DocumentEvidence): readonly TextNodeSample[] {
  return doc.textNodes.filter(
    (node) => node.region !== undefined && CHROME_REGIONS.has(node.region),
  );
}

interface ChromeLanguageMismatch {
  readonly node: TextNodeSample;
  readonly rawLang: string;
  readonly declaredLang: string;
}

function chromeLanguageMismatches(
  nodes: readonly TextNodeSample[],
): readonly ChromeLanguageMismatch[] {
  const mismatches: ChromeLanguageMismatch[] = [];
  for (const node of nodes) {
    const rawLang = node.inheritedLang;
    if (rawLang === null) continue;
    const declaredLang = declaredLanguageOf(rawLang);
    if (declaredLang !== UK) mismatches.push({ node, rawLang, declaredLang });
  }
  return mismatches;
}

const stateLanguageInterfaceElements: PackRule<'page'> = {
  id: 'ua/state-language-interface-elements',
  title: 'Interface chrome is not in Ukrainian on a Ukrainian-serving page',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE_SCOPE,
  citation: UA_CITATION,
  run(ctx) {
    const signals = determineMarket(ctx.page);
    if (signals.length === 0) return notApplicable(MARKET_NOT_DETERMINED);

    const tag = presentLang(ctx.page.document.htmlLang);
    if (tag === null || declaredLanguageOf(tag) !== UK) return notApplicable(PAGE_NOT_UK_SERVING);

    const chrome = chromeTextNodes(ctx.page.document);
    if (chrome.length === 0) return notApplicable(NO_CHROME_TEXT_SAMPLED);

    const mismatches = chromeLanguageMismatches(chrome);
    if (mismatches.length === 0) return pass();

    const drafts: FindingDraft[] = mismatches.map(({ node, rawLang }) => ({
      grounding: DECLARED,
      verdict: WARN,
      subject: subjectOf(ctx.page, node.nodePath),
      evidence: [nodeRef(ctx.page, node.nodePath)],
      summary:
        `The page declares Ukrainian (<html lang="${tag}">), but its ${node.region ?? 'interface chrome'} ` +
        `explicitly declares lang="${rawLang}" — the interface chrome does not match the page's own ` +
        `Ukrainian declaration (${UA_SERVICE_OBLIGATION_CLAUSE}).`,
    }));
    return findings(...drafts);
  },
};

/** Family F — the six `ua` jurisdiction-pack rules. */
export const uaPackFamily: RuleFamily = {
  id: 'F. ua jurisdiction pack',
  title: "Ukraine's Law 2704-VIII Art. 27 §6 — state-language default-loading and version parity",
  rules: [
    marketDetermination,
    stateLanguageAbsent,
    stateLanguageNotDefault,
    stateLanguageNotDefaultByIp,
    stateLanguageVersionLesser,
    stateLanguageInterfaceElements,
  ],
};
