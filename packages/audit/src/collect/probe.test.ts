import { describe, expect, it } from 'vitest';
import {
  AUDIT_USER_AGENT,
  createProber,
  DEFAULT_MAX_HOPS,
  DEFAULT_REQUEST_BUDGET,
  isChallengeResponse,
  parseRobots,
  RequestBudgetExhaustedError,
  resolveLocation,
  robotsAllows,
  sha256,
} from './probe';
import type { FetchLike, FetchLikeResponse } from './probe';
import { LOCAL_VANTAGE } from './node';
import { adjudicableProbes, deriveCapabilities } from '../capability';
import { networkEvidence } from '../../test/fixtures';

/** A real fetch is asynchronous; yielding a microtask keeps the stubs honest. */
async function tick(): Promise<void> {
  await Promise.resolve();
}

/** Every test injects this. Nothing here touches a real network. */
interface StubResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

function respond(stub: StubResponse): FetchLikeResponse {
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

/** A fetch that answers from a URL map and records what it was asked. */
function stubFetch(routes: Readonly<Record<string, StubResponse>>): {
  readonly fetchImpl: FetchLike;
  readonly seen: { url: string; headers: Record<string, string> }[];
} {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url, headers: init.headers });
    const stub = routes[url];
    if (stub === undefined) throw new Error(`unstubbed ${url}`);
    await tick();
    return respond(stub);
  };
  return { fetchImpl, seen };
}

const HOME = 'https://example.com/';

/** A transport that always fails, for the `error` outcome. */
const failingFetch: FetchLike = async () => {
  await tick();
  throw new Error('ECONNRESET');
};

/** A redirect to a URL never seen before, forever: only the hop cap ends it. */
function endlessChain(): FetchLike {
  let n = 0;
  return async () => {
    n += 1;
    await tick();
    return respond({ status: 302, headers: { location: `https://example.com/${n}` } });
  };
}

