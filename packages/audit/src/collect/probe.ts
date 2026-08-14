/**
 * The Node collector's HTTP tier: the first HTTP code in this repo.
 *
 * It is pointed at real third-party websites, so the ADR's network posture is
 * the spec rather than a later hardening pass (`docs/movar-audit.md` §6):
 *
 * - **A hard, sequential request budget**, enforced here rather than trusted to
 *   callers. Exhaustion throws {@link RequestBudgetExhaustedError}; it is never
 *   a quietly-shortened run, because a tool that silently bounds coverage reads
 *   as "covered everything". "Enforced here" starts at construction: a `budget`,
 *   `maxHops`, or `timeoutMs` that is not a non-negative safe integer is a
 *   `TypeError` from `createProber`, since a ceiling of `NaN` is not a ceiling.
 * - **A declared `User-Agent`** naming the tool and linking to what it does. A
 *   browser UA is never spoofed: that would make this bot-protection evasion,
 *   which is both an abuse posture and a store-listing risk.
 * - **Cold by default.** No cookie jar unless a warm run is asked for, and the
 *   choice is stamped on every probe.
 * - **Redirect chains are walked, not delegated.** `redirect: 'manual'` and one
 *   hop at a time, because `core/switch-bounces` — the rule this product exists
 *   for — is adjudicated entirely from the recorded chain.
 * - **`blocked` is first-class.** A challenge interstitial answers **HTTP 200**
 *   with its own `<html lang>` and body text; adjudicating one would manufacture
 *   a false accusation about a named company.
 * - **No crawling.** This module fetches a URL it is handed and never discovers
 *   another.
 *
 * Two provenance items the ADR asks for are **not** met here, deliberately
 * rather than silently: Node's `fetch` exposes no peer certificate, so
 * `certificateChain` is omitted rather than faked, and `ProbeEvidence` carries
 * no timing field yet. Both need the raw-TLS path, and `schemaVersion` exists so
 * a later revision can add them additively.
 */

import { createHash } from 'node:crypto';
import packageJson from '../../package.json';
import type { CookieState, ProbeEvidence, RedirectHop, Vantage } from '../evidence';

/**
 * Identifies the tool and links to what it does, per ADR §6. Deliberately not
 * browser-shaped — a site owner reading their logs should be able to find out
 * what hit them and why.
 */
export const AUDIT_USER_AGENT = `Movar-Audit/${packageJson.version} (+https://movar.fyi)`;

/** Default hard ceiling on requests per audit. Sequential, never concurrent. */
export const DEFAULT_REQUEST_BUDGET = 40;
/** Redirect hops followed before a chain is called pathological. */
export const DEFAULT_MAX_HOPS = 10;
export const DEFAULT_TIMEOUT_MS = 15_000;

/** RFC 9110 redirect statuses that carry a `Location`. */
const HTTP_MOVED_PERMANENTLY = 301;
const HTTP_FOUND = 302;
const HTTP_SEE_OTHER = 303;
const HTTP_TEMPORARY_REDIRECT = 307;
const HTTP_PERMANENT_REDIRECT = 308;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  HTTP_MOVED_PERMANENTLY,
  HTTP_FOUND,
  HTTP_SEE_OTHER,
  HTTP_TEMPORARY_REDIRECT,
  HTTP_PERMANENT_REDIRECT,
]);

/** How much of a body is scanned for challenge markers. They sit in the head. */
const CHALLENGE_SCAN_CHARS = 20_000;

/**
 * Body markers that identify a bot-challenge interstitial.
 *
 * Deliberately body-based. `server: cloudflare` is **not** on this list and must
 * never be: a large share of the web sits behind Cloudflare while serving
 * perfectly ordinary pages, so treating the header as a challenge signal would
 * report most of the internet as unauditable. A missed challenge costs a false
 * finding about a named company; a false `blocked` only costs coverage — so the
 * bar is a positive marker of the challenge itself.
 */
const CHALLENGE_BODY_MARKERS: readonly string[] = [
  '__cf_chl',
  'cf-browser-verification',
  'challenge-platform',
  'cf_chl_opt',
  'just a moment',
  'attention required!',
  'ddos-guard',
  'checking your browser before accessing',
  'enable javascript and cookies to continue',
  'why have i been blocked',
  'g-recaptcha',
  'h-captcha',
];

