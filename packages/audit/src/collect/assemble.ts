/**
 * The runtime-agnostic half of collection: turning probe results into the
 * `PageEvidence` set an `Evidence` bundle carries.
 *
 * Everything here is pure string/URL work over the probe shape, so it holds for
 * any collector — Node's `fetch` tier and the host app's Swift/`URLSession`
 * tier both hand it the same three things (a final URL, a body, a `Link`
 * header) and get back the same page identities. It is deliberately *not* in
 * the kernel: it is collection, not adjudication, and `evaluate()` never runs
 * it. It is equally deliberately not in `./node.ts`, which imports `node:fs`
 * and so cannot be reached from a browser bundle at all.
 *
 * Sharing this rather than reimplementing it per runtime is the point. Two
 * collectors that disagree about whether `Link: <…>; rel="alternate"` counts as
 * a declared alternate are two collectors that report different findings about
 * the same site, and `Evidence` is supposed to be the only thing they share.
 */

import type { AlternateLink, PageEvidence, ProbeEvidence, Vantage } from '../evidence';
import type { DigestOptions, DigestResult } from './digest-dom';

/**
 * The device the audit is running on. A `local` vantage always carries a real
 * id and never claims a country: where the machine actually egresses from is
 * not something the collector can know, and `VantageCountry.claimed` is a claim
 * a human makes, never one a collector invents.
 */
export const LOCAL_VANTAGE: Vantage = { id: 'local', kind: 'local' };

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
export function finalUrlOf(probe: ProbeEvidence): string {
  const last = probe.redirectChain.at(-1);
  if (last === undefined) return probe.url;
  try {
    return new URL(last.location, last.url).toString();
  } catch {
    return probe.url;
  }
}

/**
 * A page plus the digest that produced it. The sampling report is reachable
 * from either side — it is a field of `page.document` as well as of `digest`.
 */
export interface CollectedPage {
  readonly page: PageEvidence;
  readonly digest: DigestResult;
}

/** Parse-and-reduce, supplied by the runtime. jsdom under Node, `DOMParser` in a WebView. */
export type Digester = (html: string, options: DigestOptions) => DigestResult;

/**
 * The response headers the DOM tier folds into the document digest.
 *
 * Passed as the whole bag rather than one positional string per header:
 * `Link:` and `Content-Language:` are both declarations the head duplicates,
 * and every future one would otherwise add another argument to call sites that
 * only pass it through.
 */
export type ResponseHeaders = Readonly<Record<string, string>>;

export interface AddPageInput {
  /** The URL the body was actually served from — the chain's destination. */
  readonly url: string;
  readonly body: string;
  readonly reach: PageEvidence['reach'];
  /** The response's own headers, lower-cased. */
  readonly headers?: ResponseHeaders;
  /**
   * Byte identity of `body`, used with `url` as the dedupe key. Supplied rather
   * than computed because the two runtimes hash in different places — Node in
   * `node:crypto`, the WebView in Swift's CryptoKit on the way back — and
   * neither should be forced to hash twice.
   */
  readonly identity: string;
}

/**
 * The accumulating page set for one collection run.
 *
 * Keyed by URL **and body identity**, never URL alone. Content negotiation at a
 * single URL — `/` answering Ukrainian or English by header, with no redirect —
 * is the exact case the response matrix exists to measure, and folding those
 * legs onto one page makes every serving rule read the first leg's language for
 * all of them. Identical bodies at one URL still collapse, which is the dedupe
 * worth having: it saves a parse and keeps the page set honest about how many
 * distinct documents were actually served.
 */
export interface PageSet {
  /** Digest a body into a page and return that page's id, so a probe can name it. */
  add(input: AddPageInput): string;
  entries(): readonly CollectedPage[];
  pages(): readonly PageEvidence[];
}

export function createPageSet(digest: Digester): PageSet {
  const collected: CollectedPage[] = [];
  const seen = new Map<string, string>();

  return {
    add({ url, body, reach, headers, identity }: AddPageInput): string {
      const key = `${url} ${identity}`;
      const existing = seen.get(key);
      if (existing !== undefined) return existing;

      const id = `page-${collected.length + 1}`;
      seen.set(key, id);
      const contentLanguage = headers?.['content-language'];
      const result = digest(body, {
        url,
        headerAlternates: parseLinkHeader(headers?.['link'] ?? ''),
        ...(contentLanguage === undefined ? {} : { contentLanguageHeader: contentLanguage }),
      });
      collected.push({
        page: { id, url, reach, rendered: false, document: result.document },
        digest: result,
      });
      return id;
    },
    entries: () => collected,
    pages: () => collected.map((entry) => entry.page),
  };
}
