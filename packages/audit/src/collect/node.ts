/**
 * `@movar/audit/collect-node` — the Node collector.
 *
 * The opt-in half of the package, mirroring how `@movar/lang-detect` keeps a
 * franc-free barrel behind an explicit `/franc` subpath. Importing
 * `@movar/audit` never reaches this module, so the kernel stays I/O-free and
 * jsdom-free; `purity.test.ts` enforces that rather than trusting it.
 *
 * Two collectors live here, emitting the same `Evidence`:
 *
 * - {@link collectNetwork} — the response matrix. The same URL fetched N times
 *   varying **only** `Accept-Language`, everything else identical, so the
 *   differential is valid even when the absolute is not.
 * - {@link collectFilesystem} — a built `dist/`, read off disk. No network
 *   location, so the matrix rules are structurally `not-collected` rather than
 *   quietly passing.
 *
 * Neither crawls. The network collector fetches the URL it is given plus the
 * targets that URL's own markup declares; the filesystem collector reads the
 * build it is pointed at.
 */

import { readdir, readFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { EVIDENCE_SCHEMA_VERSION } from '../evidence';
import type {
  CookiePosture,
  Evidence,
  PageEvidence,
  ProbeEvidence,
  RobotsPosture,
  Vantage,
} from '../evidence';
import { createPageSet, finalUrlOf, isServedResource, LOCAL_VANTAGE } from './assemble';
import type { CollectedPage, PageSet } from './assemble';
import { digestDocument } from './digest';
import { createProber, EMPTY_ROBOTS, parseRobots, robotsAllows, sha256 } from './probe';
import type { Prober, RobotsRules } from './probe';

export * from './assemble';
export * from './digest';
export * from './probe';

/** The header values the matrix varies. `null` is the no-preference leg. */
export const DEFAULT_MATRIX_HEADERS: readonly (string | null)[] = [null, 'uk', 'ru', 'en', 'de'];

const COLLECTOR_ID = 'node-fetch-jsdom';

export interface NetworkCollectOptions {
  readonly url: string;
  readonly headers?: readonly (string | null)[];
  readonly vantage?: Vantage;
  readonly budget?: number;
  /** Follow the targets the page's own markup declares. Grants `traversal`. */
  readonly followDeclaredTargets?: boolean;
  /**
   * Collect a warm leg as well as the cold one. Off by default, per ADR §4, and
   * stamped on the evidence when it is on. See {@link collectWarmLeg}.
   */
  readonly warm?: boolean;
  /** `robots.txt` applies to declared-target expansion, not the URL you typed. */
  readonly ignoreRobots?: boolean;
  readonly now?: string;
  readonly prober?: Prober;
  readonly fetchImpl?: Parameters<typeof createProber>[0]['fetchImpl'];
}

/**
 * Collect a response matrix, and optionally the declared targets it reveals.
 *
 * Every leg shares one vantage and one cookie state, so `matrixLegKey` in
 * `capability.ts` groups them as comparable — the differential the serving rules
 * adjudicate is only valid because nothing but the header changed. A `warm` run
 * collects a **second** matrix rather than changing this one, for exactly that
 * reason; see {@link collectWarmLeg}.
 */
export async function collectNetwork(options: NetworkCollectOptions): Promise<Evidence> {
  const vantage = options.vantage ?? LOCAL_VANTAGE;
  const prober =
    options.prober ??
    createProber({
      vantage,
      ...(options.budget === undefined ? {} : { budget: options.budget }),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    });

  const probes: ProbeEvidence[] = [];
  // The page set links each probe to the document its body produced. Without
  // that link the serving rules cannot answer "what language did this response
  // actually serve?" and silently degrade to `not-applicable`.
  const pages = createPageSet(digestDocument);

  for (const header of options.headers ?? DEFAULT_MATRIX_HEADERS) {
    if (prober.remaining() === 0) break;
    const { probe, body } = await prober.probe({ url: options.url, acceptLanguage: header });
    // The requested URL may 302 to the locale it prefers, so the page this leg
    // produced is the chain's destination — not the URL we asked for. Digesting
    // the redirect stub instead would make `core/serving-declared-never-served`
    // claim a language is never served when it plainly is.
    const pageId = body === null ? null : addPage(pages, probe, body, 'requested');
    probes.push(pageId === null ? probe : { ...probe, pageId });
  }

  if (options.warm === true) {
    await collectWarmLeg(prober, pages, probes, options);
  }

  const robots = robotsPostureOf(options);
  if (options.followDeclaredTargets === true) {
    await followDeclared(prober, pages, probes, createRobotsGate(prober, robots));
  }

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    // Stamped from the probes as well as the flag, so read last of all.
    source: { kind: 'network', vantage, probes, robots, cookies: cookiePostureOf(options, probes) },
    collectedAt: options.now ?? new Date().toISOString(),
    collector: { id: COLLECTOR_ID, version: '1' },
    pages: pages.pages(),
  };
}