describe('createProber', () => {
  it('records a plain 200 as ok, with its headers and a body hash', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 200, headers: { vary: 'Accept-Language' }, body: '<html lang="en">hi' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: 'en' });

    expect(probe.outcome).toBe('ok');
    expect(probe.status).toBe(200);
    expect(probe.responseHeaders['vary']).toBe('Accept-Language');
    expect(probe.bodyHash).toBe(sha256('<html lang="en">hi'));
    expect(probe.redirectChain).toEqual([]);
    expect(body).toBe('<html lang="en">hi');
  });

  it('sends a declared User-Agent that is not browser-shaped', async () => {
    const { fetchImpl, seen } = stubFetch({ [HOME]: { status: 200, body: 'ok' } });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    await prober.probe({ url: HOME, acceptLanguage: null });

    const sent = seen[0]?.headers['user-agent'] ?? '';
    expect(sent).toBe(AUDIT_USER_AGENT);
    expect(sent).toContain('Movar-Audit');
    expect(sent).toContain('https://movar.fyi');
    // Spoofing a browser would make this bot-protection evasion.
    expect(sent).not.toContain('Mozilla');
    expect(sent).not.toContain('Chrome');
  });

  it('omits Accept-Language entirely on the no-preference leg', async () => {
    const { fetchImpl, seen } = stubFetch({ [HOME]: { status: 200, body: 'ok' } });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    await prober.probe({ url: HOME, acceptLanguage: null });
    expect(seen[0]?.headers['accept-language']).toBeUndefined();
  });

  it('walks a redirect chain and records every hop in order', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 302, headers: { location: 'https://example.com/uk/' } },
      'https://example.com/uk/': { status: 200, body: '<html lang="uk">привіт' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: 'uk' });

    expect(probe.outcome).toBe('ok');
    expect(probe.status).toBe(200);
    expect(probe.redirectChain).toEqual([
      { url: HOME, status: 302, location: 'https://example.com/uk/' },
    ]);
    expect(body).toContain('привіт');
  });

  /**
   * `core/serving-vary-missing` asks about the resource at the probed URL — the
   * redirect a shared cache stores — not about the fixed-locale page it points
   * at. Reading the destination's headers made the rule ask the wrong resource.
   */
  it('records the FIRST response’s headers, not the redirect destination’s', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 302, headers: { location: 'https://example.com/uk/', 'x-leg': 'first' } },
      'https://example.com/uk/': { status: 200, headers: { 'x-leg': 'final' }, body: 'uk' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: 'uk' });
    expect(probe.responseHeaders['x-leg']).toBe('first');
  });

  it('stops on a redirect loop instead of spinning', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 302, headers: { location: 'https://example.com/a' } },
      'https://example.com/a': { status: 302, headers: { location: HOME } },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });
    expect(probe.redirectChain.length).toBeGreaterThanOrEqual(2);
    expect(prober.spent()).toBeLessThan(10);
  });

  it('honours the hop cap on an endless chain', async () => {
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl: endlessChain(), maxHops: 3 });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });
    expect(probe.redirectChain.length).toBeLessThanOrEqual(4);
  });

  /**
   * The chain past the ceiling is the evidence, not the absence of it.
   *
   * Eleven distinct URLs, so the `seen` set never fires and only the hop cap
   * ends the walk. Falling out of the loop used to answer `response: null`,
   * which `resolveOutcome` read as `error` and `adjudicableProbes` dropped —
   * eleven requests spent, and `core/switch-bounces` handed nothing at all.
   */
  it('keeps a chain the hop cap ended adjudicable, all eleven hops of it', async () => {
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl: endlessChain() });
    const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });
    const evidence = networkEvidence([], [probe]);

    expect(probe.redirectChain).toHaveLength(DEFAULT_MAX_HOPS + 1);
    expect(probe.outcome).toBe('ok');
    // The last hop really did answer 302; `0` would claim no response at all.
    expect(probe.status).toBe(302);
    // …and the chain has an end this probe never reached, which it says.
    expect(probe.redirectChainTruncated).toBe(true);
    // A redirect's body is never the site's content, so nothing is digested.
    expect(body).toBeNull();
    expect(adjudicableProbes(evidence)).toHaveLength(1);
    expect([...deriveCapabilities(evidence)]).toContain('http');
  });

  /**
   * The control the inconsistency was measured against: a loop exits through
   * the `seen` check, which is an end the walk actually reached. Only the hop
   * cap truncates, and a rule asks with the flag rather than counting hops
   * against a ceiling that belongs to the collector.
   */
  it('does not call a chain that closed its own loop truncated', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 302, headers: { location: 'https://example.com/a' } },
      'https://example.com/a': { status: 302, headers: { location: HOME } },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });

    expect(probe.outcome).toBe('ok');
    expect(probe.redirectChainTruncated).toBeUndefined();
  });

  /**
   * A challenge answers HTTP 200 with its own `<html lang>` and body text.
   * Adjudicating one manufactures a false accusation about a named company.
   */
  it('reports a challenge interstitial as blocked despite HTTP 200', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: {
        status: 200,
        headers: { server: 'cloudflare' },
        body: '<html lang="en"><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script>',
      },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });

    expect(probe.outcome).toBe('blocked');
    // Nothing downstream of a blocked probe may be adjudicated.
    expect(body).toBeNull();
  });

  it('does NOT call an ordinary Cloudflare-fronted page blocked', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 200, headers: { server: 'cloudflare' }, body: '<html lang="en">shop' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });
    expect(probe.outcome).toBe('ok');
  });

  it('turns a transport failure into an error probe rather than throwing', async () => {
    const fetchImpl: FetchLike = failingFetch;
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });

    expect(probe.outcome).toBe('error');
    expect(probe.status).toBe(0);
    expect(body).toBeNull();
  });

  it('refuses an over-budget probe explicitly rather than quietly stopping', async () => {
    const { fetchImpl } = stubFetch({ [HOME]: { status: 200, body: 'ok' } });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: 2 });

    await prober.probe({ url: HOME, acceptLanguage: 'uk' });
    await prober.probe({ url: HOME, acceptLanguage: 'en' });
    expect(prober.remaining()).toBe(0);
    await expect(prober.probe({ url: HOME, acceptLanguage: 'de' })).rejects.toBeInstanceOf(
      RequestBudgetExhaustedError,
    );
  });

  it('stamps the vantage and cookie state on every probe', async () => {
    const { fetchImpl } = stubFetch({ [HOME]: { status: 200, body: 'ok' } });
    const cold = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const warm = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, cookieState: 'warm' });

    expect((await cold.probe({ url: HOME, acceptLanguage: null })).probe.cookieState).toBe('cold');
    expect((await warm.probe({ url: HOME, acceptLanguage: null })).probe.cookieState).toBe('warm');
    const { probe } = await cold.probe({ url: HOME, acceptLanguage: null });
    expect(probe.vantage).toEqual(LOCAL_VANTAGE);
    // A vantage country is a claim; the local collector never invents one.
    expect(probe.vantage.country).toBeUndefined();
  });

  it('sends no cookie on a cold run', async () => {
    const { fetchImpl, seen } = stubFetch({
      [HOME]: { status: 200, headers: { 'set-cookie': 'lang=ru; Path=/' }, body: 'ok' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    await prober.probe({ url: HOME, acceptLanguage: null });
    await prober.probe({ url: HOME, acceptLanguage: 'uk' });
    expect(seen.every((request) => request.headers['cookie'] === undefined)).toBe(true);
  });

  /**
   * A warm run is a **session**, and one jar per probe is not one: it reached
   * the walk empty every time, absorbed the landing response's `Set-Cookie`,
   * and was then discarded — so every request still went out cold and only a
   * redirect chain ever carried a `Cookie` header. What
   * `core/serving-cookie-overrides-header` asks is whether a *stored* language
   * cookie outranks an explicit `Accept-Language`, and no such cookie exists
   * until one probe's `Set-Cookie` reaches the next probe.
   */
  it('carries a cookie from one warm probe to the next', async () => {
    const { fetchImpl, seen } = stubFetch({
      [HOME]: { status: 200, headers: { 'set-cookie': 'lang=ru; Path=/' }, body: 'ok' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, cookieState: 'warm' });

    await prober.probe({ url: HOME, acceptLanguage: null });
    await prober.probe({ url: HOME, acceptLanguage: 'uk' });

    // The first request opens the session, so it is the site — not us — that
    // decides what is in the jar the second one carries.
    expect(seen[0]?.headers['cookie']).toBeUndefined();
    expect(seen[1]?.headers['cookie']).toBe('lang=ru');
  });

  /** A per-request opt-in warms the same one jar; a cold prober keeps none. */
  it('keeps a cold probe out of the jar entirely', async () => {
    const { fetchImpl, seen } = stubFetch({
      [HOME]: { status: 200, headers: { 'set-cookie': 'lang=ru; Path=/' }, body: 'ok' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });

    await prober.probe({ url: HOME, acceptLanguage: null, cookieState: 'warm' });
    await prober.probe({ url: HOME, acceptLanguage: 'uk', cookieState: 'warm' });
    await prober.probe({ url: HOME, acceptLanguage: 'uk' });

    expect(seen[1]?.headers['cookie']).toBe('lang=ru');
    // The cold probe neither reads the jar nor feeds it.
    expect(seen[2]?.headers['cookie']).toBeUndefined();
  });

  it('gives identical bodies the same hash and different bodies different ones', () => {
    expect(sha256('same')).toBe(sha256('same'));
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

/**
 * The module doc claims the request budget is "enforced here rather than
 * trusted to callers". These pin that claim for every caller, not just the CLI
 * — `parseArgs` validates `--budget` at the edge, but the Safari host app
 * collector, a relay, or a test harness constructs a prober directly.
 */
describe('createProber option validation', () => {
  /** Never routed anywhere: construction must fail before a request exists. */
  const { fetchImpl } = stubFetch({});

  const NOT_A_COUNT: readonly number[] = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    -0.5,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  /**
   * The reported defect. Unguarded, this constructed happily and then ran
   * unbounded against a live third-party site: `spent >= NaN` is false forever,
   * so `RequestBudgetExhaustedError` never throws, and `remaining()` is `NaN`,
   * which never satisfies the collector's `if (prober.remaining() === 0) break`.
   */
  it('rejects a NaN budget at construction, since NaN silently uncaps the run', () => {
    expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: Number.NaN })).toThrow(
      TypeError,
    );
  });

  it('rejects every budget that is not a non-negative safe integer', () => {
    for (const budget of NOT_A_COUNT) {
      expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget })).toThrow(TypeError);
    }
  });

  /**
   * Same shape, same failure mode. A `NaN` hop cap makes `hop <= maxHops` false
   * on the first pass, so `walk` returns without fetching at all and the probe
   * reports `error` for a request nobody made; a `NaN` timeout is coerced to 1 ms
   * by `setTimeout`, aborting every request almost immediately.
   */
  it('rejects a malformed maxHops or timeoutMs on the same terms', () => {
    for (const value of NOT_A_COUNT) {
      expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, maxHops: value })).toThrow(
        TypeError,
      );
      expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, timeoutMs: value })).toThrow(
        TypeError,
      );
    }
  });

  /**
   * The two conditions must stay distinguishable. `RequestBudgetExhaustedError`
   * means a run reached its ceiling and a caller may legitimately catch it to
   * report partial coverage; a malformed ceiling is a bug in the caller's code,
   * and must not be swallowed by that same handler.
   */
  it('refuses a malformed budget with a TypeError, never RequestBudgetExhaustedError', () => {
    let thrown: unknown;
    try {
      createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: Number.NaN });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).not.toBeInstanceOf(RequestBudgetExhaustedError);
  });

  it('names the offending option and value, since construction is refused over it', () => {
    expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: Number.NaN })).toThrow(
      /budget.*NaN/u,
    );
    expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, maxHops: -1 })).toThrow(
      /maxHops.*-1/u,
    );
  });

  /** The point of a runtime guard on a typed API: the callers without types. */
  it('guards a caller the type system does not', () => {
    expect(() =>
      createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: '40' as unknown as number }),
    ).toThrow(TypeError);
  });

  /**
   * Zero is a real answer for each of the three — spend nothing, follow no
   * redirect, abort at once — so the guard must be a range check and never a
   * falsy one, and an omitted option must still fall through to its default.
   */
  it('accepts zero for each option, and the defaults when they are omitted', () => {
    expect(() =>
      createProber({
        vantage: LOCAL_VANTAGE,
        fetchImpl,
        budget: 0,
        maxHops: 0,
        timeoutMs: 0,
      }),
    ).not.toThrow();

    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    expect(prober.remaining()).toBe(DEFAULT_REQUEST_BUDGET);
  });
});

