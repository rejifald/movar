import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import {
  collectFilesystem,
  collectNetwork,
  createPageSet,
  createProber,
  LOCAL_VANTAGE,
  parseLinkHeader,
} from './node';
import { digestDocument, MAX_TEXT_NODE_SAMPLES } from './digest';
import type { FetchLike, FetchLikeResponse } from './probe';
import { deriveCapabilities } from '../capability';
import type { Evidence, NetworkSource, PageEvidence } from '../evidence';
import { evaluate } from '../evaluate';
import type { Report, RuleResult } from '../report';
import { CORE_RULESET } from '../ruleset';
import { textNodeDenominator } from '../text-samples';

/** Narrow to the network branch, so assertions never sit inside a conditional. */
function networkSource(evidence: Evidence): NetworkSource {
  if (evidence.source.kind !== 'network') throw new Error('expected network evidence');
  return evidence.source;
}

/** The first collected page, so assertions never sit inside an optional chain. */
function firstPage(evidence: Evidence): PageEvidence {
  const page = evidence.pages[0];
  if (page === undefined) throw new Error('expected at least one collected page');
  return page;
}

/** One rule's result, so a renamed rule fails loudly rather than asserting on nothing. */
function ruleResult(report: Report, rule: string): RuleResult {
  const result = report.results.find((candidate) => candidate.rule === rule);
  if (result === undefined) throw new Error(`expected ${rule} in the report`);
  return result;
}

