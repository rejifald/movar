/**
 * Locale autodetect + host/404 middleware for movar.fyi.
 *
 * Cloudflare Pages Function that intercepts every request and handles three
 * concerns, in order:
 *
 * 1. Host canonicalisation — requests to www.movar.fyi are 301-redirected to
 *    the apex movar.fyi host (same path + query) so www never serves
 *    duplicate content alongside the canonical apex host.
 * 2. Locale autodetect — 302-redirects English canonical paths to their
 *    matching /uk/ page when the visitor's Accept-Language header prefers
 *    Ukrainian, and adds a `Vary: Accept-Language` header on served EN
 *    responses. Requests for static assets, the already-/uk/-prefixed
 *    pages, and any path without an EN canonical entry pass straight
 *    through to concern 3.
 * 3. Localized 404 — Cloudflare Pages serves a single custom 404 page (the
 *    English /404.html) for every unmatched route, including under /uk/.
 *    When a /uk/* request 404s, this middleware fetches the built Ukrainian
 *    404 page (/uk/404/, which itself returns 200) and returns its body
 *    with a 404 status instead.
 *
 * Mirror the UK_COUNTERPART map whenever a new EN page gains a UK
 * counterpart in src/pages/. A missing entry means the EN URL still works
 * but never auto-redirects, which is silent breakage rather than a loud
 * failure.
 *
 * Locally: `pnpm --filter @movar/marketing build && cd apps/marketing &&
 * pnpm exec wrangler pages dev dist` then curl with -H 'Accept-Language: uk'.
 */

/** Cloudflare Pages' static-asset binding — used to fetch the built /uk/404. */
interface PagesAssets {
  fetch(input: Request | URL): Promise<Response>;
}

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
  env: { ASSETS: PagesAssets };
}

// Targets use the trailing-slash form Cloudflare Pages serves directly for
// each Astro-built directory route. Hitting /uk/privacy would otherwise
// 308-redirect to /uk/privacy/, doubling the visible redirect for the user.
const UK_COUNTERPART: Record<string, string> = {
  '/': '/uk/',
  '/privacy': '/uk/privacy/',
  '/transparency': '/uk/transparency/',
  '/why-this-happens': '/uk/why-this-happens/',
};

interface ParsedTag {
  primary: string;
  q: number;
}

/**
 * Parse an Accept-Language header into primary subtags in user-preference
 * order. Honours q-values; missing q defaults to 1. Bad q-values fall back
 * to 1 so we degrade to "best effort" rather than dropping the entry.
 *
 *   "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7"  →  ['uk', 'uk', 'en', 'en']
 */
function preferredPrimaryTags(header: string | null): string[] {
  if (!header) return [];
  const parsed: ParsedTag[] = [];
  for (const part of header.split(',')) {
    const [rawTag, ...params] = part.trim().split(';');
    if (!rawTag) continue;
    const primary = rawTag.toLowerCase().split('-')[0];
    if (!primary) continue;
    const qParam = params.find((p) => p.trim().startsWith('q='));
    const parsedQ = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
    const q = Number.isFinite(parsedQ) ? parsedQ : 1;
    if (q > 0) parsed.push({ primary, q });
  }
  parsed.sort((a, b) => b.q - a.q);
  return parsed.map((entry) => entry.primary);
}

/**
 * Did the visitor ask for Ukrainian above English? We only redirect when uk
 * appears first; if the user explicitly prefers en over uk, we stay on EN.
 * Any visitor without uk in their list keeps the EN default.
 */
function prefersUkrainian(header: string | null): boolean {
  for (const tag of preferredPrimaryTags(header)) {
    if (tag === 'uk') return true;
    if (tag === 'en') return false;
  }
  return false;
}

/** Append Accept-Language to the response's Vary header without duplicating it. */
function markVaryAcceptLanguage(response: Response): Response {
  const merged = new Response(response.body, response);
  const tokens = new Set(
    (merged.headers.get('Vary') ?? '')
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean),
  );
  tokens.add('Accept-Language');
  merged.headers.set('Vary', [...tokens].join(', '));
  return merged;
}

/**
 * Canonicalise www → apex host, preserving path + query, so search engines
 * and browsers converge on one canonical URL instead of indexing the same
 * content on two hosts. Returns null for any non-www host.
 */
function apexRedirect(url: URL): Response | null {
  if (url.hostname !== 'www.movar.fyi') return null;
  const apexUrl = new URL(url.pathname + url.search, 'https://movar.fyi');
  return Response.redirect(apexUrl.toString(), 301);
}

/**
 * Cloudflare Pages ships a single custom 404 (the English /404.html) for every
 * unmatched route. When a /uk/* request 404s, swap in the built Ukrainian
 * /uk/404 page (which itself returns 200, so this can't loop) with a 404
 * status. Any other response passes through untouched.
 */
async function localizeUk404(response: Response, url: URL, assets: PagesAssets): Promise<Response> {
  if (response.status !== 404 || !url.pathname.startsWith('/uk/')) return response;
  const uk404 = await assets.fetch(new URL('/uk/404/', url.origin));
  return new Response(uk404.body, { status: 404, headers: uk404.headers });
}

/**
 * Serve the /uk/ counterpart when the visitor prefers Ukrainian, otherwise
 * serve EN and mark the response Accept-Language-dependent for shared caches
 * so they never hand EN HTML to a Ukrainian visitor on a later request.
 */
async function localeResponse(
  context: PagesContext,
  url: URL,
  ukTarget: string,
): Promise<Response> {
  if (prefersUkrainian(context.request.headers.get('accept-language'))) {
    const redirect = new URL(ukTarget, url.origin);
    redirect.search = url.search;
    return Response.redirect(redirect.toString(), 302);
  }
  return markVaryAcceptLanguage(await context.next());
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);

  const toApex = apexRedirect(url);
  if (toApex) return toApex;

  // Normalise trailing slash so /privacy and /privacy/ hit the same entry.
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  const ukTarget = UK_COUNTERPART[path];

  // Outside the EN canonical set (assets, /uk/*, unknown paths): fall through
  // to the static server, localizing the 404 for /uk/* misses.
  if (!ukTarget) {
    return localizeUk404(await context.next(), url, context.env.ASSETS);
  }

  return localeResponse(context, url, ukTarget);
}
