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
 * definition same-origin. That reasoning is about a **relative** href, which
 * carries no origin to disagree with. It does not transfer to an absolute one,
 * where the named host is the whole claim: an `hreflang` naming
 * `https://other-brand.de/uk/` used to match a local `/uk/index.html` on
 * nothing but a shared path.
 *
 * So {@link resolveTargetPage} asks one more question of a host-naming href,
 * and asks it of the page that declared it: **did this page tell us it lives
 * somewhere else?** A page that {@link claimedOrigins | claims an origin} —
 * because it was collected from one, or because it points at itself in its own
 * language — is answered only for that origin. A page that claims none keeps
 * the permissive match, because an unknown origin is not a foreign one, and
 * the audit accuses nobody on the strength of what it does not know.
 *
 * **Every declared href is read relative to the page that declared it**, on
 * disk exactly as over the network — {@link declaredLocator} is the one place
 * that happens. A page collected off disk carries a `path` and no `url`, so
 * threading `page.url` as the base handed `new URL` `undefined` and dropped
 * such a page back to the site-root reading: `../uk/guide.html` declared on
 * `/docs/en/guide.html` became the literal path `/../uk/guide.html`, matching
 * no collected page. {@link baseOf} lifts the build path into a URL instead —
 * see there for why the scheme it lifts into carries no authority.
 */

import { declaredLanguageOf, isWellFormedBCP47, presentLang } from './bcp47';
import type { AlternateLink, PageEvidence } from './evidence';
import { alternateLanguage } from './inventory';

const ROOT_PATH = '/';
/** No claim — never "no match". See {@link answersFor}. */
const NO_ORIGINS: ReadonlySet<string> = new Set();
/** Directory-index filenames: `/uk/index.html` and `/uk/` are the same place. */
const INDEX_FILES: ReadonlySet<string> = new Set(['index.html', 'index.htm', 'index.xhtml']);
/**
 * The scheme a build path is lifted into to become a base. See {@link baseOf}.
 *
 * Deliberately a **non-special** scheme, which is what makes the lift safe:
 * `movar-build:/docs/en/guide.html` folds `..` exactly as a browser does and
 * still reports an empty host, so nothing invented survives into the
 * comparison. An `https://` stand-in fabricates an origin the page never
 * claimed — and because {@link locatorOf} reads a page's own location through
 * this same lift, that synthetic host lands on **every page in the build**.
 * {@link sameLocation} then weighs it against the real host each absolute href
 * names, agrees with none of them, and no absolute alternate resolves to a
 * collected page at all. Not {@link answersFor}: it short-circuits on a page
 * that carries a host and never reads the claim, so a test asserting on a
 * *relative* target passes under either scheme and pins nothing. The failure's
 * shape is the dogfood gate's — `apps/marketing` writes its hreflang through
 * `new URL(path, Astro.site)`, so every href is absolute and every page it is
 * declared on is a build path.
 */
const BUILD_SCHEME = 'movar-build:';

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
 * The host a parsed URL names, or `null` when it names none. A URL with no
 * authority — a lifted build path, a `mailto:`, a picker's `javascript:` — is
 * host-less in the sense {@link sameLocation} and {@link answersFor} mean it,
 * and the empty string is not a host to compare anything against.
 */
function hostOf(url: URL): string | null {
  return url.hostname === '' ? null : url.hostname.toLowerCase();
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
  if (url !== null) return { host: hostOf(url), path: normalizePath(url.pathname) };
  return { host: null, path: normalizePath(trimmed) };
}

/**
 * A page's own location as an absolute URL, which is what a relative href
 * declared on it resolves against: the URL it was collected from, or — off
 * disk, where there is no URL at all — its build path lifted into
 * {@link BUILD_SCHEME}.
 *
 * `undefined` when the page carries neither, and when the path will not lift.
 * That last case degrades to the base-less reading rather than to no reading:
 * a base `new URL` refuses makes it refuse the *absolute* hrefs too, so a
 * pathological build path would take the resolvable targets down with it.
 */
function baseOf(page: PageEvidence): string | undefined {
  if (page.url !== undefined) return page.url;
  if (page.path === undefined) return undefined;
  const path = page.path.startsWith(ROOT_PATH) ? page.path : `${ROOT_PATH}${page.path}`;
  return tryUrl(`${BUILD_SCHEME}${path}`)?.href;
}

/**
 * A page's own location: its URL on a network run, its build path off disk.
 *
 * Read through {@link baseOf}, so a build path is percent-encoded by the same
 * `URL` parse that encodes every declared href compared against it. Reading
 * the raw string here left the two sides spelling `/пошук/` differently — the
 * page's locator literal and the href's encoded — so an absolute alternate
 * naming a non-ASCII path resolved to nothing at all.
 */
export function locatorOf(page: PageEvidence): Locator | null {
  const value = baseOf(page) ?? page.path;
  if (value === undefined) return null;
  return parseLocator(value);
}

/**
 * A declared href as a comparable locator, resolved **relative to the page
 * that declared it** — the only way a user agent reads one, and the only way
 * the catalogue's `core/hreflang-target-relative` (a `warn`, so relative hrefs
 * are expected) can be anything but a false `fail` one rule further on.
 */