describe('isChallengeResponse', () => {
  it('trusts an explicit challenge header', () => {
    expect(isChallengeResponse({ 'cf-mitigated': 'challenge' }, null)).toBe(true);
  });

  it('never treats a plain CDN header as a challenge', () => {
    expect(isChallengeResponse({ server: 'cloudflare' }, '<html>ordinary page</html>')).toBe(false);
  });
});

describe('resolveLocation', () => {
  it('resolves a relative Location against the URL that produced it', () => {
    expect(resolveLocation('https://example.com/a/b', '../uk/')).toBe('https://example.com/uk/');
  });

  it('returns null for an unusable Location', () => {
    expect(resolveLocation('not a url', ':::')).toBeNull();
  });
});

describe('robots.txt', () => {
  const ROBOTS = `
    User-agent: BadBot
    Disallow: /

    User-agent: *
    Disallow: /private
    Allow: /private/public
  `;

  it('reads the wildcard group, not another agent’s', () => {
    const rules = parseRobots(ROBOTS);
    expect(rules.disallow).toContain('/private');
    expect(robotsAllows(rules, '/anything')).toBe(true);
  });

  it('disallows a matching prefix', () => {
    expect(robotsAllows(parseRobots(ROBOTS), '/private/thing')).toBe(false);
  });

  it('lets a longer Allow win over a shorter Disallow', () => {
    expect(robotsAllows(parseRobots(ROBOTS), '/private/public/page')).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobots('# comment\n\nUser-agent: *\nDisallow: /x # trailing');
    expect(rules.disallow).toEqual(['/x']);
  });

  it('expands a * inside a Disallow pattern', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*/private');
    expect(robotsAllows(rules, '/uk/private')).toBe(false);
    expect(robotsAllows(rules, '/uk/private/deep')).toBe(false);
    expect(robotsAllows(rules, '/uk/public')).toBe(true);
  });

  it('anchors a Disallow pattern ending in $ to the end of the path', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.json$');
    expect(robotsAllows(rules, '/data.json')).toBe(false);
    expect(robotsAllows(rules, '/a/b/data.json')).toBe(false);
    expect(robotsAllows(rules, '/data.json.html')).toBe(true);
  });

  it('anchors the start of a $-terminated pattern too', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /data.json$');
    expect(robotsAllows(rules, '/data.json')).toBe(false);
    expect(robotsAllows(rules, '/a/data.json')).toBe(true);
  });

  it('honours the query-string idiom Disallow: /*?', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*?');
    expect(robotsAllows(rules, '/search?q=1')).toBe(false);
    expect(robotsAllows(rules, '/search')).toBe(true);
  });

  it('matches every other pattern character literally', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /a.b(c)+d');
    expect(robotsAllows(rules, '/a.b(c)+d')).toBe(false);
    expect(robotsAllows(rules, '/axb(c)d')).toBe(true);
    expect(robotsAllows(rules, '/a.bccd')).toBe(true);
  });

  it('keeps longest-pattern-wins when the longer pattern holds a wildcard', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/*/public');
    expect(robotsAllows(rules, '/private/uk/public')).toBe(true);
    expect(robotsAllows(rules, '/private/uk/other')).toBe(false);
  });

  it('reads a group whose consecutive user-agent lines start with the wildcard', () => {
    const rules = parseRobots('User-agent: *\nUser-agent: Googlebot\nDisallow: /private');
    expect(rules.disallow).toEqual(['/private']);
    expect(robotsAllows(rules, '/private/thing')).toBe(false);
  });

  it('reads consecutive user-agent lines the same way in either order', () => {
    const wildcardFirst = parseRobots('User-agent: *\nUser-agent: Googlebot\nDisallow: /private');
    const wildcardLast = parseRobots('User-agent: Googlebot\nUser-agent: *\nDisallow: /private');
    expect(wildcardFirst).toEqual(wildcardLast);
  });

  it('starts a new group at the first user-agent line after a rule', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /a\n\nUser-agent: BadBot\nUser-agent: OtherBot\nDisallow: /b',
    );
    expect(rules.disallow).toEqual(['/a']);
  });
});
