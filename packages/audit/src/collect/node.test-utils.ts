import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import type { FetchLike, FetchLikeResponse } from './probe';
import type { Evidence, NetworkSource, PageEvidence } from '../evidence';
import type { Report, RuleResult } from '../report';

export function networkSource(evidence: Evidence): NetworkSource {
  if (evidence.source.kind !== 'network') throw new Error('expected network evidence');
  return evidence.source;
}

/** The first collected page, so assertions never sit inside an optional chain. */
export function firstPage(evidence: Evidence): PageEvidence {
  const page = evidence.pages[0];
  if (page === undefined) throw new Error('expected at least one collected page');
  return page;
}

/** One rule's result, so a renamed rule fails loudly rather than asserting on nothing. */
export function ruleResult(report: Report, rule: string): RuleResult {
  const result = report.results.find((candidate) => candidate.rule === rule);
  if (result === undefined) throw new Error(`expected ${rule} in the report`);
  return result;
}

export interface Stub {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export async function tick(): Promise<void> {
  await Promise.resolve();
}

export function respond(stub: Stub): FetchLikeResponse {
  const headers = stub.headers ?? {};
  return {
    status: stub.status,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
      forEach: (fn: (value: string, key: string) => void) => {
        for (const [key, value] of Object.entries(headers)) fn(value, key);
      },
    },
    text: async () => {
      await tick();
      return stub.body ?? '';
    },
  };
}

/** Routes keyed by `${acceptLanguage ?? '-'} ${url}`, falling back to url alone. */
export function routed(routes: Readonly<Record<string, Stub>>): FetchLike {
  return async (url, init) => {
    await tick();
    const lang = init.headers['accept-language'] ?? '-';
    const stub = routes[`${lang} ${url}`] ?? routes[url];
    if (stub === undefined) throw new Error(`unstubbed ${lang} ${url}`);
    return respond(stub);
  };
}

/** Every `Cookie` header a set of requests carried, so a failure names it. */
export function cookiesOn(
  requests: readonly { readonly headers: Readonly<Record<string, string>> }[],
): readonly string[] {
  return requests.flatMap((request) => request.headers['cookie'] ?? []);
}

/** Wraps a `FetchLike` to record every URL asked for, in order. */
export function recording(log: string[], inner: FetchLike): FetchLike {
  return async (url, init) => {
    log.push(url);
    return inner(url, init);
  };
}

export const HOME = 'https://example.com/';
export const UK = 'https://example.com/uk/';
export const DE = 'https://example.com/de/';
/** A language switch carried entirely in the query — `?lang=`, `?hl=`, `?locale=`. */
export const QUERY_UK = 'https://example.com/?lang=uk';
export const HOME_ROBOTS = 'https://example.com/robots.txt';
/** The cross-domain locale pattern: `brand.de` beside `brand.com`, its own origin. */
export const CROSS_DE = 'https://example.de/de/';
export const CROSS_AT = 'https://example.de/at/';
export const CROSS_ROBOTS = 'https://example.de/robots.txt';
/** Where a redirecting `robots.txt` lands — `http`→`https`, `www`→apex, a CDN rewrite. */
export const CROSS_ROBOTS_MOVED = 'https://example.de/robots-moved.txt';
export const ALLOW_ALL = 'User-agent: *\nDisallow:';
/**
 * A `robots.txt` that 404s into the site's HTML error page — with directive-
 * shaped lines in the template, which is what separates "read the rules the
 * site published" from "read whatever the error page happens to say". Contrived
 * markup, real property: a syntax example, a help page, or an echo of the
 * requested path can each put a whole `Disallow:` line in a body that is not a
 * `robots.txt` at all.
 */
export const NOT_FOUND_ROBOTS =
  '<html lang="en"><body><h1>Not found</h1><pre>\nUser-agent: *\nDisallow: /at/\n</pre></body></html>';

export const EN_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>english body</p></body></html>';
export const UK_PAGE =
  '<html lang="uk"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>українське тіло</p></body></html>';
/** One page, one alternate, and the alternate is the page itself. Extremely common markup. */
export const SELF_ALTERNATE_PAGE =
  `<html lang="en"><head><link rel="alternate" hreflang="en" href="${HOME}">` +
  '</head><body><p>english body</p></body></html>';
/**
 * One alternate switches language by query parameter and one by path. The query
 * is the whole target here — `/` and `/?lang=uk` are different pages, and only
 * the query tells them apart.
 */
export const QUERY_SWITCH_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/?lang=uk">' +
  '<link rel="alternate" hreflang="de" href="/de/"></head>' +
  '<body><p>english body</p></body></html>';
export const DE_PAGE =
  '<html lang="de"><head></head><body><p>deutscher fließtext</p></body></html>';
/** A page whose German alternate lives on another origin — `brand.de` beside `brand.com`. */
export const CROSS_ORIGIN_PAGE =
  `<html lang="en"><head><link rel="alternate" hreflang="en" href="${HOME}">` +
  `<link rel="alternate" hreflang="de" href="${CROSS_DE}"></head>` +
  '<body><p>english body</p></body></html>';
/** A picker whose German entry navigates by script, so its target has no origin. */
export const SCRIPTED_PICKER_PAGE =
  '<html lang="en"><head></head><body><nav><ul>' +
  '<li><a href="javascript:void(0)" hreflang="de">Deutsch</a></li>' +
  '<li><a href="/uk/" hreflang="uk">Українська</a></li>' +
  '</ul></nav><p>english body</p></body></html>';
/**
 * An ordinary HTML error document. The site answered — that is why it is not a
 * transport error and not a challenge — and what it answered is that the page
 * is not there. Its `<html lang>` belongs to the error template, never to the
 * version the declaring page said would be here.
 */
export const NOT_FOUND_PAGE =
  '<html lang="en"><head><title>Not found</title></head>' +
  '<body><p>that page does not exist</p></body></html>';
/** Two alternates on the same second origin, so one robots.txt covers both. */
export const TWO_CROSS_TARGETS_PAGE =
  `<html lang="en"><head><link rel="alternate" hreflang="de" href="${CROSS_DE}">` +
  `<link rel="alternate" hreflang="de-AT" href="${CROSS_AT}"></head>` +
  '<body><p>english body</p></body></html>';

/** A two-locale build on disk, for the filesystem collector. */
export async function buildSite(): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-audit-'));
  await writeFile(nodePath.join(root, 'index.html'), EN_PAGE, 'utf8');
  await mkdir(nodePath.join(root, 'uk'), { recursive: true });
  await writeFile(nodePath.join(root, 'uk', 'index.html'), UK_PAGE, 'utf8');
  return root;
}
