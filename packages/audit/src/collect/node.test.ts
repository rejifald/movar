import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { collectFilesystem, collectNetwork, LOCAL_VANTAGE, parseLinkHeader } from './node';
import type { FetchLike, FetchLikeResponse } from './probe';
import { deriveCapabilities } from '../capability';
import type { Evidence, NetworkSource } from '../evidence';

/** Narrow to the network branch, so assertions never sit inside a conditional. */
function networkSource(evidence: Evidence): NetworkSource {
  if (evidence.source.kind !== 'network') throw new Error('expected network evidence');
  return evidence.source;
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

const EN_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>english body</p></body></html>';
const UK_PAGE =
  '<html lang="uk"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>українське тіло</p></body></html>';

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
