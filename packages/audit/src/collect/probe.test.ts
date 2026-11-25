import { describe, expect, it } from 'vitest';
import {
  AUDIT_USER_AGENT,
  createProber,
  DEFAULT_MAX_HOPS,
  isChallengeResponse,
  RequestBudgetExhaustedError,
  resolveLocation,
  sha256,
} from './probe';
import type { FetchLike } from './probe';
import { LOCAL_VANTAGE } from './node';
import { adjudicableProbes, deriveCapabilities } from '../capability';
import { networkEvidence } from '../../test/fixtures';
import { tick, respond, stubFetch, HOME, failingFetch, endlessChain } from './probe.test-utils';

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

  /**
   * …and records the destination's alongside it, because the *document* the
   * chain served is a different resource from the redirect that a shared cache
   * stores. One probe, two resources, both named — see `documentHeadersOf`.
   */
  it('records the destination’s headers too, as a separate field', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 302, headers: { location: 'https://example.com/uk/', 'x-leg': 'first' } },
      'https://example.com/uk/': { status: 200, headers: { 'x-leg': 'final' }, body: 'uk' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: 'uk' });
    expect(probe.finalResponseHeaders?.['x-leg']).toBe('final');
  });

  /**
   * A chain that never redirected has one response, so the second field would
   * be a byte-for-byte copy of the first on every probe of every bundle ever
   * stored. Absent-with-an-empty-chain already says "read `responseHeaders`",
   * exactly as an absent `redirectChainTruncated` says "this chain ended".
   */
  it('omits the destination headers when the chain never redirected', async () => {
    const { fetchImpl } = stubFetch({
      [HOME]: { status: 200, headers: { vary: 'Accept-Language' }, body: 'ok' },
    });
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });

    expect(probe.redirectChain).toEqual([]);
    expect(probe.finalResponseHeaders).toBeUndefined();
    expect(probe.responseHeaders['vary']).toBe('Accept-Language');
  });

  /**
   * …and omits them wherever the walk ended without a body at all.
   *
   * Three exits answer with a live response and `body: null` — the hop cap, the
   * request budget, and a chain that looped or could not resolve its
   * `Location`. On every one of them the "final" response is the last
   * **redirect**, so gating on the chain alone wrote a `302`'s own `Link` and
   * `Content-Language` into the one field whose entire purpose is keeping them
   * out of a document's digest, and into every bundle stored from such a probe.
   * Both `pages.add` callers are body-gated today, so nothing reads it back —
   * which is the argument for fixing it here rather than relying on that: the
   * field is written once and replayed by every runtime that reads the bundle.
   * There is no document, so there are no document headers.
   */
  describe('a walk that ended on a redirect and served no body', () => {
    const REDIRECT_HEADERS = {
      link: '<https://example.com/de/>; rel="alternate"; hreflang="de"',
      'content-language': 'de',
    };

    /** Each hop a fresh URL, carrying declarations that belong to the redirect. */
    function declaringChain(): FetchLike {
      let n = 0;
      return async () => {
        n += 1;
        await tick();
        return respond({
          status: 302,
          headers: { ...REDIRECT_HEADERS, location: `https://example.com/${n}` },
        });
      };
    }

    it('omits the destination headers when the budget ended the chain', async () => {
      const prober = createProber({
        vantage: LOCAL_VANTAGE,
        fetchImpl: declaringChain(),
        budget: 3,
      });
      const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });

      expect(body).toBeNull();
      expect(probe.redirectChainTruncated).toBe(true);
      expect(probe.finalResponseHeaders).toBeUndefined();
      // The redirect's own bag stays where it belongs — the first response's,
      // which is the resource `core/serving-vary-missing` asks about.
      expect(probe.responseHeaders['link']).toBe(REDIRECT_HEADERS.link);
    });

    it('omits them when the hop cap ended the chain', async () => {
      const prober = createProber({
        vantage: LOCAL_VANTAGE,
        fetchImpl: declaringChain(),
        maxHops: 3,
      });
      const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });

      expect(body).toBeNull();
      expect(probe.redirectChainTruncated).toBe(true);
      expect(probe.finalResponseHeaders).toBeUndefined();
    });

    /** An end the walk *did* see, and still no body to describe. */
    it('omits them when the chain closed a loop', async () => {
      const { fetchImpl } = stubFetch({
        [HOME]: {
          status: 302,
          headers: { ...REDIRECT_HEADERS, location: 'https://example.com/a' },
        },
        'https://example.com/a': {
          status: 302,
          headers: { ...REDIRECT_HEADERS, location: HOME },
        },
      });
      const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
      const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });

      expect(body).toBeNull();
      expect(probe.redirectChainTruncated).toBeUndefined();
      expect(probe.redirectChain.length).toBeGreaterThanOrEqual(2);
      expect(probe.finalResponseHeaders).toBeUndefined();
    });

    /** The gate is "no body", not "no destination": a chain that served one keeps them. */
    it('still records them when the chain redirected and served a body', async () => {
      const { fetchImpl } = stubFetch({
        [HOME]: {
          status: 302,
          headers: { ...REDIRECT_HEADERS, location: 'https://example.com/uk/' },
        },
        'https://example.com/uk/': { status: 200, headers: { 'x-leg': 'final' }, body: 'uk' },
      });
      const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
      const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });

      expect(probe.finalResponseHeaders?.['x-leg']).toBe('final');
      expect(probe.finalResponseHeaders?.['link']).toBeUndefined();
    });
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

  /**
   * The budget ends the walk; it does not end the audit.
   *
   * `spend()` sits inside the per-hop fetch, so one `probe()` costs 1 to
   * `maxHops + 1` requests and a chain can hit the ceiling on a hop nobody
   * could have predicted. Throwing from there took
   * `RequestBudgetExhaustedError` out through `collectNetwork` and killed a run
   * that had already collected most of a site — the error's own sentence says
   * an audit must *state* what it did not fetch, and a crash states nothing.
   */
  it('stops the walk when the budget runs out mid-chain, rather than throwing', async () => {
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl: endlessChain(), budget: 3 });
    const { probe, body } = await prober.probe({ url: HOME, acceptLanguage: null });
    const evidence = networkEvidence([], [probe]);

    // Every request the budget had, and not one past it.
    expect(prober.spent()).toBe(3);
    expect(prober.remaining()).toBe(0);
    // The three hops it did see are the evidence, and stay adjudicable.
    expect(probe.redirectChain).toHaveLength(3);
    expect(probe.outcome).toBe('ok');
    expect(probe.status).toBe(302);
    expect(body).toBeNull();
    expect(adjudicableProbes(evidence)).toHaveLength(1);
    expect([...deriveCapabilities(evidence)]).toContain('http');
  });

  /**
   * One flag for both ceilings. A rule asks "did this walk see where the chain
   * ended?", and neither the hop cap nor the budget did; a sibling flag would
   * mean asking twice, and the reader that forgot the second would publish a
   * `pass` off a chain whose end nobody saw — the defect #482 closed, reopened
   * on the budget path.
   */
  it('marks a budget-ended chain truncated, exactly as the hop cap does', async () => {
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl: endlessChain(), budget: 3 });
    const { probe } = await prober.probe({ url: HOME, acceptLanguage: null });

    expect(probe.redirectChainTruncated).toBe(true);
    // Shorter than the hop cap, which is what makes this a test of the budget
    // path at all: with `endlessChain()` the cap would have set the same flag
    // on its own, and the assertion above would pass without the budget ever
    // being consulted. It says nothing about the *bundle* being able to tell
    // the ceilings apart — `maxHops` is not on the wire, and no reader needs
    // the distinction (see `ProbeEvidence.redirectChainTruncated`).
    expect(probe.redirectChain.length).toBeLessThan(DEFAULT_MAX_HOPS);
  });

  /**
   * The first request stays the caller's to authorize. Asking for a probe the
   * budget cannot pay for at all is a caller that did not read `remaining()`,
   * not an observation about a site — so it throws, and the graceful stop never
   * degrades into the silent cap the error exists to prevent.
   */
  it('still throws for a probe with no budget at all, hops or no hops', async () => {
    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl: endlessChain(), budget: 0 });
    await expect(prober.probe({ url: HOME, acceptLanguage: null })).rejects.toBeInstanceOf(
      RequestBudgetExhaustedError,
    );
    expect(prober.spent()).toBe(0);
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

  /**
   * The attributes the jar acts on, each pinned where it withholds.
   *
   * A jar that outlives a probe is only safe while every one of these resolves
   * toward sending less: the cost of withholding is a `not-collected` on one
   * rule, and the cost of over-sending is somebody's cookie on the wire.
   */
  describe('the warm jar withholds what it is not entitled to send', () => {
    const SECTION = 'https://example.com/uk/page';
    const OTHER_SECTION = 'https://example.com/de/page';

    /** RFC 6265 §5.1.4: no `Path` means the section it was set in, not the site. */
    it('does not send a path-scoped cookie outside its own path', async () => {
      const { fetchImpl, seen } = stubFetch({
        [SECTION]: { status: 200, headers: { 'set-cookie': 'lang=uk' }, body: 'ok' },
        [OTHER_SECTION]: { status: 200, body: 'ok' },
        [HOME]: { status: 200, body: 'ok' },
      });
      const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, cookieState: 'warm' });

      await prober.probe({ url: SECTION, acceptLanguage: null });
      await prober.probe({ url: OTHER_SECTION, acceptLanguage: null });
      await prober.probe({ url: HOME, acceptLanguage: null });
      await prober.probe({ url: SECTION, acceptLanguage: 'ru' });

      expect(seen[1]?.headers['cookie']).toBeUndefined();
      expect(seen[2]?.headers['cookie']).toBeUndefined();
      // …and it does still come back to the path it was scoped to.
      expect(seen[3]?.headers['cookie']).toBe('lang=uk');
    });

    /** `Max-Age=0` is how a site deletes a cookie. Replaying one un-deletes it. */
    it('drops a cookie the site expired instead of replaying it', async () => {
      const { fetchImpl, seen } = stubFetch({
        [HOME]: {
          status: 200,
          headers: { 'set-cookie': 'lang=ru; Path=/; Max-Age=0' },
          body: 'ok',
        },
      });
      const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, cookieState: 'warm' });

      await prober.probe({ url: HOME, acceptLanguage: null });
      await prober.probe({ url: HOME, acceptLanguage: 'uk' });

      expect(seen[1]?.headers['cookie']).toBeUndefined();
    });

    /**
     * `Domain` is read only to refuse. A host may not set a cookie for a domain
     * it does not sit under — that is a response claiming to speak for someone
     * else, and honouring it is how a jar is poisoned from the outside.
     */
    it('refuses a cookie for a domain the responding host does not own', async () => {
      const { fetchImpl, seen } = stubFetch({
        [HOME]: {
          status: 200,
          headers: { 'set-cookie': 'lang=ru; Path=/; Domain=elsewhere.example' },
          body: 'ok',
        },
      });
      const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, cookieState: 'warm' });

      await prober.probe({ url: HOME, acceptLanguage: null });
      await prober.probe({ url: HOME, acceptLanguage: 'uk' });

      expect(seen[1]?.headers['cookie']).toBeUndefined();
    });

    /**
     * A `Domain` the host does sit under is accepted — and still filed under
     * the exact host, never widened to the parent. Exact matching needs no
     * public-suffix list to stay safe; a hand-rolled one fails open.
     */
    it('files a domain-scoped cookie under the exact host that set it', async () => {
      const SUBDOMAIN = 'https://www.example.com/';
      const SIBLING = 'https://shop.example.com/';
      const { fetchImpl, seen } = stubFetch({
        [SUBDOMAIN]: {
          status: 200,
          headers: { 'set-cookie': 'lang=ru; Path=/; Domain=.example.com' },
          body: 'ok',
        },
        [SIBLING]: { status: 200, body: 'ok' },
      });
      const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl, cookieState: 'warm' });

      await prober.probe({ url: SUBDOMAIN, acceptLanguage: null });
      await prober.probe({ url: SIBLING, acceptLanguage: 'uk' });
      await prober.probe({ url: SUBDOMAIN, acceptLanguage: 'uk' });

      expect(seen[1]?.headers['cookie']).toBeUndefined();
      expect(seen[2]?.headers['cookie']).toBe('lang=ru');
    });
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