interface Stub {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

async function tick(): Promise<void> {
  await Promise.resolve();
}

function respond(stub: Stub): FetchLikeResponse {
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

/** Routes keyed by `${acceptLanguage ?? '-'} ${url}`, falling back to url alone. */
function routed(routes: Readonly<Record<string, Stub>>): FetchLike {
  return async (url, init) => {
    await tick();
    const lang = init.headers['accept-language'] ?? '-';
    const stub = routes[`${lang} ${url}`] ?? routes[url];
    if (stub === undefined) throw new Error(`unstubbed ${lang} ${url}`);
    return respond(stub);
  };
}

/** Wraps a `FetchLike` to record every URL asked for, in order. */
function recording(log: string[], inner: FetchLike): FetchLike {
  return async (url, init) => {
    log.push(url);
    return inner(url, init);
  };
}

const HOME = 'https://example.com/';
const UK = 'https://example.com/uk/';
const DE = 'https://example.com/de/';
/** A language switch carried entirely in the query — `?lang=`, `?hl=`, `?locale=`. */
const QUERY_UK = 'https://example.com/?lang=uk';
const HOME_ROBOTS = 'https://example.com/robots.txt';
/** The cross-domain locale pattern: `brand.de` beside `brand.com`, its own origin. */
const CROSS_DE = 'https://example.de/de/';
const CROSS_AT = 'https://example.de/at/';
const CROSS_ROBOTS = 'https://example.de/robots.txt';
/** Where a redirecting `robots.txt` lands — `http`→`https`, `www`→apex, a CDN rewrite. */
const CROSS_ROBOTS_MOVED = 'https://example.de/robots-moved.txt';
const ALLOW_ALL = 'User-agent: *\nDisallow:';
/**
 * A `robots.txt` that 404s into the site's HTML error page — with directive-
 * shaped lines in the template, which is what separates "read the rules the
 * site published" from "read whatever the error page happens to say". Contrived
 * markup, real property: a syntax example, a help page, or an echo of the
 * requested path can each put a whole `Disallow:` line in a body that is not a
 * `robots.txt` at all.
 */
const NOT_FOUND_ROBOTS =
  '<html lang="en"><body><h1>Not found</h1><pre>\nUser-agent: *\nDisallow: /at/\n</pre></body></html>';

const EN_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>english body</p></body></html>';
const UK_PAGE =
  '<html lang="uk"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>українське тіло</p></body></html>';
/** One page, one alternate, and the alternate is the page itself. Extremely common markup. */
const SELF_ALTERNATE_PAGE =
  `<html lang="en"><head><link rel="alternate" hreflang="en" href="${HOME}">` +
  '</head><body><p>english body</p></body></html>';
/**
 * One alternate switches language by query parameter and one by path. The query
 * is the whole target here — `/` and `/?lang=uk` are different pages, and only
 * the query tells them apart.
 */
const QUERY_SWITCH_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/?lang=uk">' +
  '<link rel="alternate" hreflang="de" href="/de/"></head>' +
  '<body><p>english body</p></body></html>';
const DE_PAGE = '<html lang="de"><head></head><body><p>deutscher fließtext</p></body></html>';
/** A page whose German alternate lives on another origin — `brand.de` beside `brand.com`. */
const CROSS_ORIGIN_PAGE =
  `<html lang="en"><head><link rel="alternate" hreflang="en" href="${HOME}">` +
  `<link rel="alternate" hreflang="de" href="${CROSS_DE}"></head>` +
  '<body><p>english body</p></body></html>';
/** A picker whose German entry navigates by script, so its target has no origin. */
const SCRIPTED_PICKER_PAGE =
  '<html lang="en"><head></head><body><nav><ul>' +
  '<li><a href="javascript:void(0)" hreflang="de">Deutsch</a></li>' +
  '<li><a href="/uk/" hreflang="uk">Українська</a></li>' +
  '</ul></nav><p>english body</p></body></html>';
/**
 * An ordinary HTML error document. The site answered — that is why it is not a
 * transport error and not a challenge — and what it answered is that the page
 * is not there. Its `<html lang>` belongs to the error template, never to the
 * version the declaring page said would be here.
 */
const NOT_FOUND_PAGE =
  '<html lang="en"><head><title>Not found</title></head>' +
  '<body><p>that page does not exist</p></body></html>';
/** Two alternates on the same second origin, so one robots.txt covers both. */
const TWO_CROSS_TARGETS_PAGE =
  `<html lang="en"><head><link rel="alternate" hreflang="de" href="${CROSS_DE}">` +
  `<link rel="alternate" hreflang="de-AT" href="${CROSS_AT}"></head>` +
  '<body><p>english body</p></body></html>';

describe('collectNetwork', () => {
  it('varies only Accept-Language across the matrix legs', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null, 'uk', 'en'],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
      now: '2026-01-01T00:00:00.000Z',
    });

    const { probes } = networkSource(evidence);
    expect(probes.map((p) => p.acceptLanguage)).toEqual([null, 'uk', 'en']);
    // One vantage, one cookie state, one URL — so the legs are comparable.
    expect(new Set(probes.map((p) => p.vantage.id)).size).toBe(1);
    expect(new Set(probes.map((p) => p.cookieState))).toEqual(new Set(['cold']));
    expect(deriveCapabilities(evidence).has('matrix')).toBe(true);
  });

  /**
   * Without this the serving rules cannot answer "what language did this
   * response serve?" and silently degrade to `not-applicable`.
   */
  it('links every probe to the page its body produced', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null, 'uk'],
      fetchImpl: routed({
        [HOME]: { status: 200, body: EN_PAGE },
        [`uk ${HOME}`]: { status: 302, headers: { location: UK } },
        [UK]: { status: 200, body: UK_PAGE },
      }),
    });

    const { probes } = networkSource(evidence);
    expect(probes.every((p) => p.pageId !== undefined)).toBe(true);
    const byId = new Map(evidence.pages.map((page) => [page.id, page]));
    expect(byId.get(probes[0]?.pageId ?? '')?.document.htmlLang).toBe('en');
    expect(byId.get(probes[1]?.pageId ?? '')?.document.htmlLang).toBe('uk');
  });

  /** The leg's page is the chain's destination, not the redirect stub. */
  it('digests the page a redirect landed on', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: ['uk'],
      fetchImpl: routed({
        [`uk ${HOME}`]: { status: 302, headers: { location: UK } },
        [UK]: { status: 200, body: UK_PAGE },
      }),
    });
    expect(evidence.pages).toHaveLength(1);
    expect(evidence.pages[0]?.url).toBe(UK);
    expect(evidence.pages[0]?.document.htmlLang).toBe('uk');
  });

  /**
   * Content negotiation at one URL is the case the response matrix exists for:
   * the site answers `/` with Ukrainian or English depending on the header,
   * never redirecting. Keying pages by URL alone collapsed those legs onto the
   * first one's document, so every serving rule read the wrong language — and
   * movar.fyi hid it, because its uk leg happens to redirect to a distinct URL.
   */
  it('keeps legs apart when one URL serves different bodies per header', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: ['en', 'uk'],
      fetchImpl: routed({
        [`en ${HOME}`]: { status: 200, body: EN_PAGE },
        [`uk ${HOME}`]: { status: 200, body: UK_PAGE },
      }),
    });

    expect(evidence.pages).toHaveLength(2);
    const { probes } = networkSource(evidence);
    const byId = new Map(evidence.pages.map((page) => [page.id, page]));
    expect(byId.get(probes[0]?.pageId ?? '')?.document.htmlLang).toBe('en');
    expect(byId.get(probes[1]?.pageId ?? '')?.document.htmlLang).toBe('uk');
  });

  it('does not collect a page twice when legs agree', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null, 'en', 'de'],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    expect(evidence.pages).toHaveLength(1);
  });

  it('marks a filesystem-free run as network evidence with a local vantage', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    const source = networkSource(evidence);
    expect(source.vantage).toEqual(LOCAL_VANTAGE);
    expect(source.robots).toBe('not-applicable');
  });

  it('never adjudicates a blocked interstitial into a page', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null],
      fetchImpl: routed({
        [HOME]: { status: 200, body: '<html lang="en"><title>Just a moment...</title>' },
      }),
    });
    expect(evidence.pages).toHaveLength(0);
    const { probes } = networkSource(evidence);
    expect(probes[0]?.outcome).toBe('blocked');
    // A blocked probe is dropped before any rule sees it.
    expect(deriveCapabilities(evidence).has('http')).toBe(false);
  });

  it('stops at the request budget instead of running past it', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null, 'uk', 'en', 'de'],
      budget: 2,
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    const { probes } = networkSource(evidence);
    expect(probes).toHaveLength(2);
  });

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

  /**
   * The pathological chain, end to end — collector to verdict.
   *
   * `probe.ts` walks a chain hop by hop precisely because `core/switch-bounces`
   * is adjudicated entirely from what that walk records. A chain past the hop
   * ceiling used to leave the walk as `response: null`, which `resolveOutcome`
   * called `error` and `adjudicableProbes` dropped: eleven requests spent
   * against a live site, and the rule this product exists for read `pass` off
   * the one declared target that behaved, with no trace of the one that did
   * not. Asserted through `CORE_RULESET` rather than at the probe, because a
   * probe-level assertion passes while the chain still never reaches a rule.
   */
  describe('a chain longer than the hop ceiling', () => {
    const RU_DRILL = 'https://example.com/ru/drill';
    const UK_DRILL = 'https://example.com/uk/drill';
    const EN_DRILL = 'https://example.com/en/drill';
    /** `hop <= maxHops` runs the loop `maxHops + 1` times, so eleven are recorded. */
    const RECORDED_HOPS = 11;

    const RU_DRILL_PAGE =
      '<html lang="ru"><head><link rel="alternate" hreflang="uk" href="/uk/drill">' +
      '<link rel="alternate" hreflang="en" href="/en/drill"></head>' +
      '<body><p>Дрель ударная</p></body></html>';
    const EN_DRILL_PAGE =
      '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/drill">' +
      '<link rel="alternate" hreflang="en" href="/en/drill"></head>' +
      '<body><p>impact drill</p></body></html>';

    /** Each hop a URL never seen before, so only the ceiling ends the walk. */
    function endlessHops(): Record<string, Stub> {
      const routes: Record<string, Stub> = {};
      for (let n = 0; n <= RECORDED_HOPS; n += 1) {
        const from = n === 0 ? UK_DRILL : `${UK_DRILL}/${n}`;
        routes[from] = { status: 301, headers: { location: `/uk/drill/${n + 1}` } };
      }
      return routes;
    }

    async function collectDrill(): Promise<Evidence> {
      return collectNetwork({
        url: RU_DRILL,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed({
          [RU_DRILL]: { status: 200, body: RU_DRILL_PAGE },
          [EN_DRILL]: { status: 200, body: EN_DRILL_PAGE },
          'https://example.com/robots.txt': { status: 200, body: ALLOW_ALL },
          ...endlessHops(),
        }),
      });
    }

    it('records the whole chain and says it never reached the end', async () => {
      const evidence = await collectDrill();
      const probe = networkSource(evidence).probes.find((entry) => entry.url === UK_DRILL);

      expect(probe?.outcome).toBe('ok');
      expect(probe?.redirectChain).toHaveLength(RECORDED_HOPS);
      expect(probe?.redirectChainTruncated).toBe(true);
      // No body, so no page — a target the collector never reached still
      // withholds `traversal`, which the resolved `en` alternate supplies.
      expect(evidence.pages.map((page) => page.url)).toEqual([RU_DRILL, EN_DRILL]);
      expect(deriveCapabilities(evidence).has('traversal')).toBe(true);
    });

    it('hands core/switch-bounces the chain instead of a silent pass', async () => {
      const evidence = await collectDrill();
      const probe = networkSource(evidence).probes.find((entry) => entry.url === UK_DRILL);
      const result = ruleResult(evaluate(evidence, CORE_RULESET), 'core/switch-bounces');

      expect(result.verdict).toBe('warn');
      // Both collected pages declare the same broken `uk` alternate, so both
      // report it — reciprocal alternates are what correct markup looks like.
      expect(result.findings.map((finding) => finding.subject.url)).toEqual([RU_DRILL, EN_DRILL]);
      for (const finding of result.findings) {
        expect(finding.grounding).toBe('observed');
        expect(finding.evidence).toContainEqual({ kind: 'redirect-chain', probeId: probe?.id });
        expect(finding.summary).toContain('11 redirects');
        // The collector stopped one hop short of wherever this ends, so the
        // finding must not describe a landing it never saw.
        expect(finding.summary).not.toMatch(/lands on/u);
      }
    });

    /**
     * Seeing the chain is the point; turning the report green is not. The `uk`
     * alternate is genuinely absent from the collected page set, and that
     * `fail` is the honest reading of a target eleven redirects never served.
     */
    it('leaves core/hreflang-target-unresolvable failing on the same target', async () => {
      const evidence = await collectDrill();
      const result = ruleResult(
        evaluate(evidence, CORE_RULESET),
        'core/hreflang-target-unresolvable',
      );

      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/hreflang="uk".*cannot be reached/u);
    });
  });
});