export function declaredLocator(page: PageEvidence, href: string): Locator | null {
  return parseLocator(href, baseOf(page));
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
 * The origin **one page** claims as its own, or empty when it claims none.
 *
 * A page collected over the network states its origin by having been fetched
 * from it. A page read off disk has no origin of its own — but it may still
 * declare one: the self-referential `hreflang` that `core/hreflang-self-missing`
 * expects of every page in a translation set names the origin the build is
 * deployed at. That is the site's own declaration about itself, which is the
 * only kind of claim this audit acts on.
 *
 * Two properties are load-bearing, and both were learned the hard way:
 *
 * 1. **Per page, never across the page set.** A host named on one page — as
 *    somebody else's target — must never become an origin some *other* page is
 *    answered for. Pooling the claims did exactly that, and answering for a
 *    host no page ever claimed is the inference this module exists to refuse.
 * 2. **The alternate must declare the page's own language.** Path equality
 *    alone cannot tell a self-reference from an outbound alternate that happens
 *    to sit at the same path — and reciprocal hreflang means every page in a
 *    translation set carries the *same* alternates list, so on a cross-domain
 *    site (`/` on each domain, `uk` on another host entirely) the foreign
 *    alternate sits at the declaring page's own path and would claim itself.
 *    An alternate whose `hreflang` is the page's own `<html lang>` cannot be
 *    faked that way: it is the page pointing at itself.
 */
function claimedOrigins(page: PageEvidence): ReadonlySet<string> {
  const own = locatorOf(page);
  if (own === null) return NO_ORIGINS;
  if (own.host !== null) return new Set([own.host]); // collected there — observed, not declared
  const tag = presentLang(page.document.htmlLang);
  if (tag === null || !isWellFormedBCP47(tag)) return NO_ORIGINS;
  const language = declaredLanguageOf(tag);
  const claimed = new Set<string>();
  for (const alternate of page.document.alternates) {
    const host = selfReferencedHost(page, alternate, own, language);
    if (host !== null) claimed.add(host);
  }
  return claimed;
}

/**
 * The host an alternate names when it is `own`'s **self-reference**: the page's
 * own path, declared in the page's own `language`. `null` for anything else —
 * including an outbound alternate that merely shares that path, which is
 * exactly what a reciprocal alternates block puts there. See
 * {@link claimedOrigins}, whose second property this predicate carries.
 *
 * Read relative to the page like every other declared href, which costs
 * nothing here and keeps that rule without an exception: only a host-naming
 * alternate can claim an origin, and only this page is reached at all (a
 * collected URL is an origin already), so the base is the host-less lift and
 * a relative self-reference still claims nothing.
 */
function selfReferencedHost(
  page: PageEvidence,
  alternate: AlternateLink,
  own: Locator,
  language: string,
): string | null {
  if (alternateLanguage(alternate) !== language) return null;
  const declared = declaredLocator(page, alternate.href);
  if (declared === null) return null;
  if (declared.host === null || declared.path !== own.path) return null;
  return declared.host;
}

/**
 * May a host-less collected page answer for the host a target names?
 *
 * Yes when the target names no host (a relative href carries no origin to
 * disagree with), yes when the page carries an origin of its own to compare
 * against, and yes when the declaring page claims no origin at all — **an
 * unknown origin is not a foreign one.** A build that says nothing about where
 * it lives keeps the permissive match it has always had; the alternative
 * turns a `warn`-grade missing self-reference into a wall of hard `fail`s on
 * targets the audit demonstrably collected.
 */
function answersFor(page: Locator, target: Locator, claimed: ReadonlySet<string>): boolean {
  if (target.host === null || page.host !== null) return true;
  if (claimed.size === 0) return true;
  return claimed.has(target.host);
}

/**
 * The collected page a declared href resolves to, or `null` when the audit
 * never collected it. Never fetches — `null` means "not in this evidence".
 *
 * When the declaring page {@link claimedOrigins | claims an origin} and the
 * href names a different host, no build path answers for it. Matching on the
 * path alone let `hreflang="uk" href="https://other-brand.de/uk/"` resolve to
 * a local `/uk/index.html` that shares nothing with it but a spelling: it
 * passed `core/hreflang-target-unresolvable` on a page the audit never
 * collected, and failed `core/hreflang-target-wrong-language` by reading the
 * local file's `lang` and attributing it to a host that file never came from.
 * Cross-domain locale sites are a standard pattern, and there the host is the
 * whole claim.
 *
 * The href is read through {@link declaredLocator}, so it resolves against the
 * declaring page whether that page carries a URL or a build path.
 */
export function resolveTargetPage(
  pages: readonly PageEvidence[],
  from: PageEvidence,
  href: string,
): PageEvidence | null {
  const target = declaredLocator(from, href);
  if (target === null) return null;
  const claimed = target.host === null ? NO_ORIGINS : claimedOrigins(from);
  for (const page of pages) {
    const locator = locatorOf(page);
    if (locator === null || !sameLocation(locator, target)) continue;
    if (!answersFor(locator, target, claimed)) continue;
    return page;
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
