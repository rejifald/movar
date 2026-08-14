import { describe, expect, it } from 'vitest';
import {
  AUDIT_USER_AGENT,
  createProber,
  isChallengeResponse,
  parseRobots,
  RequestBudgetExhaustedError,
  resolveLocation,
  robotsAllows,
  sha256,
} from './probe';
import type { FetchLike, FetchLikeResponse } from './probe';
import { LOCAL_VANTAGE } from './node';

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
    let n = 0;
    const fetchImpl: FetchLike = async () => {
      n += 1;
      await tick();
      return respond({ status: 302, headers: { location: `https://example.com/${n}` } });
    };
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, maxHops: 3 });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });
    expect(probe.redirectChain.length).toBeLessThanOrEqual(4);
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

  it('gives identical bodies the same hash and different bodies different ones', () => {
    expect(sha256('same')).toBe(sha256('same'));
    expect(sha256('a')).not.toBe(sha256('b'));
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
});
