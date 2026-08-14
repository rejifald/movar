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
  AlternateLink,
  Evidence,
  PageEvidence,
  ProbeEvidence,
  RobotsPosture,
  Vantage,
} from '../evidence';
import { digestDocument } from './digest';
import type { DigestResult } from './digest';
import { createProber, parseRobots, robotsAllows, sha256 } from './probe';
import type { Prober } from './probe';

export * from './digest';
export * from './probe';

/** The header values the matrix varies. `null` is the no-preference leg. */
export const DEFAULT_MATRIX_HEADERS: readonly (string | null)[] = [null, 'uk', 'ru', 'en', 'de'];

const COLLECTOR_ID = 'node-fetch-jsdom';

/** A `local` vantage always carries a real id; its country is never assumed. */
export const LOCAL_VANTAGE: Vantage = { id: 'local', kind: 'local' };

export interface NetworkCollectOptions {
  readonly url: string;
  readonly headers?: readonly (string | null)[];
  readonly vantage?: Vantage;
  readonly budget?: number;
  /** Follow the targets the page's own markup declares. Grants `traversal`. */
  readonly followDeclaredTargets?: boolean;
  /** `robots.txt` applies to declared-target expansion, not the URL you typed. */
  readonly ignoreRobots?: boolean;
  readonly now?: string;
  readonly prober?: Prober;
  readonly fetchImpl?: Parameters<typeof createProber>[0]['fetchImpl'];
}

/**
 * Split a `Link` header into its comma-separated parts.
 *
 * Scanned rather than split by regex: the natural pattern needs a lookahead over
 * optional whitespace, which is the shape that backtracks super-linearly, and
 * these are bytes from an audited site. Tracking `<…>` depth also keeps a comma
 * inside a URL from splitting one part into two.
 */
function splitLinkParts(value: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '<') depth += 1;
    else if (char === '>') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

/** The `<…>` target of a `Link` part. Scanned, not matched, for the reason above. */
function bracketed(part: string): string | undefined {
  const open = part.indexOf('<');
  if (open === -1) return undefined;
  const close = part.indexOf('>', open + 1);
  return close === -1 ? undefined : part.slice(open + 1, close);
}

/**
 * One `name=value` parameter of a `Link` header part, unquoted.
 *
 * Split-and-match rather than one regex over the whole part: a pattern with
 * adjacent optional-quote groups is exactly the shape that backtracks
 * super-linearly on hostile input, and this parses bytes from an audited site.
 */
function attributeOf(part: string, name: string): string | undefined {
  for (const segment of part.split(';')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    if (segment.slice(0, eq).trim().toLowerCase() !== name) continue;
    return segment
      .slice(eq + 1)
      .trim()
      .replaceAll('"', '');
  }
  return undefined;
}

/** Parse `Link: <…>; rel="alternate"; hreflang="uk"` into alternates. */
export function parseLinkHeader(value: string | undefined): readonly AlternateLink[] {
  if (value === undefined || value.trim() === '') return [];
  const found: AlternateLink[] = [];
  for (const part of splitLinkParts(value)) {
    const href = bracketed(part);
    const hreflang = attributeOf(part, 'hreflang');
    const rel = attributeOf(part, 'rel');
    if (href === undefined || hreflang === undefined) continue;
    if (rel?.toLowerCase().includes('alternate') !== true) continue;
    found.push({ hreflang, href, source: 'header' });
  }
  return found;
}

/** The URL a probe actually ended on, after its recorded redirect chain. */
function finalUrlOf(probe: ProbeEvidence): string {
  const last = probe.redirectChain.at(-1);
  if (last === undefined) return probe.url;
  try {
    return new URL(last.location, last.url).toString();
  } catch {
    return probe.url;
  }
}

interface CollectedPage {
  readonly page: PageEvidence;
  readonly digest: DigestResult;
}

/**
 * The response headers the DOM tier folds into the document digest.
 *
 * Passed as the whole header bag rather than one positional string per header:
 * `Link:` and `Content-Language:` are both declarations the head duplicates,
 * and every future one would otherwise add another argument to three call
 * sites that only pass it through.
 */
type ResponseHeaders = Readonly<Record<string, string>>;

function pageFrom(
  id: string,
  url: string,
  body: string,
  headers: ResponseHeaders,
  reach: PageEvidence['reach'],
): CollectedPage {
  const contentLanguage = headers['content-language'];
  const digest = digestDocument(body, {
    url,
    headerAlternates: parseLinkHeader(headers['link'] ?? ''),
    ...(contentLanguage === undefined ? {} : { contentLanguageHeader: contentLanguage }),
  });
  return {
    page: { id, url, reach, rendered: false, document: digest.document },
    digest,
  };
}

