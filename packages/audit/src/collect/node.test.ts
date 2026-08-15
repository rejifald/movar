import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import {
  collectFilesystem,
  collectNetwork,
  createPageSet,
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

const HOME = 'https://example.com/';
const UK = 'https://example.com/uk/';
const DE = 'https://example.com/de/';
/** A language switch carried entirely in the query — `?lang=`, `?hl=`, `?locale=`. */
const QUERY_UK = 'https://example.com/?lang=uk';

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
      'https://example.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow:' },
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
          'https://example.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /uk' },
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
          'https://example.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /*?' },
        }),
      });

      // Withheld means the request was never made — not a page dropped after
      // fetching it, which would already have been the access robots.txt refused.
      expect(networkSource(evidence).probes.map((probe) => probe.url)).not.toContain(QUERY_UK);
      expect(evidence.pages.map((page) => page.url)).not.toContain(QUERY_UK);
      // And only what the pattern names: the query-free sibling is still followed.
      expect(evidence.pages.map((page) => page.url)).toContain(DE);
    });

    it('records an explicit ignore-robots posture', async () => {
      const evidence = await collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        ignoreRobots: true,
        fetchImpl: routed(ROUTES),
      });
      expect(networkSource(evidence).robots).toBe('ignored');
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
    const input = { url: HOME, body: SELF_ALTERNATE_PAGE, identity: 'sha-1' };

    const first = pages.add({ ...input, reach: 'declared-target' });
    const second = pages.add({ ...input, reach: 'requested' });

    expect(second).toBe(first);
    expect(pages.pages()).toHaveLength(1);
    expect(pages.pages()[0]?.reach).toBe('declared-target');
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
