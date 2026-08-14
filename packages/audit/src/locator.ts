/**
 * Resolving a **declared target** against the collected page set.
 *
 * Several families follow a target the page's own markup declares — an hreflang
 * alternate, a picker entry, a switch link — and ask "did we collect that
 * page?". They must all answer it the same way, and none of them may answer it
 * by fetching: resolution is against `ctx.pages` only, because probing a URL the
 * site did not declare is how an audit tool manufactures a false accusation.
 *
 * **Comparison is normalized, never string equality.** The same page is legally
 * written `https://example.com/uk/`, `https://example.com/uk`,
 * `/uk/index.html`, and `/uk` — as an absolute URL in an hreflang, and as a
 * build path in filesystem evidence. Comparing the raw strings silently reports
 * a declared target as unresolvable, which turns a correct site into a finding
 * and, in `ua/state-language-version-lesser`, quietly shrinks the page counts
 * the statute check rests on.
 *
 * A locator with no host (a bare path, or filesystem evidence) matches any
 * host: off disk there is no origin to compare, and a site-relative href is by
 * definition same-origin.
 */

import type { PageEvidence } from './evidence';

const ROOT_PATH = '/';
/** Directory-index filenames: `/uk/index.html` and `/uk/` are the same place. */
const INDEX_FILES: ReadonlySet<string> = new Set(['index.html', 'index.htm', 'index.xhtml']);

/** A normalized location: an optional host plus a normalized path. */
export interface Locator {
  readonly host: string | null;
  readonly path: string;
}

/** Parse a URL, resolving against `base`, or `null` when it is not one. */
export function tryUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** `/uk/index.html` and `/uk/` are the same place. Case is preserved — paths are. */
function normalizePath(pathname: string): string {
  const segments = (pathname.startsWith(ROOT_PATH) ? pathname : `${ROOT_PATH}${pathname}`).split(
    ROOT_PATH,
  );
  const last = segments.at(-1);
  if (last !== undefined && INDEX_FILES.has(last.toLowerCase())) segments.pop();
  let joined = segments.join(ROOT_PATH);
  while (joined.length > 1 && joined.endsWith(ROOT_PATH)) joined = joined.slice(0, -1);
  return joined === '' ? ROOT_PATH : joined;
}

/**
 * Parse a declared href into a comparable locator, resolving against `base`
 * when the href is relative. `null` for an empty href and for a bare fragment —
 * `#uk` declares no target.
 */
export function parseLocator(value: string, base?: string): Locator | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  const url = tryUrl(trimmed, base);
  if (url !== null) return { host: url.hostname.toLowerCase(), path: normalizePath(url.pathname) };
  return { host: null, path: normalizePath(trimmed) };
}

/** A page's own location: its URL on a network run, its build path off disk. */
export function locatorOf(page: PageEvidence): Locator | null {
  const value = page.url ?? page.path;
  if (value === undefined) return null;
  return parseLocator(value);
}

/**
 * A page's own location as the bare string the site itself would recognise —
 * its URL on a network run, its build path off disk — or `null` when it
 * carries neither. The display/marker sibling of {@link locatorOf}: a few
 * rules need the raw string for a URL-language-marker read or to quote
 * verbatim in a summary, not the parsed, comparable {@link Locator}.
 */
export function locatorText(page: PageEvidence): string | null {
  return page.url ?? page.path ?? null;
}

/** Same path, and same host unless either side is host-less. */
export function sameLocation(one: Locator, other: Locator): boolean {
  if (one.path !== other.path) return false;
  return one.host === null || other.host === null || one.host === other.host;
}

/**
 * The collected page a declared href resolves to, or `null` when the audit
 * never collected it. Never fetches — `null` means "not in this evidence".
 */
export function resolveTargetPage(
  pages: readonly PageEvidence[],
  from: PageEvidence,
  href: string,
): PageEvidence | null {
  const target = parseLocator(href, from.url);
  if (target === null) return null;
  for (const page of pages) {
    const locator = locatorOf(page);
    if (locator !== null && sameLocation(locator, target)) return page;
  }
  return null;
}

/** Did a declared href resolve to something the audit actually collected? */
export function resolvesToCollectedPage(
  pages: readonly PageEvidence[],
  from: PageEvidence,
  href: string,
): boolean {
  return resolveTargetPage(pages, from, href) !== null;
}