describe('createPageSet', () => {
  /**
   * `reach` only ever climbs. The Node collector runs the matrix before the
   * expansion, but `PageSet` is exported and a collector that interleaves them
   * must not have a later no-preference leg erase a target it did follow.
   */
  it('never downgrades a declared-target page back to requested', () => {
    const pages = createPageSet(digestDocument);
    const input = { url: HOME, body: SELF_ALTERNATE_PAGE, status: 200, identity: 'sha-1' };

    const first = pages.add({ ...input, reach: 'declared-target' });
    const second = pages.add({ ...input, reach: 'requested' });

    expect(second).toBe(first);
    expect(pages.pages()).toHaveLength(1);
    expect(pages.pages()[0]?.reach).toBe('declared-target');
  });

  /**
   * The refusal lives here, not in each collector, so a runtime that assembles
   * its own probes — the Safari host app today, the Android port next — cannot
   * ship the same defect by forgetting to ask. Asserted at this seam as well as
   * end to end, because the collector test only covers the one caller.
   */
  it('refuses a body served with a status outside 2xx', () => {
    const pages = createPageSet(digestDocument);
    const input = { url: UK, body: NOT_FOUND_PAGE, identity: 'sha-1' } as const;
    const asDeclaredTarget = { ...input, reach: 'declared-target' } as const;

    expect(pages.add({ ...asDeclaredTarget, status: 404 })).toBeNull();
    expect(pages.add({ ...asDeclaredTarget, status: 500 })).toBeNull();
    expect(pages.pages()).toEqual([]);
    // And nothing about the refusal is remembered: the same bytes served with a
    // status that means "here is the page" are still a page.
    expect(pages.add({ ...asDeclaredTarget, status: 200 })).toBe('page-1');
  });
});