/**
 * Record the document one probe served, or `null` when what it served is not a
 * document — an error template, which the page set refuses on the status. Node
 * hashes the body itself: the probe already carries a `bodyHash`, but only for
 * a body it did not withhold, and recomputing keeps this independent of that.
 */
function addPage(
  pages: PageSet,
  probe: ProbeEvidence,
  body: string,
  reach: PageEvidence['reach'],
): string | null {
  return pages.add({
    url: finalUrlOf(probe),
    body,
    reach,
    status: probe.status,
    headers: probe.responseHeaders,
    identity: sha256(body),
  });
}

/**
 * Was this a warm run? `cold` only when nothing about it was warm.
 *
 * ADR §4 makes the empty jar the default because a warm, logged-in session is
 * precisely a difference the matrix's "everything else identical" promise has
 * no room for. The flag answers first and on its own, because it says what the
 * operator **asked for**, and that is a claim the probes stop being able to
 * make: a warm leg that met a challenge interstitial, failed in transport, or
 * was priced out by the budget leaves a bundle whose probes are all cold, and
 * reading "this was a cold run" off that hands the collector's luck to the
 * operator as their own choice. `noWarmLegReason` in `rules/serving.ts` forks
 * on exactly that difference.
 *
 * The probes are then consulted, and only ever to say `warm`. `options.prober`
 * is an exported seam, so a caller may hand in a prober already built with
 * `cookieState: 'warm'` and never touch the flag; stamping `cold` on that
 * bundle is not the cautious reading, it is a false one, contradicted by every
 * probe beneath it. Asking through the flag and asking through the prober are
 * the same request, and neither direction can turn a warm probe into a cold
 * run. Read after collection for that reason — a posture taken before the
 * probes exist can only report half of this.
 */
function cookiePostureOf(
  options: NetworkCollectOptions,
  probes: readonly ProbeEvidence[],
): CookiePosture {
  if (options.warm === true) return 'warm';
  return probes.some((probe) => probe.cookieState === 'warm') ? 'warm' : 'cold';
}

/**
 * The warm leg's headers: one no-preference request first, then the caller's
 * explicit ones exactly as they were listed.
 *
 * The leading request is the one that fills the jar, and it must not state a
 * preference. A jar warmed by `Accept-Language: uk` holds whatever cookie *our
 * own header* talked the site into setting, so a warm `uk` probe answered in
 * Ukrainian demonstrates nothing — the question
 * `core/serving-cookie-overrides-header` asks is whether the language the site
 * picked **on its own** outranks a preference stated afterwards. Asking for
 * nothing is how the site is left to pick.
 *
 * So the `null` is **hoisted**, never assumed: a caller whose order does not
 * begin with one — or holds none at all — still opens the leg with it, and any
 * further `null` behind it is dropped, because a second request for nothing is
 * not the question this leg exists to ask. That is the only de-duplication
 * here. An explicit header the caller repeated stays repeated: collapsing it
 * would drop a leg that was asked for, which is the silent shortening this
 * module refuses everywhere else, and the cold matrix runs the same list
 * verbatim — the two legs must differ in the opening request and in nothing
 * else.
 */
function warmOrderOf(headers: readonly (string | null)[]): readonly (string | null)[] {
  return [null, ...headers.filter((header) => header !== null)];
}

