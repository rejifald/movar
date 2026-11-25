import { describe, expect, it } from 'vitest';
import {
  collectNetwork,
  createPageSet,
  documentHeadersOf,
  LOCAL_VANTAGE,
  parseLinkHeader,
} from './node';
import { digestDocument } from './digest';
import { deriveCapabilities } from '../capability';
import { makeProbe } from '../../test/fixtures';
import {
  networkSource,
  routed,
  HOME,
  UK,
  EN_PAGE,
  UK_PAGE,
  SELF_ALTERNATE_PAGE,
  NOT_FOUND_PAGE,
} from './node.test-utils';

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
    // ADR §4: no jar unless one was asked for, and the run says which it was.
    expect(source.cookies).toBe('cold');
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

/**
 * Which of a probe's two header bags describes the **document** it produced.
 *
 * The kernel adjudicates bundles from collectors it has never seen, and the
 * Safari conformer records only the first response's today — so the "a chain
 * redirected and nobody wrote down where it ended" case is a live shape, not a
 * museum piece, and it must fold in nothing rather than the redirect's.
 */
describe('documentHeadersOf', () => {
  const LINK = '<https://example.com/de/>; rel="alternate"; hreflang="de"';

  it('reads the first response’s headers when the chain never redirected', () => {
    const probe = makeProbe({ responseHeaders: { link: LINK }, redirectChain: [] });
    expect(documentHeadersOf(probe)).toEqual({ link: LINK });
  });

  it('reads the destination’s when the chain redirected', () => {
    const probe = makeProbe({
      responseHeaders: { link: LINK },
      finalResponseHeaders: { link: 'none' },
      redirectChain: [{ url: HOME, status: 302, location: UK }],
    });
    expect(documentHeadersOf(probe)).toEqual({ link: 'none' });
  });

  /** A pre-v6 bundle: the chain redirected and nobody recorded the end of it. */
  it('answers undefined rather than the redirect’s, on a bundle without them', () => {
    const probe = makeProbe({
      responseHeaders: { link: LINK },
      redirectChain: [{ url: HOME, status: 302, location: UK }],
    });
    expect(documentHeadersOf(probe)).toBeUndefined();
  });
});