/**
 * Collect a response matrix, and optionally the declared targets it reveals.
 *
 * Every leg shares one vantage and one cookie state, so `matrixLegKey` in
 * `capability.ts` groups them as comparable — the differential the serving rules
 * adjudicate is only valid because nothing but the header changed.
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
  const pages: CollectedPage[] = [];
  const seenDocuments = new Map<string, string>();

  /**
   * Digest a body into a page and return that page's id, so the probe can name
   * it. Without this link the serving rules cannot answer "what language did
   * this response actually serve?" and silently degrade to `not-applicable`.
   *
   * Keyed by URL **and body identity**, never URL alone. Content negotiation at
   * a single URL — `/` answering Ukrainian or English by header, with no
   * redirect — is the exact case the response matrix exists to measure, and
   * folding those legs onto one page makes every serving rule read the first
   * leg's language for all of them. Identical bodies at one URL still collapse,
   * which is the dedupe worth having: it saves a parse and keeps the page set
   * honest about how many distinct documents were actually served.
   */
  const digestInto = (
    url: string,
    body: string,
    reach: PageEvidence['reach'],
    headers: ResponseHeaders,
  ): string => {
    const key = `${url} ${sha256(body)}`;
    const existing = seenDocuments.get(key);
    if (existing !== undefined) return existing;
    const id = `page-${pages.length + 1}`;
    seenDocuments.set(key, id);
    pages.push(pageFrom(id, url, body, headers, reach));
    return id;
  };

  for (const header of options.headers ?? DEFAULT_MATRIX_HEADERS) {
    if (prober.remaining() === 0) break;
    const { probe, body } = await prober.probe({ url: options.url, acceptLanguage: header });
    // The requested URL may 302 to the locale it prefers, so the page this leg
    // produced is the chain's destination — not the URL we asked for. Digesting
    // the redirect stub instead would make `core/serving-declared-never-served`
    // claim a language is never served when it plainly is.
    const pageId =
      body === null
        ? undefined
        : digestInto(finalUrlOf(probe), body, 'requested', probe.responseHeaders);
    probes.push(pageId === undefined ? probe : { ...probe, pageId });
  }

  const robots = await resolveRobots(options, prober);
  if (options.followDeclaredTargets === true) {
    await followDeclared(prober, pages, probes, robots, digestInto);
  }

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: { kind: 'network', vantage, probes, robots: robots.posture },
    collectedAt: options.now ?? new Date().toISOString(),
    collector: { id: COLLECTOR_ID, version: '1' },
    pages: pages.map((entry) => entry.page),
  };
}

interface ResolvedRobots {
  readonly posture: RobotsPosture;
  readonly allows: (path: string) => boolean;
}

/**
 * `robots.txt` is ignored for the single URL the operator typed — that is a page
 * view — and honoured for declared-target expansion, which is automated
 * multi-page access. `ignoreRobots` exists for auditing a site you own.
 */
async function resolveRobots(
  options: NetworkCollectOptions,
  prober: Prober,
): Promise<ResolvedRobots> {
  if (options.followDeclaredTargets !== true) {
    return { posture: 'not-applicable', allows: () => true };
  }
  if (options.ignoreRobots === true) return { posture: 'ignored', allows: () => true };

  try {
    const origin = new URL(options.url).origin;
    const { probe, body } = await prober.probe({
      url: `${origin}/robots.txt`,
      acceptLanguage: null,
    });
    if (probe.outcome !== 'ok' || body === null) {
      return { posture: 'honoured', allows: () => true };
    }
    const rules = parseRobots(body);
    return { posture: 'honoured', allows: (path) => robotsAllows(rules, path) };
  } catch {
    return { posture: 'honoured', allows: () => true };
  }
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

/** Follow only what the collected pages' own markup declares. Never discovery. */
async function followDeclared(
  prober: Prober,
  pages: readonly CollectedPage[],
  probes: ProbeEvidence[],
  robots: ResolvedRobots,
  digestInto: (
    url: string,
    body: string,
    reach: PageEvidence['reach'],
    headers: ResponseHeaders,
  ) => string,
): Promise<void> {
  const declared = declaredTargetsOf(pages);

  for (const target of declared) {
    if (prober.remaining() === 0) break;
    if (!robots.allows(new URL(target).pathname)) continue;
    const { probe, body } = await prober.probe({ url: target, acceptLanguage: null });
    const pageId =
      body === null
        ? undefined
        : digestInto(finalUrlOf(probe), body, 'declared-target', probe.responseHeaders);
    probes.push(pageId === undefined ? probe : { ...probe, pageId });
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