/** Response headers that assert a challenge outright. */
const CHALLENGE_HEADERS: readonly string[] = ['cf-mitigated', 'x-ddos-guard'];

/** The slice of `fetch` this module uses, so tests can inject one. */
export type FetchLike = (
  url: string,
  init: {
    readonly method: string;
    readonly redirect: 'manual';
    readonly headers: Record<string, string>;
    readonly signal?: AbortSignal;
  },
) => Promise<FetchLikeResponse>;

export interface FetchLikeResponse {
  readonly status: number;
  readonly headers: {
    readonly get: (name: string) => string | null;
    /** Undici exposes this; it avoids re-splitting a joined `Set-Cookie`. */
    readonly getSetCookie?: () => string[];
    forEach?: unknown;
  };
  text(): Promise<string>;
}

/** One probe the orchestrator asks for. The matrix varies only `acceptLanguage`. */
export interface ProbeRequest {
  readonly url: string;
  /** The `Accept-Language` to send, or `null` for the no-preference leg. */
  readonly acceptLanguage: string | null;
  /** Defaults to the prober's own cookie state. */
  readonly cookieState?: CookieState;
  /** Links this probe to the page its body produced. */
  readonly pageId?: string;
}

/** A probe, plus the body the digest tier needs. The body never enters Evidence. */
export interface ProbeResult {
  readonly probe: ProbeEvidence;
  readonly body: string | null;
}

export interface ProberOptions {
  readonly vantage: Vantage;
  /** Hard ceiling for the whole audit. */
  readonly budget?: number;
  readonly fetchImpl?: FetchLike;
  readonly cookieState?: CookieState;
  readonly maxHops?: number;
  readonly timeoutMs?: number;
}

export interface Prober {
  probe(request: ProbeRequest): Promise<ProbeResult>;
  /** Requests already spent against the budget. */
  spent(): number;
  /** Requests still available. The orchestrator plans within this. */
  remaining(): number;
}

/**
 * The audit asked for more requests than its budget allows. Thrown rather than
 * degraded: a shortened run that looks complete is the failure mode the ADR's
 * "no silent caps" rule exists to prevent.
 */
export class RequestBudgetExhaustedError extends Error {
  readonly budget: number;

  constructor(budget: number) {
    super(
      `request budget of ${budget} exhausted — an audit must state what it did not fetch, never quietly stop fetching`,
    );
    this.name = 'RequestBudgetExhaustedError';
    this.budget = budget;
  }
}

/** Lower-cased header map. `Headers` is not plainly enumerable across runtimes. */
function headerRecord(headers: FetchLikeResponse['headers']): Record<string, string> {
  const record: Record<string, string> = {};
  const each = (headers as { forEach?: (fn: (value: string, key: string) => void) => void })
    .forEach;
  if (typeof each === 'function') {
    each.call(headers, (value, key) => {
      record[key.toLowerCase()] = value;
    });
  }
  return record;
}

export function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Is this response a bot-challenge interstitial rather than the site's own page?
 *
 * Exported so the same judgement is testable and reusable by another collector.
 */
export function isChallengeResponse(
  headers: Readonly<Record<string, string>>,
  body: string | null,
): boolean {
  for (const name of CHALLENGE_HEADERS) {
    if (headers[name] !== undefined) return true;
  }
  if (body === null) return false;
  const haystack = body.slice(0, CHALLENGE_SCAN_CHARS).toLowerCase();
  return CHALLENGE_BODY_MARKERS.some((marker) => haystack.includes(marker));
}

/** Every `Set-Cookie` on a response, as separate values where the runtime can. */
function setCookiesOf(response: FetchLikeResponse): readonly string[] {
  const all = response.headers.getSetCookie?.();
  if (all !== undefined) return all;
  const single = response.headers.get('set-cookie');
  return single === null ? [] : [single];
}

function requestHeaders(acceptLanguage: string | null, cookie: string | null) {
  return {
    'user-agent': AUDIT_USER_AGENT,
    accept: 'text/html,application/xhtml+xml',
    ...(acceptLanguage === null ? {} : { 'accept-language': acceptLanguage }),
    ...(cookie === null ? {} : { cookie }),
  };
}

