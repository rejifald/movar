import { describe, expect, it } from 'vitest';
import { collectNetwork, createProber, LOCAL_VANTAGE } from './node';
import { deriveCapabilities } from '../capability';
import { evaluate } from '../evaluate';
import { CORE_RULESET } from '../ruleset';
import type { FetchLike } from './probe';
import type { Evidence } from '../evidence';
import {
  networkSource,
  ruleResult,
  tick,
  respond,
  cookiesOn,
  HOME,
  UK,
  HOME_ROBOTS,
  ALLOW_ALL,
  UK_PAGE,
} from './node.test-utils';

describe('collectNetwork', () => {
  /**
   * The warm cookie leg, collector to verdict.
   *
   * `core/serving-cookie-overrides-header` had been in the catalogue since
   * family C landed without ever adjudicating anything: the prober could keep a
   * jar, but `collectNetwork` exposed no way to ask for one and the CLI had no
   * flag, so every real run read `not-applicable` and the rule was unreachable
   * from any command. Driven through `CORE_RULESET` rather than asserted at the
   * probe, because that is the shape of the defect — the collector's fields all
   * looked right while the verdict a site owner reads never moved.
   */
  describe('the warm cookie leg', () => {
    const COOKIE_RULE = 'core/serving-cookie-overrides-header';
    const ALTERNATES =
      '<link rel="alternate" hreflang="uk" href="/uk/">' +
      '<link rel="alternate" hreflang="ru" href="/">';
    const RU_HOME = `<html lang="ru"><head>${ALTERNATES}</head><body><p>русское тело</p></body></html>`;
    const UK_HOME = `<html lang="uk"><head>${ALTERNATES}</head><body><p>українське тіло</p></body></html>`;

    interface Sent {
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    }

    /**
     * A site that decides by cookie — the defect the rule is written for.
     *
     * Cookie-free, it honours `Accept-Language`. Once its own `lang=ru` comes
     * back to it, it answers Russian whatever the header says. And it sets that
     * cookie on the very first visit, which is why the warm leg has to open
     * with a request that states no preference: warmed by `uk`, the jar would
     * only ever hold what our own header talked it into.
     */
    function cookieDecidedSite(sent: Sent[]): FetchLike {
      return async (url, init) => {
        await tick();
        sent.push({ url, headers: init.headers });
        if (url === HOME_ROBOTS) return respond({ status: 200, body: ALLOW_ALL });
        if (url === UK) return respond({ status: 200, body: UK_PAGE });
        if (url !== HOME) throw new Error(`unstubbed ${url}`);
        const stored = init.headers['cookie'] !== undefined;
        const honoured = !stored && init.headers['accept-language'] === 'uk';
        return respond({
          status: 200,
          headers: { 'set-cookie': 'lang=ru; Path=/' },
          body: honoured ? UK_HOME : RU_HOME,
        });
      };
    }

    async function collectWarm(sent: Sent[] = []): Promise<Evidence> {
      return collectNetwork({
        url: HOME,
        headers: [null, 'uk', 'ru'],
        warm: true,
        fetchImpl: cookieDecidedSite(sent),
      });
    }

    /** The same site under `--warm --follow`, against one stated ceiling. */
    async function collectWarmAndFollow(budget: number): Promise<Evidence> {
      return collectNetwork({
        url: HOME,
        headers: [null, 'uk'],
        warm: true,
        followDeclaredTargets: true,
        budget,
        fetchImpl: cookieDecidedSite([]),
      });
    }

    /** A leg is `(url, vantage, cookieState)`, so the warm one is a second leg. */
    it('collects a warm matrix beside the cold one, each stamped as its own leg', async () => {
      const evidence = await collectWarm();
      const { probes, cookies } = networkSource(evidence);
      const headersOf = (state: string): (string | null)[] =>
        probes.filter((probe) => probe.cookieState === state).map((probe) => probe.acceptLanguage);

      expect(cookies).toBe('warm');
      expect(headersOf('cold')).toEqual([null, 'uk', 'ru']);
      expect(headersOf('warm')).toEqual([null, 'uk', 'ru']);
      // The cold matrix is untouched, so the other six family-C rules still
      // read a differential nothing but the header varied in.
      expect(deriveCapabilities(evidence).has('matrix')).toBe(true);
    });

    it('opens the warm leg with a request that states no preference, and no cookie', async () => {
      const sent: Sent[] = [];
      await collectWarm(sent);
      const [cold, warm] = [sent.slice(0, 3), sent.slice(3)];

      expect(cold.every((request) => request.headers['cookie'] === undefined)).toBe(true);
      expect(warm[0]?.headers['accept-language']).toBeUndefined();
      expect(warm[0]?.headers['cookie']).toBeUndefined();
      // …and from there the session is the site's own choice, carried forward.
      expect(warm[1]?.headers['cookie']).toBe('lang=ru');
      expect(warm[1]?.headers['accept-language']).toBe('uk');
    });

    /**
     * The no-preference request is **hoisted**, not assumed to be there.
     *
     * Every fixture and the default matrix already open with `null`, so the
     * whole defensive half of `warmOrderOf` sat untested: replacing its body
     * with `return headers` left the suite green. Only an order that lacks a
     * leading `null` can show what the hoist is for — without it the leg opens
     * with `Accept-Language: uk`, the jar holds whatever cookie *our own*
     * header talked the site into setting, and the warm reading the rule is
     * handed answers a question nobody asked.
     */
    it('opens with no preference even when the caller listed none', async () => {
      const sent: Sent[] = [];
      await collectNetwork({
        url: HOME,
        headers: ['uk', 'ru'],
        warm: true,
        fetchImpl: cookieDecidedSite(sent),
      });
      // Two cold legs, `uk` then `ru`; everything after them is the warm leg.
      const warm = sent.slice(2);

      expect(warm.map((request) => request.headers['accept-language'])).toEqual([
        undefined,
        'uk',
        'ru',
      ]);
      expect(warm[0]?.headers['cookie']).toBeUndefined();
    });

    /**
     * `options.prober` is an exported seam, and a caller can hand in a prober
     * already built warm without ever setting the flag. Reading the posture off
     * `options.warm` alone stamped `cold` on that bundle — not a cautious
     * reading but a false one, contradicted by every probe beneath it.
     */
    it('says warm for a prober handed in warm, flag or no flag', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null, 'uk'],
        prober: createProber({
          vantage: LOCAL_VANTAGE,
          cookieState: 'warm',
          fetchImpl: cookieDecidedSite([]),
        }),
      });
      const { probes, cookies } = networkSource(evidence);

      expect(probes.map((probe) => probe.cookieState)).toEqual(['warm', 'warm']);
      expect(cookies).toBe('warm');
    });

    /**
     * The warm leg runs **before** declared-target expansion, so one ceiling
     * too low for both costs the run its `traversal` capability and the whole
     * family of rules that reads it.
     *
     * That order is a decision rather than where the call landed: `--warm` is
     * an opt-in naming one rule nothing else in the bundle can answer, and
     * expansion reads the page set the matrices built — this leg's pages
     * included — so running it first would spend the budget on targets
     * discovered from half the pages. Pinned so a future reordering is
     * deliberate; what the run loses, it loses visibly, as `not-collected`
     * under an absent capability rather than as a pass.
     */
    it('spends a tight budget on the warm leg before expanding to declared targets', async () => {
      const starved = await collectWarmAndFollow(4);
      expect(networkSource(starved).probes.map((probe) => probe.cookieState)).toEqual([
        'cold',
        'cold',
        'warm',
        'warm',
      ]);
      expect(deriveCapabilities(starved).has('traversal')).toBe(false);

      // …and it is the ceiling doing that, not the fixture: given room for
      // both, the expansion still happens.
      expect(deriveCapabilities(await collectWarmAndFollow(8)).has('traversal')).toBe(true);
    });

    it('lets core/serving-cookie-overrides-header reach a verdict at last', async () => {
      const result = ruleResult(evaluate(await collectWarm(), CORE_RULESET), COOKIE_RULE);

      expect(result.verdict).toBe('warn');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.grounding).toBe('observed');
      expect(result.findings[0]?.summary).toContain(
        'a stored cookie is taking precedence over the stated uk preference',
      );
    });

    /**
     * The control: the same site, the same markup, no `--warm`. The finding
     * above is the flag's doing rather than the fixture's, and a cold run still
     * refuses to guess — `not-applicable`, never a pass.
     */
    it('leaves the same site not-applicable without the flag', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null, 'uk', 'ru'],
        fetchImpl: cookieDecidedSite([]),
      });
      const result = ruleResult(evaluate(evidence, CORE_RULESET), COOKIE_RULE);

      expect(networkSource(evidence).cookies).toBe('cold');
      expect(result.verdict).toBe('not-applicable');
      expect(result.notApplicableReason).toContain('every probe in this run was cold');
    });

    /**
     * Only the URL the operator typed goes warm. A cookie this run collected is
     * never presented to `robots.txt` or to a declared target — those stay the
     * unauthenticated page view the network posture documents, and their probes
     * say so.
     */
    it('keeps robots.txt and the declared targets cold', async () => {
      const sent: Sent[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null, 'uk'],
        warm: true,
        followDeclaredTargets: true,
        fetchImpl: cookieDecidedSite(sent),
      });
      const elsewhere = sent.filter((request) => request.url !== HOME);

      expect(elsewhere.map((request) => request.url)).toContain(HOME_ROBOTS);
      expect(elsewhere.every((request) => request.headers['cookie'] === undefined)).toBe(true);
      expect(
        networkSource(evidence)
          .probes.filter((probe) => probe.url !== HOME)
          .every((probe) => probe.cookieState === 'cold'),
      ).toBe(true);
    });

    /**
     * A budget too small for both buys the cold matrix, which is the right way
     * round — it is the leg the other six family-C rules are adjudicated from.
     *
     * What must not happen is the run then reading as a cold one. Every probe
     * it kept *is* cold, so the probes alone can no longer tell "nobody asked"
     * from "we asked and got nothing", and answering the first would hand the
     * collector's shortfall to the operator as their own choice. The posture on
     * `NetworkSource` is the only place that difference survives, and this is
     * what it buys.
     */
    it('spends a short budget on the cold matrix and still says warm was asked for', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null, 'uk'],
        warm: true,
        budget: 2,
        fetchImpl: cookieDecidedSite([]),
      });
      const { probes, cookies } = networkSource(evidence);
      const result = ruleResult(evaluate(evidence, CORE_RULESET), COOKIE_RULE);

      expect(probes.map((probe) => probe.cookieState)).toEqual(['cold', 'cold']);
      expect(cookies).toBe('warm');
      expect(result.verdict).toBe('not-applicable');
      expect(result.notApplicableReason).toContain('asked for a warm cookie leg');
    });

    /**
     * A session is one host's, not the run's.
     *
     * The jar outliving a single probe is what makes a warm leg warm, and it is
     * also what turns a flat `name → value` map into a courier: a cookie set by
     * whichever origin a redirect happened to end on would go out on every
     * later request the run made, to any host, over any scheme. That is a
     * privacy defect rather than an untidiness — this tool fetches third-party
     * sites that never agreed to be audited, and the three shapes below are the
     * three ways the courier does damage: a stranger's cookie handed to the
     * site the operator typed, the typed site's cookie handed to a stranger,
     * and an `https`-only cookie put on the wire in clear.
     *
     * Each needs the jar to survive a probe, so each is a leak the run-scoped
     * jar introduced and the per-probe one could not reach.
     */
    describe('keeps a cookie with the host that set it', () => {
      const TYPED = 'https://site.example/';
      const CONSENT = 'https://consent.thirdparty.example/';
      const BEACON = 'https://analytics.thirdparty.example/beacon';
      /** The same host, one scheme down — a downgrade redirect, which is ordinary. */
      const INSECURE = 'http://site.example/insecure';
      const PAGE = '<html lang="en"><head></head><body><p>english body</p></body></html>';

      async function warmRun(fetchImpl: FetchLike): Promise<Sent[]> {
        const sent: Sent[] = [];
        await collectNetwork({
          url: TYPED,
          headers: [null, 'uk'],
          warm: true,
          fetchImpl: async (url, init) => {
            sent.push({ url, headers: init.headers });
            return fetchImpl(url, init);
          },
        });
        return sent;
      }

      /**
       * The typed URL bounces through a consent host, which sets its own
       * cookie. No browser would ever show that cookie to `site.example`.
       */
      it('does not hand a third party cookie back to the site the operator typed', async () => {
        const sent = await warmRun(async (url) => {
          await tick();
          if (url === TYPED) return respond({ status: 302, headers: { location: CONSENT } });
          if (url !== CONSENT) throw new Error(`unstubbed ${url}`);
          return respond({
            status: 200,
            headers: { 'set-cookie': 'CONSENT=PENDING+abc; Path=/' },
            body: PAGE,
          });
        });

        const typed = sent.filter((request) => request.url === TYPED);
        expect(typed.length).toBeGreaterThan(1);
        expect(cookiesOn(typed)).toEqual([]);
      });

      /**
       * And the other direction: the typed origin's own session cookie must not
       * ride along to the analytics host its `uk` handling redirects to.
       */
      it('does not carry the typed origin cookie onward to a foreign origin', async () => {
        const sent = await warmRun(async (url, init) => {
          await tick();
          if (url === BEACON) return respond({ status: 200, body: PAGE });
          if (url !== TYPED) throw new Error(`unstubbed ${url}`);
          // The hand-off sets nothing itself, so only a jar that outlived the
          // earlier probe can put a cookie on this chain.
          if (init.headers['accept-language'] === 'uk') {
            return respond({ status: 302, headers: { location: BEACON } });
          }
          return respond({
            status: 200,
            headers: { 'set-cookie': 'sid=typed-origin-secret; Path=/' },
            body: PAGE,
          });
        });

        const foreign = sent.filter((request) => request.url === BEACON);
        expect(foreign).not.toHaveLength(0);
        expect(cookiesOn(foreign)).toEqual([]);
      });

      /**
       * `Secure` is the one attribute whose whole content is "not over this
       * scheme". Replaying such a cookie on an `http` hop puts a value the site
       * said must stay encrypted in front of anyone on the path.
       */
      it('does not replay a Secure cookie over plain http', async () => {
        const sent = await warmRun(async (url, init) => {
          await tick();
          if (url === INSECURE) return respond({ status: 200, body: PAGE });
          if (url !== TYPED) throw new Error(`unstubbed ${url}`);
          if (init.headers['accept-language'] === 'uk') {
            return respond({ status: 302, headers: { location: INSECURE } });
          }
          return respond({
            status: 200,
            headers: { 'set-cookie': 'sid=https-only; Path=/; Secure; HttpOnly' },
            body: PAGE,
          });
        });

        const inClear = sent.filter((request) => request.url.startsWith('http://'));
        expect(inClear).not.toHaveLength(0);
        expect(cookiesOn(inClear)).toEqual([]);
      });
    });
  });
});