/**
 * The warm leg: the same matrix a second time, over one jar the site fills.
 *
 * A second leg rather than a warmer version of the first, because a matrix leg
 * is `(url, vantage, cookieState)` — `matrixLegKey` in `capability.ts` says so,
 * and every family-C rule groups by it. Warming the one leg in place would not
 * give `core/serving-cookie-overrides-header` a warm reading to compare, it
 * would delete the cold reading it compares *against*, and take the header
 * differential every other rule in the family is adjudicated from with it.
 *
 * **Only the URL the operator typed goes warm.** `robots.txt` and the declared
 * targets keep the prober's own cold default, so no cookie this run collected
 * is ever presented to an origin nobody typed, and the expansion stays the
 * unauthenticated page view it is documented to be.
 *
 * The budget is the same hard ceiling, re-read before every probe and never
 * reserved out of the cold pass. A budget too small for both therefore buys the
 * cold matrix, which is the right way round: it is the leg the other six rules
 * need, and a run that could not afford the warm one says so — the posture is
 * on the evidence and the probes are not there.
 */
async function collectWarmLeg(
  prober: Prober,
  pages: PageSet,
  probes: ProbeEvidence[],
  options: NetworkCollectOptions,
): Promise<void> {
  for (const header of warmOrderOf(options.headers ?? DEFAULT_MATRIX_HEADERS)) {
    if (prober.remaining() === 0) break;
    const { probe, body } = await prober.probe({
      url: options.url,
      acceptLanguage: header,
      cookieState: 'warm',
    });
    const pageId = body === null ? null : addPage(pages, probe, body, 'requested');
    probes.push(pageId === null ? probe : { ...probe, pageId });
  }
}

/**
 * `robots.txt` is ignored for the single URL the operator typed — that is a page
 * view — and honoured for declared-target expansion, which is automated
 * multi-page access. `ignoreRobots` exists for auditing a site you own.
 */
function robotsPostureOf(options: NetworkCollectOptions): RobotsPosture {
  if (options.followDeclaredTargets !== true) return 'not-applicable';
  return options.ignoreRobots === true ? 'ignored' : 'honoured';
}

/**
 * The origin whose `robots.txt` governs a target, or `null` when none does. A
 * picker option's `javascript:` href resolves to an opaque origin with no
 * `robots.txt` to ask; such a target is left exactly as it was — probed, and
 * failing as the transport error it is — rather than spending a request on a
 * URL that cannot exist.
 */
function robotsOriginOf(target: string): string | null {
  const { origin, protocol } = new URL(target);
  return protocol === 'http:' || protocol === 'https:' ? origin : null;
}

/**
 * One origin's rules. An unfetchable or unreadable `robots.txt` is permissive —
 * a site that publishes no rules has asked for nothing — and the `catch` keeps
 * that true of a probe that throws rather than answers, so asking for a
 * permission slip is never what ends the run.
 *
 * That covers the budget too. A `robots.txt` chain that reaches the ceiling
 * mid-redirect throws `RequestBudgetExhaustedError` out of `probe`, and it is
 * caught here and read as "no rules published" — but no target is ever fetched
 * on the strength of rules nobody read, because {@link followDeclared} re-reads
 * the ceiling the moment the gate returns and stops there.
 *
 * Rules are read from a **2xx** body and no other, which is the same judgement
 * `createPageSet` makes about a page and the same predicate. A site answering
 * `404` for `/robots.txt` has published none — RFC 9309 §2.3.1.3 says so
 * outright — and what it answers *with* is an error template, so parsing that
 * asks a "not found" page which paths this crawler may fetch. Today's templates
 * yield nothing, since a directive has to survive `parseRobotsLine` as a whole
 * line, but that is a property of their markup rather than a guarantee, and it
 * fails in both directions: a `Disallow:`-shaped line in an error page or a
 * syntax example withholds a target the site permits — published as
 * `core/hreflang-target-unresolvable` "cannot be reached" about a page that
 * serves perfectly well — and an `Allow:` in one manufactures permission the
 * site never gave.
 *
 * A `5xx` stays permissive with everything else here, deliberately not RFC 9309
 * §2.3.1.4's optional "assume complete disallow": this module already reads a
 * transport failure as "no rules published", and a server too broken to answer
 * is not a site that asked for anything.
 */