/** A two-locale build on disk, for the filesystem collector. */
async function buildSite(): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-audit-'));
  await writeFile(nodePath.join(root, 'index.html'), EN_PAGE, 'utf8');
  await mkdir(nodePath.join(root, 'uk'), { recursive: true });
  await writeFile(nodePath.join(root, 'uk', 'index.html'), UK_PAGE, 'utf8');
  return root;
}

describe('parseLinkHeader', () => {
  it('reads alternates out of a Link header', () => {
    const found = parseLinkHeader('<https://example.com/uk/>; rel="alternate"; hreflang="uk"');
    expect(found).toEqual([{ hreflang: 'uk', href: 'https://example.com/uk/', source: 'header' }]);
  });

  it('keeps a comma inside a URL from splitting one part in two', () => {
    const found = parseLinkHeader(
      '<https://example.com/a,b>; rel="alternate"; hreflang="uk", <https://example.com/en/>; rel="alternate"; hreflang="en"',
    );
    expect(found).toHaveLength(2);
    expect(found[0]?.href).toBe('https://example.com/a,b');
  });

  it('ignores a non-alternate link', () => {
    expect(parseLinkHeader('<https://example.com/style.css>; rel="preload"')).toEqual([]);
  });

  it('is empty for an absent header', () => {
    expect(parseLinkHeader('')).toEqual([]);
  });
});

