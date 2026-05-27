/**
 * Locale autodetect middleware for movar.fyi.
 *
 * Cloudflare Pages Function that intercepts requests to the English canonical
 * paths and 302-redirects users whose Accept-Language header prefers Ukrainian
 * to the matching /uk/ page. Requests for static assets, the already-/uk/-
 * prefixed pages, and any path without an EN canonical entry pass straight
 * through.
 *
 * Mirror this map whenever a new EN page gains a UK counterpart in
 * src/pages/. A missing entry means the EN URL still works but never auto-
 * redirects, which is silent breakage rather than a loud failure.
 *
 * Locally: `pnpm --filter @movar/marketing build && cd apps/marketing &&
 * pnpm exec wrangler pages dev dist` then curl with -H 'Accept-Language: uk'.
 */

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

// Targets use the trailing-slash form Cloudflare Pages serves directly for
// each Astro-built directory route. Hitting /uk/privacy would otherwise
// 308-redirect to /uk/privacy/, doubling the visible redirect for the user.
const UK_COUNTERPART: Record<string, string> = {
  '/': '/uk/',
  '/privacy': '/uk/privacy/',
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

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  // Normalise trailing slash so /privacy and /privacy/ hit the same entry.
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  const ukTarget = UK_COUNTERPART[path];

  // Anything outside the EN canonical set (assets, /uk/*, unknown paths) is
  // not our concern — fall through untouched so the edge cache stays clean.
  if (!ukTarget) {
    return context.next();
  }

  if (prefersUkrainian(context.request.headers.get('accept-language'))) {
    const redirect = new URL(ukTarget, url.origin);
    redirect.search = url.search;
    return Response.redirect(redirect.toString(), 302);
  }

  // Served EN — tell shared caches the choice depended on Accept-Language so
  // they don't hand the EN HTML to a Ukrainian visitor on a later request.
  return markVaryAcceptLanguage(await context.next());
}