interface Hop {
  readonly hops: readonly RedirectHop[];
  readonly finalUrl: string;
  readonly response: FetchLikeResponse | null;
  readonly body: string | null;
  readonly transportError: boolean;
  /**
   * Headers of the **first** response — the direct answer to the request at
   * `probe.url`, before any redirect.
   *
   * This, not the destination's headers, is what caching semantics are about.
   * A locale-autodetect `302` at `/` is the response a shared cache stores for
   * `/`, so it is the one that must carry `Vary: Accept-Language`; the `/uk/`
   * page it points at is a fixed-locale URL that correctly does not vary. Read
   * the destination's headers instead and the rule asks the wrong resource.
   */
  readonly firstHeaders: Readonly<Record<string, string>>;
}

/**
 * A cookie jar for warm runs only. Cold runs never construct one, which is what
 * makes "everything else identical" true of a matrix by default.
 */
class CookieJar {
  private readonly pairs = new Map<string, string>();

  /**
   * Take the cookies from one response. Each entry is a whole `Set-Cookie`
   * value; only its leading `name=value` pair matters here, so attributes
   * (`Expires`, which itself contains a comma) are never re-parsed.
   */
  absorb(values: readonly string[]): void {
    for (const value of values) {
      const [pair] = value.split(';');
      const eq = pair === undefined ? -1 : pair.indexOf('=');
      if (pair === undefined || eq <= 0) continue;
      this.pairs.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string | null {
    if (this.pairs.size === 0) return null;
    return [...this.pairs].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** The platform `fetch`, narrowed to the slice this module uses. */
const defaultFetch: FetchLike = async (url, init) =>
  (globalThis.fetch as unknown as FetchLike)(url, init);

/** How a refused value reads back to the caller: `NaN`, `-1`, `'40'`, `null`. */
function shown(value: unknown): string {
  return typeof value === 'string' ? `'${value}'` : String(value);
}

/**
 * A count of requests, hops, or milliseconds, or a `TypeError` at construction.
 *
 * Every ceiling in this module is a comparison — `spent >= budget`,
 * `hop <= maxHops`, `setTimeout(…, timeoutMs)` — and a value outside this set
 * makes the comparison stop being one, silently. `NaN` is the worst of them:
 * `spent >= NaN` is false for every `spent`, so the budget never throws, and
 * `Math.max(0, NaN - spent)` is `NaN`, which never satisfies the collector's
 * `if (prober.remaining() === 0) break`. A mistyped budget then reads as a
 * completed audit while fetching without limit from a live third-party site.
 * `Infinity` uncaps it just as completely; a negative budget exhausts before
 * the first request, and a fractional one truncates at an arbitrary point.
 *
 * Thrown, not defaulted or clamped, and thrown at construction rather than at
 * the first probe: unlike the CLI edge — where `--budget` is user input and
 * belongs in an exit code — a caller in this position is code, and a silently
 * corrected ceiling is the same "quietly bounded run" the ADR forbids.
 *
 * A plain `TypeError`, deliberately not {@link RequestBudgetExhaustedError}:
 * that one reports a run that reached its ceiling, which a caller may catch to
 * report partial coverage, and a construction bug must not be swallowed by that
 * handler. Nothing should branch on this error, so it earns no exported name.
 */
function requireCount(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer, not ${shown(value)}`);
  }
  return value;
}

export function createProber(options: ProberOptions): Prober {
  // Validated before anything else: a prober that cannot enforce its own
  // ceiling must not exist, rather than exist and fail open on first use.
  const budget = requireCount('budget', options.budget ?? DEFAULT_REQUEST_BUDGET);
  const maxHops = requireCount('maxHops', options.maxHops ?? DEFAULT_MAX_HOPS);
  const timeoutMs = requireCount('timeoutMs', options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const doFetch: FetchLike = options.fetchImpl ?? defaultFetch;
  const runCookieState = options.cookieState ?? 'cold';
  let spent = 0;
  let sequence = 0;

  const spend = (): void => {
    if (spent >= budget) throw new RequestBudgetExhaustedError(budget);
    spent += 1;
  };

  /** One request. Never throws for an ordinary network failure. */
  async function once(
    url: string,
    acceptLanguage: string | null,
    jar: CookieJar | null,
  ): Promise<{ response: FetchLikeResponse | null; body: string | null }> {
    spend();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await doFetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: requestHeaders(acceptLanguage, jar?.header() ?? null),
        signal: controller.signal,
      });
      jar?.absorb(setCookiesOf(response));
      const redirecting =
        REDIRECT_STATUSES.has(response.status) && response.headers.get('location') !== null;
      // A redirect's body is never the site's content; don't spend memory on it.
      const body = redirecting ? null : await response.text().catch(() => null);
      return { response, body };
    } catch {
      return { response: null, body: null };
    } finally {
      clearTimeout(timer);
    }
  }

  /** What one hop decided, without deciding what `walk` does about it. */
  type HopStep =
    | { readonly kind: 'transport-error' }
    | {
        readonly kind: 'landed';
        readonly response: FetchLikeResponse;
        readonly body: string | null;
      }
    | {
        readonly kind: 'unresolvable';
        readonly response: FetchLikeResponse;
        readonly location: string;
      }
    | {
        readonly kind: 'redirect';
        readonly response: FetchLikeResponse;
        readonly location: string;
        readonly next: string;
      };

  /**
   * Fetch one hop and classify what happened. `seen` is read-only here — a
   * loop is only a loop once `walk` has actually recorded the URL that
   * closes it, so the write stays the caller's.
   */
  async function step(
    url: string,
    acceptLanguage: string | null,
    jar: CookieJar | null,
    seen: ReadonlySet<string>,
  ): Promise<HopStep> {
    const { response, body } = await once(url, acceptLanguage, jar);
    if (response === null) return { kind: 'transport-error' };
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || location === null) {
      return { kind: 'landed', response, body };
    }
    const next = resolveLocation(url, location);
    // A loop, or a Location we cannot resolve, ends the walk here: the chain
    // recorded so far is the finding, and `core/switch-bounces` reads it.
    if (next === null || seen.has(next)) return { kind: 'unresolvable', response, location };
    return { kind: 'redirect', response, location, next };
  }

  /** Walk the chain hop by hop, recording every one in order. */
  async function walk(
    startUrl: string,
    acceptLanguage: string | null,
    jar: CookieJar | null,
  ): Promise<Hop> {
    const hops: RedirectHop[] = [];
    const seen = new Set<string>();
    let url = startUrl;
    let firstHeaders: Readonly<Record<string, string>> | null = null;

    for (let hop = 0; hop <= maxHops; hop += 1) {
      const outcome = await step(url, acceptLanguage, jar, seen);
      if (outcome.kind === 'transport-error') {
        return {
          hops,
          finalUrl: url,
          response: null,
          body: null,
          transportError: true,
          firstHeaders: firstHeaders ?? {},
        };
      }
      firstHeaders ??= headerRecord(outcome.response.headers);
      if (outcome.kind === 'landed') {
        return {
          hops,
          finalUrl: url,
          response: outcome.response,
          body: outcome.body,
          transportError: false,
          firstHeaders,
        };
      }
      hops.push({ url, status: outcome.response.status, location: outcome.location });
      seen.add(url);
      if (outcome.kind === 'unresolvable') {
        return {
          hops,
          finalUrl: url,
          response: outcome.response,
          body: null,
          transportError: false,
          firstHeaders,
        };
      }
      url = outcome.next;
    }
    return {
      hops,
      finalUrl: url,
      response: null,
      body: null,
      transportError: false,
      firstHeaders: firstHeaders ?? {},
    };
  }

  return {
    spent: () => spent,
    remaining: () => Math.max(0, budget - spent),

    async probe(request: ProbeRequest): Promise<ProbeResult> {
      const cookieState = request.cookieState ?? runCookieState;
      const jar = cookieState === 'warm' ? new CookieJar() : null;
      sequence += 1;
      // Sequential ids, not a clock or a random source: a replayed bundle must
      // carry the same probe ids it was written with.
      const id = `probe-${sequence}`;
      const { hops, response, body, transportError, firstHeaders } = await walk(
        request.url,
        request.acceptLanguage,
        jar,
      );

      const finalHeaders = response === null ? {} : headerRecord(response.headers);
      const outcome = resolveOutcome(response, transportError, finalHeaders, body);

      return {
        probe: {
          id,
          ...(request.pageId === undefined ? {} : { pageId: request.pageId }),
          url: request.url,
          acceptLanguage: request.acceptLanguage,
          vantage: options.vantage,
          cookieState,
          outcome,
          status: response?.status ?? 0,
          responseHeaders: firstHeaders,
          redirectChain: hops,
          ...(body === null ? {} : { bodyHash: sha256(body) }),
        },
        // A blocked response's body is the interstitial's, not the site's.
        // Handing it to the digest tier is how a false accusation gets built.
        body: outcome === 'ok' ? body : null,
      };
    },
  };
}

function resolveOutcome(
  response: FetchLikeResponse | null,
  transportError: boolean,
  headers: Readonly<Record<string, string>>,
  body: string | null,
): ProbeEvidence['outcome'] {
  if (transportError || response === null) return 'error';
  if (isChallengeResponse(headers, body)) return 'blocked';
  return 'ok';
}

/** Resolve a `Location` against the URL that produced it. `null` when unusable. */
export function resolveLocation(from: string, location: string): string | null {
  try {
    return new URL(location, from).toString();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* robots.txt — honoured for site-scope expansion, ignored for one page view   */
/* -------------------------------------------------------------------------- */

export interface RobotsRules {
  /** Disallowed path prefixes applying to us, longest-match-wins per RFC 9309. */
  readonly disallow: readonly string[];
  readonly allow: readonly string[];
}

export const EMPTY_ROBOTS: RobotsRules = { disallow: [], allow: [] };

/** One robots.txt line's field and value, or the sentinel for a line this parser skips. */
type RobotsDirective =
  | { readonly kind: 'skip' }
  | { readonly kind: 'user-agent'; readonly value: string }
  | { readonly kind: 'disallow'; readonly value: string }
  | { readonly kind: 'allow'; readonly value: string };

/**
 * One `field: value` line, comment and whitespace stripped — or `'skip'` for
 * a blank line, a line with no colon, or a field this parser does not act on
 * (e.g. `Sitemap:`). Isolating the per-line grammar from the group-tracking
 * loop below is what keeps both readable: this function never sees
 * `inWildcardGroup`, and the loop never re-parses a line.
 */
function parseRobotsLine(rawLine: string): RobotsDirective {
  const line = rawLine.split('#')[0]?.trim() ?? '';
  if (line === '') return { kind: 'skip' };
  const colon = line.indexOf(':');
  if (colon <= 0) return { kind: 'skip' };
  const field = line.slice(0, colon).trim().toLowerCase();
  const value = line.slice(colon + 1).trim();
  if (field === 'user-agent') return { kind: 'user-agent', value };
  if (field === 'disallow') return { kind: 'disallow', value };
  if (field === 'allow') return { kind: 'allow', value };
  return { kind: 'skip' };
}

/**
 * Parse the `User-agent: *` group. We never look for a Movar-specific group:
 * honouring the wildcard is the conservative reading, and a tool that reads
 * only its own group is one rename away from ignoring the site's wishes.
 */
export function parseRobots(text: string): RobotsRules {
  const disallow: string[] = [];
  const allow: string[] = [];
  let inWildcardGroup = false;

  for (const rawLine of text.split(/\r?\n/u)) {
    const directive = parseRobotsLine(rawLine);
    if (directive.kind === 'user-agent') {
      inWildcardGroup = directive.value === '*';
      continue;
    }
    if (!inWildcardGroup) continue;
    if (directive.kind === 'disallow' && directive.value !== '') disallow.push(directive.value);
    if (directive.kind === 'allow' && directive.value !== '') allow.push(directive.value);
  }
  return { disallow, allow };
}

/** Longest matching rule wins; `Allow` beats `Disallow` at equal length. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  const longest = (patterns: readonly string[]): number =>
    patterns
      .filter((pattern) => path.startsWith(pattern))
      .reduce((best, pattern) => Math.max(best, pattern.length), -1);

  const denied = longest(rules.disallow);
  if (denied < 0) return true;
  return longest(rules.allow) >= denied;
}
