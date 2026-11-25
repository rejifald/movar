import { describe, expect, it } from 'vitest';
import { collectNetwork, createProber, LOCAL_VANTAGE } from './node';
import { deriveCapabilities } from '../capability';
import { evaluate } from '../evaluate';
import { CORE_RULESET } from '../ruleset';
import {
  networkSource,
  firstPage,
  ruleResult,
  routed,
  recording,
  HOME,
  UK,
  DE,
  QUERY_UK,
  HOME_ROBOTS,
  CROSS_DE,
  CROSS_AT,
  CROSS_ROBOTS,
  CROSS_ROBOTS_MOVED,
  ALLOW_ALL,
  NOT_FOUND_ROBOTS,
  EN_PAGE,
  UK_PAGE,
  SELF_ALTERNATE_PAGE,
  QUERY_SWITCH_PAGE,
  DE_PAGE,
  CROSS_ORIGIN_PAGE,
  SCRIPTED_PICKER_PAGE,
  NOT_FOUND_PAGE,
  TWO_CROSS_TARGETS_PAGE,
} from './node.test-utils';

describe('collectNetwork', () => {
  describe('declared-target expansion', () => {
    const ROUTES = {
      [HOME]: { status: 200, body: EN_PAGE },
      [UK]: { status: 200, body: UK_PAGE },
      [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
    };

    it('follows only what the markup declares, and grants traversal', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed(ROUTES),
      });
      expect(evidence.pages.map((page) => page.url)).toContain(UK);
      expect(evidence.pages.some((page) => page.reach === 'declared-target')).toBe(true);
      expect(deriveCapabilities(evidence).has('traversal')).toBe(true);
    });

    it('honours robots.txt for expansion', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed({
          ...ROUTES,
          [HOME_ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: /uk' },
        }),
      });
      expect(evidence.pages.map((page) => page.url)).not.toContain(UK);
      expect(networkSource(evidence).robots).toBe('honoured');
    });

    /**
     * `Disallow: /*?` is the idiom for "do not crawl query strings", and RFC
     * 9309 §2.2.2 matches a rule against the path **and** the query. Matching
     * the pattern is not enough on its own: this call site used to hand
     * `robots.allows` a bare `URL.pathname`, so the `?` the rule turns on was
     * never in the string being matched and the rule could not fire on any real
     * declared target — which is exactly the shape a query-parameter language
     * switch takes. Asserted end to end, at the expansion, because the matcher
     * already read the pattern correctly; the call site was throwing the query
     * away before it got there.
     */
    it('withholds a query-carrying declared target under Disallow: /*?', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed({
          [HOME]: { status: 200, body: QUERY_SWITCH_PAGE },
          [QUERY_UK]: { status: 200, body: UK_PAGE },
          [DE]: { status: 200, body: DE_PAGE },
          [HOME_ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: /*?' },
        }),
      });

      // Withheld means the request was never made — not a page dropped after
      // fetching it, which would already have been the access robots.txt refused.
      expect(networkSource(evidence).probes.map((probe) => probe.url)).not.toContain(QUERY_UK);
      expect(evidence.pages.map((page) => page.url)).not.toContain(QUERY_UK);
      // And only what the pattern names: the query-free sibling is still followed.
      expect(evidence.pages.map((page) => page.url)).toContain(DE);
    });

    /**
     * A declared alternate on another origin is the standard cross-domain locale
     * pattern (`brand.de` / `brand.pl` / `brand.ua`), and `robots.txt` is a
     * per-origin document: `example.com`'s copy has no authority over
     * `example.de`. Applying the typed URL's rules to every target withheld a
     * target its own origin permits, and the page set's gap then published
     * `core/hreflang-target-unresolvable` as a `fail` — a false accusation about
     * a named company, which `docs/movar-audit.md` calls the one failure mode
     * that ends the product.
     */
    it('follows a cross-origin target its own origin permits', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed({
          [HOME]: { status: 200, body: CROSS_ORIGIN_PAGE },
          [CROSS_DE]: { status: 200, body: DE_PAGE },
          [HOME_ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: /de' },
          [CROSS_ROBOTS]: { status: 200, body: ALLOW_ALL },
        }),
      });

      expect(evidence.pages.map((page) => page.url)).toContain(CROSS_DE);
      expect(
        ruleResult(evaluate(evidence, CORE_RULESET), 'core/hreflang-target-unresolvable').verdict,
      ).toBe('pass');
    });

    /**
     * The other half of the same defect: the second origin's `robots.txt` was
     * never requested at all, so this module's claim to honour `robots.txt` for
     * declared-target expansion was true only of the first origin.
     */
    it("requests each origin's own robots.txt", async () => {
      const fetched: string[] = [];
      await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: CROSS_ORIGIN_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
            [CROSS_ROBOTS]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });

      expect(fetched).toContain(HOME_ROBOTS);
      expect(fetched).toContain(CROSS_ROBOTS);
    });

    /** And the rules that are read are that origin's own, refusals included. */
    it('withholds a cross-origin target its own origin disallows', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed({
          [HOME]: { status: 200, body: CROSS_ORIGIN_PAGE },
          [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
          [CROSS_ROBOTS]: { status: 200, body: 'User-agent: *\nDisallow: /de' },
        }),
      });

      expect(networkSource(evidence).probes.map((probe) => probe.url)).not.toContain(CROSS_DE);
      expect(networkSource(evidence).robots).toBe('honoured');
    });

    /**
     * N targets on one origin cost one `robots.txt`. Cached whatever the answer
     * was: `example.de`'s is unreachable here, and asking again per target would
     * spend the budget on a request already known to fail.
     */
    it('fetches an origin robots.txt once, even when it is unreachable', async () => {
      const fetched: string[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: TWO_CROSS_TARGETS_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [CROSS_AT]: { status: 200, body: DE_PAGE },
            [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });

      expect(fetched.filter((url) => url === CROSS_ROBOTS)).toHaveLength(1);
      // An unfetchable robots.txt stays permissive, as it always has.
      expect(evidence.pages.map((page) => page.url)).toEqual(
        expect.arrayContaining([CROSS_DE, CROSS_AT]),
      );
    });

    /**
     * Rules come from a `robots.txt` the origin actually served, never from the
     * error page it answered with instead.
     *
     * `example.de` answers `404` here, which under RFC 9309 §2.3.1.3 means it
     * published no rules at all — but the body it answers with is an HTML
     * template, and parsing that asked a "not found" page which paths this
     * crawler may fetch. Its `Disallow: /at/` withheld `example.de/at/`, and a
     * withheld target is not a silence: `core/hreflang-target-unresolvable`
     * publishes it as `fail` — "cannot be reached" — about a page `example.de`
     * serves perfectly well and never asked anyone to leave alone. Same shape
     * as reading the typed URL's robots.txt over another origin, arriving by
     * way of the error template.
     */
    it('reads no rules out of a robots.txt that 404s', async () => {
      const fetched: string[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: TWO_CROSS_TARGETS_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [CROSS_AT]: { status: 200, body: DE_PAGE },
            [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
            [CROSS_ROBOTS]: { status: 404, body: NOT_FOUND_ROBOTS },
          }),
        ),
      });

      // The permission slip was asked for and paid for — it just published
      // nothing, which is the permissive answer an unreadable one has always got.
      expect(fetched).toContain(CROSS_ROBOTS);
      expect(evidence.pages.map((page) => page.url)).toEqual(
        expect.arrayContaining([CROSS_DE, CROSS_AT]),
      );
      expect(
        ruleResult(evaluate(evidence, CORE_RULESET), 'core/hreflang-target-unresolvable').verdict,
      ).toBe('pass');
    });

    /**
     * A picker entry can declare a target with no origin to ask — the
     * `javascript:` href is the common one. There is no `robots.txt` for an
     * opaque origin, so none is invented: asking would spend a request on a URL
     * that cannot exist, and the target is left exactly as it was.
     */
    it('asks no robots.txt for a target with no fetchable origin', async () => {
      const fetched: string[] = [];
      await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: SCRIPTED_PICKER_PAGE },
            [UK]: { status: 200, body: UK_PAGE },
            [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });

      expect(fetched).toContain('javascript:void(0)');
      expect(fetched.filter((url) => url.endsWith('/robots.txt'))).toEqual([HOME_ROBOTS]);
    });

    /**
     * The per-origin fetch is a real request against the same hard budget, and
     * nothing is held back for it. A budget with one request left and an
     * unresolved origin cannot buy both the permission and the page, so it buys
     * the permission and the run ends at its ceiling rather than throwing.
     *
     * Every budget case in this file adjudicates the ruleset, not just the
     * fetch log: a reserve that withholds a target is invisible in a request
     * list and reads as a `fail` naming the site in the report. Here nothing
     * was reached as a declared target at all, so the traversal rule is
     * `not-collected` — the audit says what it did not fetch instead of
     * accusing `example.de` of not serving it.
     */
    it('spends its last request asking permission rather than leaving it unspent', async () => {
      const fetched: string[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        budget: 2,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: TWO_CROSS_TARGETS_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [CROSS_ROBOTS]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });

      expect(fetched).toEqual([HOME, CROSS_ROBOTS]);
      expect(evidence.pages).toHaveLength(1);
      expect(
        ruleResult(evaluate(evidence, CORE_RULESET), 'core/hreflang-target-unresolvable').verdict,
      ).toBe('not-collected');
    });

    /**
     * A `robots.txt` that redirects is ordinary — `http`→`https`, `www`→apex,
     * CDN normalisation — and `probe` spends a request per **hop**, so a
     * reserve of two never bought "robots.txt plus target" at all. It bought
     * two hops, and the probe behind it walked into
     * `RequestBudgetExhaustedError` out of `collectNetwork`: a run that
     * completes on `main` throwing instead of reporting what it collected. No
     * fixed reserve can be right here, because the hop count is not knowable
     * before the fetch — the ceiling is re-read after the gate instead.
     */
    it('survives a robots.txt that redirects into the last of the budget', async () => {
      const fetched: string[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        budget: 3,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: TWO_CROSS_TARGETS_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [CROSS_ROBOTS]: { status: 301, headers: { location: CROSS_ROBOTS_MOVED } },
            [CROSS_ROBOTS_MOVED]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });

      expect(fetched).toEqual([HOME, CROSS_ROBOTS, CROSS_ROBOTS_MOVED]);
      expect(evidence.pages.map((page) => page.url)).toEqual([HOME]);
      expect(
        ruleResult(evaluate(evidence, CORE_RULESET), 'core/hreflang-target-unresolvable').verdict,
      ).toBe('not-collected');
    });

    /**
     * One request more than the permission slip, and it buys the page too.
     *
     * The second target is withheld for budget, and this is what that costs in
     * the report: `core/hreflang-target-unresolvable` reads `fail` about
     * `example.de/at/`, which `example.de` serves and its own `robots.txt`
     * permits. The collector's restraint is attributed to the site, because
     * `Evidence` carries no record that a target was withheld — a defect that
     * predates per-origin resolution (it reproduces on `main` with a
     * same-origin alternate under `Disallow:`) and needs an evidence-schema
     * change to close. Pinned here so the cost is visible in the suite rather
     * than discovered in a report about a real company.
     */
    it('spends the budget on a robots.txt and the target it authorizes', async () => {
      const fetched: string[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        budget: 3,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: TWO_CROSS_TARGETS_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [CROSS_ROBOTS]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });

      expect(fetched).toEqual([HOME, CROSS_ROBOTS, CROSS_DE]);
      const result = ruleResult(
        evaluate(evidence, CORE_RULESET),
        'core/hreflang-target-unresolvable',
      );
      expect(result.verdict).toBe('fail');
      expect(result.findings.map((finding) => finding.summary).join('\n')).toContain(CROSS_AT);
    });

    /**
     * The reserve's own failure mode, and the reason it could not stay: it
     * refused a target the budget could pay for. `main` collects
     * `https://example.de/de/` here and publishes `pass`; the reserve dropped
     * it, left a request unspent, and published
     *
     * > The hreflang="de" target "https://example.de/de/" is absent from the
     * > collected page set, so the declared alternate cannot be reached.
     *
     * about a site that permits and serves that page — the same false
     * accusation about a named company that per-origin resolution exists to
     * kill, re-created on the budget path. A scarce budget now buys the pages
     * the audit does not already hold first, so the ubiquitous self-referential
     * alternate no longer crowds out the cross-origin one behind it.
     */
    it('buys the cross-origin page before re-fetching one it already holds', async () => {
      const fetched: string[] = [];
      const prober = createProber({
        vantage: LOCAL_VANTAGE,
        budget: 4,
        fetchImpl: recording(
          fetched,
          routed({
            [HOME]: { status: 200, body: CROSS_ORIGIN_PAGE },
            [CROSS_DE]: { status: 200, body: DE_PAGE },
            [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
            [CROSS_ROBOTS]: { status: 200, body: ALLOW_ALL },
          }),
        ),
      });
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        prober,
      });

      // The cross-origin alternate is bought first; the self-referential one,
      // whose page the matrix already collected, takes what is left.
      expect(fetched).toEqual([HOME, CROSS_ROBOTS, CROSS_DE, HOME_ROBOTS]);
      expect(evidence.pages.map((page) => page.url)).toContain(CROSS_DE);
      expect(
        ruleResult(evaluate(evidence, CORE_RULESET), 'core/hreflang-target-unresolvable').verdict,
      ).toBe('pass');
      // And the ceiling is reached, not skirted: no request goes unspent while
      // a target the budget could have bought is being withheld.
      expect(prober.remaining()).toBe(0);
    });

    it('records an explicit ignore-robots posture', async () => {
      const fetched: string[] = [];
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        ignoreRobots: true,
        fetchImpl: recording(fetched, routed(ROUTES)),
      });
      expect(networkSource(evidence).robots).toBe('ignored');
      // And asks no origin at all for rules it has been told to ignore.
      expect(fetched.filter((url) => url.endsWith('/robots.txt'))).toEqual([]);
    });

    /**
     * The ubiquitous self-referential alternate — a page whose only declared
     * target is itself. The probe fetches it and the page set dedupes it onto
     * the page the matrix already collected, so the collector followed every
     * declared target and reached it. `reach` has to say so: it records how the
     * audit got to a page, and this one was got to both ways.
     */
    it('upgrades reach when a declared target lands on an already-collected page', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        ignoreRobots: true,
        fetchImpl: routed({ [HOME]: { status: 200, body: SELF_ALTERNATE_PAGE } }),
      });

      expect(evidence.pages).toHaveLength(1);
      expect(firstPage(evidence).reach).toBe('declared-target');
      expect(deriveCapabilities(evidence).has('traversal')).toBe(true);
    });

    /**
     * The defect this pins is a report, not a field: every traversal rule read
     * `not-collected` on a run that followed every declared target and resolved
     * all of them. `not-collected` is never `pass`, and claiming the collector
     * lacked a capability it exercised is that same dishonesty reversed.
     */
    it('adjudicates the traversal rules when the only alternate is self-referential', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        ignoreRobots: true,
        fetchImpl: routed({ [HOME]: { status: 200, body: SELF_ALTERNATE_PAGE } }),
      });

      const result = ruleResult(
        evaluate(evidence, CORE_RULESET),
        'core/hreflang-target-unresolvable',
      );
      expect(result.verdict).toBe('pass');
      expect(result.missingCapabilities).toBeUndefined();
    });

    /**
     * The other half of the same honesty: an upgrade must record a target the
     * collector actually reached. The declared-target probe fails here, so
     * nothing was reached that way and `traversal` must stay withheld — the
     * fix must not overshoot into granting it off the dedupe alone.
     */
    it('withholds traversal when the declared-target probe never landed', async () => {
      let fetched = 0;
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        ignoreRobots: true,
        fetchImpl: async (url, init) => {
          fetched += 1;
          if (fetched > 1) throw new Error('connection reset');
          return routed({ [HOME]: { status: 200, body: SELF_ALTERNATE_PAGE } })(url, init);
        },
      });

      expect(evidence.pages).toHaveLength(1);
      expect(firstPage(evidence).reach).toBe('requested');
      expect(deriveCapabilities(evidence).has('traversal')).toBe(false);
      expect(
        ruleResult(evaluate(evidence, CORE_RULESET), 'core/hreflang-target-unresolvable').verdict,
      ).toBe('not-collected');
    });

    /**
     * A declared target that 404s is a target the site does not serve, and the
     * error document it answers with is not a version of the page.
     *
     * Digesting it made the 404 stub a real `declared-target` page, and every
     * traversal rule then read the stub as the site's Ukrainian version:
     * `core/hreflang-target-unresolvable` resolved the alternate to it and
     * published `pass` — "not-collected is never pass", inverted, since the
     * page it passed on was never collected — while
     * `core/hreflang-target-wrong-language` read the error template's
     * `<html lang="en">` and published a `fail` attributing English to a
     * Ukrainian version the site never served. That second one is a false
     * accusation about a named company, built entirely out of a page the site
     * told us was not there.
     */
    it('never digests an error document into a page', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        ignoreRobots: true,
        fetchImpl: routed({
          [HOME]: { status: 200, body: EN_PAGE },
          [UK]: { status: 404, body: NOT_FOUND_PAGE },
        }),
      });

      expect(evidence.pages.map((page) => page.url)).toEqual([HOME]);
      // The observation itself is kept in full: the audit fetched the target,
      // and what it saw — a 404 — is the finding's evidence, not a gap in it.
      const target = networkSource(evidence).probes.find((probe) => probe.url === UK);
      expect(target?.status).toBe(404);
      expect(target?.pageId).toBeUndefined();
      // The self-referential `en` alternate still resolves, so the collector
      // did reach a declared target and the traversal rules stay adjudicated.
      expect(deriveCapabilities(evidence).has('traversal')).toBe(true);

      const report = evaluate(evidence, CORE_RULESET);
      const unresolvable = ruleResult(report, 'core/hreflang-target-unresolvable');
      expect(unresolvable.verdict).toBe('fail');
      expect(unresolvable.findings.map((finding) => finding.summary).join('\n')).toContain(
        'returned a 404 response',
      );
      // And nothing is adjudicated about a version the site never served. Both
      // of these read the 404 stub as that version before: the first published
      // a `fail` quoting its English `lang`, and the second one saying the
      // switch serves English again. `core/switch-no-effect` is left with no
      // cross-language target that resolves, which is not a `pass` and does
      // not pretend to be one.
      expect(ruleResult(report, 'core/hreflang-target-wrong-language').verdict).toBe('pass');
      expect(ruleResult(report, 'core/switch-no-effect').verdict).toBe('not-applicable');
    });
  });
});
