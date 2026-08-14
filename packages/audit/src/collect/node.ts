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
import type { Evidence, PageEvidence, ProbeEvidence, RobotsPosture, Vantage } from '../evidence';
import { createPageSet, finalUrlOf, LOCAL_VANTAGE } from './assemble';
import type { CollectedPage, PageSet } from './assemble';
import { digestDocument } from './digest';
import { createProber, parseRobots, robotsAllows, sha256 } from './probe';
import type { Prober } from './probe';

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
    const pageId = body === null ? undefined : addPage(pages, probe, body, 'requested');
    probes.push(pageId === undefined ? probe : { ...probe, pageId });
  }

  const robots = await resolveRobots(options, prober);
  if (options.followDeclaredTargets === true) {
    await followDeclared(prober, pages, probes, robots);
  }

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: { kind: 'network', vantage, probes, robots: robots.posture },
    collectedAt: options.now ?? new Date().toISOString(),
    collector: { id: COLLECTOR_ID, version: '1' },
    pages: pages.pages(),
  };
}

/**
 * Record the document one probe served. Node hashes the body itself — the probe
 * already carries a `bodyHash`, but only for a body it did not withhold, and
 * recomputing keeps this independent of that.
 */
function addPage(
  pages: PageSet,
  probe: ProbeEvidence,
  body: string,
  reach: PageEvidence['reach'],
): string {
  return pages.add({
    url: finalUrlOf(probe),
    body,
    reach,
    linkHeader: probe.responseHeaders['link'] ?? '',
    identity: sha256(body),
  });
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
  pages: PageSet,
  probes: ProbeEvidence[],
  robots: ResolvedRobots,
): Promise<void> {
  // Snapshotted before the loop: the targets are the ones the MATRIX revealed,
  // and following a target's own declarations too would be crawling.
  const declared = declaredTargetsOf(pages.entries());

  for (const target of declared) {
    if (prober.remaining() === 0) break;
    if (!robots.allows(new URL(target).pathname)) continue;
    const { probe, body } = await prober.probe({ url: target, acceptLanguage: null });
    const pageId = body === null ? undefined : addPage(pages, probe, body, 'declared-target');
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