async function fetchRobots(prober: Prober, origin: string): Promise<RobotsRules> {
  try {
    const { probe, body } = await prober.probe({
      url: `${origin}/robots.txt`,
      acceptLanguage: null,
    });
    const served = probe.outcome === 'ok' && isServedResource(probe.status);
    return served && body !== null ? parseRobots(body) : EMPTY_ROBOTS;
  } catch {
    return EMPTY_ROBOTS;
  }
}

/**
 * May this declared target be fetched?
 *
 * `robots.txt` binds the origin that serves it and no other, and a declared
 * alternate routinely lives on an origin the operator never typed — the
 * cross-domain locale pattern, `brand.de` beside `brand.pl`. Reading the typed
 * URL's rules over every target was wrong in both directions: it withheld
 * `example.de/de/` because `example.com` said `Disallow: /de`, which left
 * `core/hreflang-target-unresolvable` publishing "cannot be reached" about a
 * page that serves perfectly well — a false accusation about a named company —
 * and it never asked `example.de` at all, so this module's stated posture went
 * unhonoured on every origin but the first.
 *
 * Each origin is resolved once and cached, refusals and failures alike: N
 * targets on one origin cost one request, and an origin whose `robots.txt` is
 * unreachable is not asked again per target. That fetch is the honest price of
 * the posture, and it is paid out of the same budget.
 *
 * Nothing is held back for it, because a reserve cannot be sized. `probe`
 * charges a request **per redirect hop**, and a `robots.txt` that redirects —
 * `http`→`https`, `www`→apex, CDN normalisation — is ordinary, so a reserve of
 * two bought the target nothing and the probe behind it walked into
 * `RequestBudgetExhaustedError`; sized larger it withholds targets the budget
 * could have paid for, and a withheld target is published as "cannot be
 * reached" about a site that serves it. The gate is only ever asked while a
 * request remains, so it asks, and {@link followDeclared} re-reads the ceiling
 * afterwards. `false` from here therefore means one thing: the site said no.
 */
function createRobotsGate(
  prober: Prober,
  posture: RobotsPosture,
): (target: string) => Promise<boolean> {
  const byOrigin = new Map<string, RobotsRules>();

  return async (target) => {
    if (posture !== 'honoured') return true;
    const origin = robotsOriginOf(target);
    if (origin === null) return true;
    let rules = byOrigin.get(origin);
    if (rules === undefined) {
      rules = await fetchRobots(prober, origin);
      byOrigin.set(origin, rules);
    }
    return robotsAllows(rules, robotsSubjectOf(target));
  };
}

/**
 * The URLs the collected pages' own markup declares — hreflang alternates and
 * picker targets. **Only** these; discovering a link and following it would turn
 * a user-initiated audit into a scan.
 */
function declaredTargetsOf(pages: readonly CollectedPage[]): ReadonlySet<string> {
  const declared = new Set<string>();
  for (const entry of pages) {
    const { alternates, picker } = entry.digest.document;
    for (const alternate of alternates) {
      const resolved = safeUrl(alternate.href, entry.page.url);
      if (resolved !== null) declared.add(resolved);
    }
    for (const option of picker?.options ?? []) {
      const resolved = option.href === null ? null : safeUrl(option.href, entry.page.url);
      if (resolved !== null) declared.add(resolved);
    }
  }
  return declared;
}

/**
 * The declared targets in the order a budget too small for all of them should
 * buy them: the pages the audit does not already hold, first.
 *
 * A target the page set already holds can only add a `reach` upgrade — the
 * document is collected either way. A target it lacks is one the report will
 * otherwise publish as `core/hreflang-target-unresolvable`, "the declared
 * alternate cannot be reached", about a site that serves it perfectly well.
 * Spending a scarce budget in markup order put the ubiquitous self-referential
 * `<link rel="alternate" hreflang="en" href="/">` ahead of the cross-origin
 * alternate behind it and manufactured exactly that accusation — the same one
 * per-origin resolution exists to prevent, arriving by way of the budget.
 *
 * Stable within each half, so a run is still reproducible.
 */