describe('collectFilesystem', () => {
  it('reads a built dist into pages addressed as the site would', async () => {
    const evidence = await collectFilesystem({ root: await buildSite() });
    const paths = evidence.pages.map((page) => page.path ?? '');
    expect(paths.toSorted((one, other) => one.localeCompare(other))).toEqual([
      '/index.html',
      '/uk/index.html',
    ]);
    expect(evidence.pages.every((page) => page.url === undefined)).toBe(true);
  });

  /**
   * A filesystem has no network location, so matrix rules must be structurally
   * `not-collected` rather than quietly passing.
   */
  it('carries no vantage and no probes, so matrix rules cannot run', async () => {
    const evidence = await collectFilesystem({ root: await buildSite() });
    expect(evidence.source.kind).toBe('filesystem');
    const capabilities = deriveCapabilities(evidence);
    expect(capabilities.has('static')).toBe(true);
    expect(capabilities.has('site')).toBe(true);
    // Free on a build: the next file is right there.
    expect(capabilities.has('traversal')).toBe(true);
    expect(capabilities.has('http')).toBe(false);
    expect(capabilities.has('matrix')).toBe(false);
    expect(capabilities.has('multi-vantage')).toBe(false);
  });

  it('caps how many pages a huge build contributes', async () => {
    const evidence = await collectFilesystem({ root: await buildSite(), maxPages: 1 });
    expect(evidence.pages).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The sampling report, carried across the collector boundary                  */
/* -------------------------------------------------------------------------- */

/** More eligible text nodes than the cap admits — the issue's own repro size. */
const CAPPED_PAGE_NODES = 4000;

/**
 * Slow by construction, so it gets its own timeout — the same argument as the
 * cap test in `digest.test.ts`. Proving the cap is *carried* needs a page that
 * actually exceeds it, and v8 coverage instrumentation on a shared CI runner
 * pushes that past vitest's 5s default.
 */
const CAP_TEST_TIMEOUT_MS = 30_000;

/** A body with `count` eligible text nodes and no whitespace-only ones. */
function manyTextNodes(count: number): string {
  const paragraphs = Array.from({ length: count }, (_, index) => `<p>текст ${index}</p>`).join('');
  return `<html lang="uk"><body>${paragraphs}</body></html>`;
}

async function buildCappedPage(): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-audit-capped-'));
  await writeFile(nodePath.join(root, 'index.html'), manyTextNodes(CAPPED_PAGE_NODES), 'utf8');
  return root;
}

describe('text sampling', () => {
  /**
   * The digest has always known the cap bit; the collectors used to drop the
   * report on the floor, so `Evidence` could not tell a 1500-node page from a
   * truncated 4000-node one. Every classified denominator then quoted 1500 and
   * inflated the share it published by 2.7×.
   */
  it(
    'carries the true examined count out of the filesystem collector',
    async () => {
      const page = firstPage(await collectFilesystem({ root: await buildCappedPage() }));

      expect(page.document.textNodes).toHaveLength(MAX_TEXT_NODE_SAMPLES);
      expect(page.document.textSampling).toEqual({
        examined: CAPPED_PAGE_NODES,
        sampled: MAX_TEXT_NODE_SAMPLES,
        cappedAt: MAX_TEXT_NODE_SAMPLES,
      });
    },
    CAP_TEST_TIMEOUT_MS,
  );

  /** "3 of 4000 text nodes" is the finding; "3 of 1500" is the smear. */
  it(
    'makes the published denominator quote what was examined, not what survived',
    async () => {
      const page = firstPage(await collectFilesystem({ root: await buildCappedPage() }));

      expect(textNodeDenominator(page, 3)).toEqual({ examined: CAPPED_PAGE_NODES, matched: 3 });
    },
    CAP_TEST_TIMEOUT_MS,
  );

  it('carries the counts out of the network collector too', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    const page = firstPage(evidence);

    expect(page.document.textSampling).toEqual({
      examined: page.document.textNodes.length,
      sampled: page.document.textNodes.length,
    });
    // Nothing was dropped, so nothing claims it was.
    expect(page.document.textSampling?.cappedAt).toBeUndefined();
  });

  /** Evidence is a stored, replayable bundle — the counts must survive JSON. */
  it('survives serialization, so a stored bundle replays with the same denominator', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    const stored = JSON.stringify(evidence);
    const replayed = JSON.parse(stored) as Evidence;

    expect(firstPage(replayed).document.textSampling).toEqual(
      firstPage(evidence).document.textSampling,
    );
  });

  /**
   * A stored `schemaVersion` 2 bundle carries no counts at all. The denominator
   * falls back to what it can see rather than reporting zero examined nodes —
   * an empty denominator would read as a far worse claim than a modest one.
   */
  it('falls back to the sampled count on a bundle collected before the field existed', () => {
    const legacy: PageEvidence = {
      id: 'page-1',
      url: HOME,
      reach: 'requested',
      rendered: false,
      document: {
        htmlLang: 'uk',
        langAttributes: [],
        alternates: [],
        picker: null,
        links: [],
        textNodes: [{ nodePath: 'body > p', text: 'текст', inheritedLang: null }],
      },
    };

    expect(textNodeDenominator(legacy, 1)).toEqual({ examined: 1, matched: 1 });
  });
});

/**
 * A `lang="uk"` page whose head declares no `<title>` and whose body carries an
 * icon with an English accessible name. Long enough to clear the classifier's
 * reportable gate, which is what makes the old behaviour a published finding
 * rather than a near miss.
 */
const ICON_TITLE_PAGE =
  '<html lang="uk"><head><meta name="description" content="Найкращі товари за найкращими цінами."></head>' +
  '<body><button aria-label="Кошик"><svg viewBox="0 0 24 24">' +
  '<title>Diagram showing how our delivery network reaches every region</title></svg></button>' +
  '<main><p>Ми доставляємо замовлення по всій Україні протягом двох робочих днів.</p></main></body></html>';

/** The same page shape, with a third-party widget's `<meta>` sitting in the body. */
const BODY_META_PAGE =
  '<html lang="uk"><head><title>Магазин</title></head>' +
  '<body><div class="widget"><meta http-equiv="content-language" content="ru"></div>' +
  '<p>Ми доставляємо замовлення по всій Україні протягом двох робочих днів.</p></body></html>';

async function buildPage(html: string): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-audit-head-'));
  await writeFile(nodePath.join(root, 'index.html'), html, 'utf8');
  return root;
}

/**
 * Asserted through the ruleset, never against the digest alone: both defects
 * were one document-wide selector away from a published finding about an
 * element the head never carried, and it is the verdict — not the sample — that
 * a site owner reads.
 */
describe('the head tier reads the head', () => {
  it('does not adjudicate an icon tooltip as the page title', async () => {
    const evidence = await collectFilesystem({ root: await buildPage(ICON_TITLE_PAGE) });
    const result = ruleResult(
      evaluate(evidence, CORE_RULESET),
      'core/title-contradicts-declaration',
    );

    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toContain('no <title>');
    expect(result.findings).toEqual([]);
  });

  it("does not fail a page for a body widget's content-language", async () => {
    const evidence = await collectFilesystem({ root: await buildPage(BODY_META_PAGE) });
    const report = evaluate(evidence, CORE_RULESET);
    const result = ruleResult(report, 'core/lang-contradicts-content-language');

    expect(result.verdict).toBe('not-applicable');
    expect(result.findings).toEqual([]);
    expect(report.brokenPromises).toBe(0);
  });
});
