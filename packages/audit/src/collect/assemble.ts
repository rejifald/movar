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

import type { AlternateLink, PageEvidence, PageReach, ProbeEvidence, Vantage } from '../evidence';
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
  /**
   * The HTTP status that body was served with. Required, and required of every
   * runtime, because {@link isServedDocument} is what keeps an error document
   * out of the page set — see there for what admitting one costs.
   */
  readonly status: number;
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
  /**
   * Digest a body into a page and return that page's id, so a probe can name
   * it — or `null` for a body that is not a page at all, which is what a
   * status outside {@link isServedDocument}'s range means. A body already in
   * the set is not digested twice — it yields the id it was given, with its
   * `reach` upgraded to record this second way of getting there (see
   * `reachedAgain`).
   */
  add(input: AddPageInput): string | null;
  entries(): readonly CollectedPage[];
  pages(): readonly PageEvidence[];
}

/**
 * An entry while the set is still accumulating: `page` is replaced when the
 * same document is reached a second way, so it cannot be `readonly` here. The
 * getters hand it out as the read-only {@link CollectedPage} the callers see.
 */
interface AccumulatingPage {
  page: PageEvidence;
  readonly digest: DigestResult;
}

/**
 * The reach a page has once a second probe has landed on it.
 *
 * `reach` records how the audit **got to** a page, not what the page is, so a
 * document reached both by the matrix and as a declared target is a
 * declared-target page — it was reached that way, and the dedupe that folds the
 * two probes onto one document must not erase the fact. Withholding the upgrade
 * left the ubiquitous self-referential `<link rel="alternate" hreflang="en"
 * href="/">` granting no `traversal` at all: `hasTraversal` in `capability.ts`
 * looks for one `declared-target` page, so a run that followed every declared
 * target and resolved all of them reported `not-collected` on every traversal
 * rule. `not-collected` is never `pass`, and claiming a capability the
 * collector did exercise is that dishonesty pointed the other way.
 *
 * Monotone, so it is order-independent: a later no-preference leg landing on a
 * page the expansion already reached never downgrades it.
 */
function reachedAgain(page: PageEvidence, reach: PageReach): PageEvidence {
  if (reach !== 'declared-target' || page.reach === reach) return page;
  return { ...page, reach };
}

/** The 2xx range: its lowest status, and the first one past it. */
const HTTP_OK = 200;
const HTTP_MULTIPLE_CHOICES = 300;

/**
 * Is a body served with this status the document its URL stands for?
 *
 * Only in 2xx. A `404` is an answer — the site replied, and what it said is
 * that the page is not there — but the error template it replied with is not a
 * version of anything: it carries its own `<html lang>`, its own text, and no
 * relation to the page the markup promised. Digesting one made it a real page,
 * and every rule that resolves a declared target then read the stub as that
 * promise kept. `core/hreflang-target-unresolvable` resolved `hreflang="uk"`
 * to the 404 and published `pass` — "not-collected is never `pass`" inverted,
 * since the page it passed on is the one page the site had just said does not
 * exist — while `core/hreflang-target-wrong-language` read the error
 * template's `lang` and published a `fail` attributing that language to a
 * Ukrainian version nobody ever served. The second is a false accusation about
 * a named company, which `docs/movar-audit.md` calls the one failure mode that
 * ends the product. The same holds for a `403`, a `500`, and a `301` that
 * carries no `Location` to follow.
 *
 * Refused here rather than at each collector, and refused by the set rather
 * than asked of the caller, for the reason this module exists: "is this body a
 * page?" is the same class of judgement as "is this `Link` header a declared
 * alternate?", and two collectors answering it differently report different
 * findings about the same site. A third runtime gets the answer by construction
 * instead of having to remember the question.
 *
 * Nothing is hidden by the refusal. The probe that fetched it still records the
 * URL, the status, the headers and the chain, so the bundle says exactly what
 * was seen; `core/hreflang-target-unresolvable` reads that probe and reports
 * the target "returned a 404 response". Only the *page set* — the set of
 * documents the site actually served — stays honest about what is in it.
 */
function isServedDocument(status: number): boolean {
  return status >= HTTP_OK && status < HTTP_MULTIPLE_CHOICES;
}

export function createPageSet(digest: Digester): PageSet {
  const collected: AccumulatingPage[] = [];
  const seen = new Map<string, AccumulatingPage>();

  return {
    add({ url, body, reach, status, headers, identity }: AddPageInput): string | null {
      if (!isServedDocument(status)) return null;
      const key = `${url} ${identity}`;
      const existing = seen.get(key);
      if (existing !== undefined) {
        existing.page = reachedAgain(existing.page, reach);
        return existing.page.id;
      }

      const id = `page-${collected.length + 1}`;
      const contentLanguage = headers?.['content-language'];
      const result = digest(body, {
        url,
        headerAlternates: parseLinkHeader(headers?.['link'] ?? ''),
        ...(contentLanguage === undefined ? {} : { contentLanguageHeader: contentLanguage }),
      });
      const entry: AccumulatingPage = {
        page: { id, url, reach, rendered: false, document: result.document },
        digest: result,
      };
      seen.set(key, entry);
      collected.push(entry);
      return id;
    },
    entries: () => collected,
    pages: () => collected.map((entry) => entry.page),
  };
}