function budgetOrderOf(
  declared: ReadonlySet<string>,
  pages: readonly CollectedPage[],
): readonly string[] {
  const collected = new Set(pages.map((entry) => entry.page.url));
  const targets = [...declared];
  return [
    ...targets.filter((target) => !collected.has(target)),
    ...targets.filter((target) => collected.has(target)),
  ];
}

/**
 * What a `robots.txt` rule is matched against. RFC 9309 §2.2.2 matches a rule
 * against the path **and** the query, so `Disallow: /*?` — the idiom for "do
 * not crawl query strings" — can only fire on a subject that still carries its
 * `?`. Handing the matcher a bare `URL.pathname` silently defeated that pattern
 * on exactly the targets it exists for: a language switch carried in the query
 * (`?lang=`, `?hl=`, `?locale=`) is a declared target whose query is the whole
 * point of it. The fragment is left out because it never reaches the server.
 */
function robotsSubjectOf(target: string): string {
  const { pathname, search } = new URL(target);
  return `${pathname}${search}`;
}

/** Follow only what the collected pages' own markup declares. Never discovery. */
async function followDeclared(
  prober: Prober,
  pages: PageSet,
  probes: ProbeEvidence[],
  allows: (target: string) => Promise<boolean>,
): Promise<void> {
  // Snapshotted before the loop: the targets are the ones the MATRIX revealed,
  // and following a target's own declarations too would be crawling.
  const entries = pages.entries();
  const declared = budgetOrderOf(declaredTargetsOf(entries), entries);

  for (const target of declared) {
    if (prober.remaining() === 0) break;
    if (!(await allows(target))) continue;
    // Re-read, never reserved: the gate may have bought this origin's
    // `robots.txt`, and `probe` charges a request per redirect hop, so how much
    // that cost is not knowable before it is spent. Asking again is what keeps
    // a permission slip from exhausting the budget out from under the probe it
    // authorizes — the guarantee a fixed reserve could not make.
    if (prober.remaining() === 0) break;
    const { probe, body } = await prober.probe({ url: target, acceptLanguage: null });
    const pageId = body === null ? null : addPage(pages, probe, body, 'declared-target');
    probes.push(pageId === null ? probe : { ...probe, pageId });
  }
}

function safeUrl(href: string, base: string | undefined): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Filesystem                                                                  */
/* -------------------------------------------------------------------------- */

export interface FilesystemCollectOptions {
  readonly root: string;
  /** Cap on pages read, so a huge build cannot produce an unbounded bundle. */
  readonly maxPages?: number;
  readonly now?: string;
}

export const DEFAULT_MAX_BUILD_PAGES = 200;

async function htmlFilesUnder(root: string, limit: number): Promise<readonly string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    if (found.length >= limit) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (found.length >= limit) return;
      const path = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name === 'node_modules') continue;
        await walk(path);
        continue;
      }
      if (entry.name.endsWith('.html')) found.push(path);
    }
  };
  await walk(root);
  return found.toSorted((one, other) => one.localeCompare(other));
}

/**
 * Read a built `dist/` as evidence. A filesystem has no network location, so
 * `source` carries no vantage and no probes — which is what makes every matrix
 * rule structurally `not-collected` instead of vacuously passing.
 */
export async function collectFilesystem(options: FilesystemCollectOptions): Promise<Evidence> {
  const limit = options.maxPages ?? DEFAULT_MAX_BUILD_PAGES;
  const files = await htmlFilesUnder(options.root, limit);
  const pages: PageEvidence[] = [];

  for (const [index, file] of files.entries()) {
    const html = await readFile(file, 'utf8');
    // `/uk/index.html` is the page at `/uk/`; the kernel's locator normalizes
    // the two, so the path is recorded as the site would address it.
    const path = `/${nodePath.relative(options.root, file).split(nodePath.sep).join('/')}`;
    // Taking only `document` is safe *because* the sampling report is a field
    // of it — `DigestResult.sampling` is the same object, not the only copy.
    const { document } = digestDocument(html, {});
    pages.push({
      id: `page-${index + 1}`,
      path,
      reach: 'requested',
      rendered: false,
      document,
    });
  }

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: { kind: 'filesystem', root: options.root },
    collectedAt: options.now ?? new Date().toISOString(),
    collector: { id: COLLECTOR_ID, version: '1' },
    pages,
  };
}
