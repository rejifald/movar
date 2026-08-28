import { describe, expect, it, vi } from 'vitest';
import { evaluate, CORE_RULESET } from '@movar/audit';
import { AUDIT_BUDGET, ProbeUnavailableError, collectMatrix, MATRIX_HEADERS } from './collect';
import type { ProbeReply, ProbeRequest } from './protocol';

/**
 * The WebView collector's contract with a native prober.
 *
 * These drive `collectMatrix` through a fake transport rather than a real host,
 * because the interesting cases are all about what happens when the native
 * reply is NOT the happy path — a challenge page, a dropped reply, a
 * malformed field. Each of those has a specific safe direction, and getting one
 * backwards puts a false claim about a named company in a published report.
 */

const HTML = '<!doctype html><html lang="uk"><body><p>Вітаємо на сайті</p></body></html>';
const RU_HTML = '<!doctype html><html lang="ru"><body><p>Добро пожаловать</p></body></html>';
/**
 * An ordinary HTML error document. The site answered — so this is neither a
 * transport error nor a challenge — and what it answered is that the page is
 * not there. The `lang` belongs to the error template, not to a version.
 */
const NOT_FOUND_HTML = '<!doctype html><html lang="en"><body><p>Not found</p></body></html>';

function ok(body: string, extra: Partial<ProbeReply> = {}): ProbeReply {
  return {
    status: 200,
    outcome: 'ok',
    responseHeaders: { 'content-type': 'text/html' },
    redirectChain: [],
    finalUrl: 'https://example.com/',
    bodyHash: `hash-of-${body.length}-${body.slice(30, 45)}`,
    body,
    cookieState: 'cold',
    ...extra,
  };
}

/** A bridge that answers every leg the same way, recording what it was asked. */
function always(reply: ProbeReply | undefined) {
  const impl = vi
    .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
    .mockResolvedValue(reply);
  return { impl, seen: (): readonly ProbeRequest[] => impl.mock.calls.map(([request]) => request) };
}

const BASE = {
  url: 'https://example.com/',
  now: '2026-08-14T00:00:00.000Z',
  runId: 'run-1',
  // Declared per host rather than assumed: a bundle replayed later has to say
  // which prober produced it, and on Android that answer is not `swiftc`.
  collectorId: 'swift-urlsession',
};

describe('collectMatrix', () => {
  it('varies only Accept-Language, and spends one budgeted run', async () => {
    const bridge = always(ok(HTML));
    await collectMatrix({ ...BASE, probe: bridge.impl });

    expect(bridge.seen().map((request) => request.acceptLanguage)).toEqual([...MATRIX_HEADERS]);
    // Everything else identical is what makes the differential valid at all.
    expect(new Set(bridge.seen().map((request) => request.url))).toEqual(
      new Set(['https://example.com/']),
    );
    expect(new Set(bridge.seen().map((request) => request.runId))).toEqual(new Set(['run-1']));
    expect(new Set(bridge.seen().map((request) => request.budget))).toEqual(
      new Set([AUDIT_BUDGET]),
    );
  });

  it('links each probe to the page its body produced', async () => {
    const evidence = await collectMatrix({ ...BASE, probe: always(ok(HTML)).impl });
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];

    expect(probes).toHaveLength(MATRIX_HEADERS.length);
    expect(probes.every((probe) => probe.pageId !== undefined)).toBe(true);
    // Identical bodies at one URL collapse to a single page — the dedupe worth
    // having, since it keeps the page set honest about how many DISTINCT
    // documents were actually served.
    expect(evidence.pages).toHaveLength(1);
    expect(evidence.pages[0]?.document.htmlLang).toBe('uk');
  });

  it('keeps content-negotiated legs apart, which is what the matrix measures', async () => {
    // One URL answering Ukrainian or Russian by header, with no redirect, is the
    // exact case the response matrix exists to detect. Folding those onto one
    // page would make every serving rule read the first leg's language.
    // Queued per leg, in matrix order, so the Russian leg is the only one that
    // answers differently — no hand-written async mock, which the lint config
    // has no spelling for.
    const impl = vi.fn<(request: ProbeRequest) => Promise<ProbeReply>>();
    for (const header of MATRIX_HEADERS) {
      impl.mockResolvedValueOnce(ok(header === 'ru' ? RU_HTML : HTML));
    }

    const evidence = await collectMatrix({ ...BASE, probe: impl });
    expect(evidence.pages).toHaveLength(2);
    expect(
      evidence.pages
        .map((page) => page.document.htmlLang)
        .toSorted((a, b) => (a ?? '').localeCompare(b ?? '')),
    ).toEqual(['ru', 'uk']);
  });

  it('never digests a blocked response, even if a body arrives anyway', async () => {
    // Swift withholds a challenged body; this asserts the web side does not
    // trust that. A WAF interstitial answers HTTP 200 with its own <html lang>,
    // so digesting one manufactures a false accusation about a named company.
    const challenged = ok('<html lang="en"><body>Just a moment…</body></html>', {
      outcome: 'blocked',
    });
    const evidence = await collectMatrix({ ...BASE, probe: always(challenged).impl });
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];

    expect(evidence.pages).toHaveLength(0);
    expect(probes.every((probe) => probe.outcome === 'blocked')).toBe(true);
    expect(probes.every((probe) => probe.pageId === undefined)).toBe(true);
  });

  it('never digests an error document into a page', async () => {
    // The other half of the same rule, one status range over: a 404 is a real
    // answer, but its error template is not a version of the page that was
    // asked for. Digesting one made it a real page and every rule that resolves
    // a declared target read the stub as that page — `core/hreflang-target-
    // unresolvable` passing on a URL the site had just said does not exist, and
    // `core/hreflang-target-wrong-language` failing a named company over the
    // error template's `lang`. Refused by `createPageSet` for both runtimes, so
    // this side asserts the shared refusal actually reaches it.
    const missing = ok(NOT_FOUND_HTML, { status: 404 });
    const evidence = await collectMatrix({ ...BASE, probe: always(missing).impl });
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];

    expect(evidence.pages).toHaveLength(0);
    // The observation stays complete: `ok` means the site answered, and what it
    // answered — a 404 — is the finding's evidence rather than a gap in it.
    expect(probes.every((probe) => probe.outcome === 'ok' && probe.status === 404)).toBe(true);
    expect(probes.every((probe) => probe.pageId === undefined)).toBe(true);
  });

  it('treats an unknown outcome and a native refusal as error, never as an answer', async () => {
    const refused = await collectMatrix({
      ...BASE,
      probe: always({ outcome: 'ok', refused: 'budget-exhausted', body: HTML }).impl,
    });
    const weird = await collectMatrix({
      ...BASE,
      probe: always({ outcome: 'teapot', body: HTML }).impl,
    });

    for (const evidence of [refused, weird]) {
      const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];
      expect(probes.every((probe) => probe.outcome === 'error')).toBe(true);
      expect(evidence.pages).toHaveLength(0);
    }
  });

  it('survives a malformed reply rather than crashing the tab', async () => {
    // The reply is JSON over a bridge. A bad field must degrade to a recorded
    // observation, because `Evidence` is a published contract.
    const malformed = {
      status: 'two hundred',
      outcome: 'ok',
      responseHeaders: { 'X-Real': 'yes', 'x-bad': 42 },
      redirectChain: [{ url: 'https://example.com/', status: 'nope', location: '/uk/' }, null, 7],
      body: HTML,
    } as unknown as ProbeReply;

    const evidence = await collectMatrix({ ...BASE, probe: always(malformed).impl });
    const probe = evidence.source.kind === 'network' ? evidence.source.probes[0] : undefined;

    expect(probe?.status).toBe(0);
    // Header names are lower-cased; non-string values are dropped, not coerced.
    expect(probe?.responseHeaders).toEqual({ 'x-real': 'yes' });
    expect(probe?.redirectChain).toEqual([]);
  });

  it('throws only when the host answers nothing at all', async () => {
    // A site that refuses to answer is a fact about the site; no bridge is a
    // fact about the app. Reporting the second as the first would publish a
    // false observation.
    await expect(collectMatrix({ ...BASE, probe: always(void 0).impl })).rejects.toThrow(
      ProbeUnavailableError,
    );

    const refusing = await collectMatrix({
      ...BASE,
      probe: always({ outcome: 'error' }).impl,
    });
    expect(refusing.pages).toHaveLength(0);
  });

  it('records the page at the chain destination, not the URL we asked for', async () => {
    const redirected = ok(HTML, {
      finalUrl: 'https://example.com/uk/',
      redirectChain: [{ url: 'https://example.com/', status: 302, location: '/uk/' }],
    });
    const evidence = await collectMatrix({ ...BASE, probe: always(redirected).impl });

    expect(evidence.pages[0]?.url).toBe('https://example.com/uk/');
    // The probe still records the URL that was REQUESTED — the chain is the
    // finding for `core/switch-bounces`.
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];
    expect(probes[0]?.url).toBe('https://example.com/');
    expect(probes[0]?.redirectChain).toHaveLength(1);
  });

  /**
   * The same defect as in the Node collector, in the runtime the Safari host
   * app is built on — and the one this side can regress on its own, since
   * `documentHeadersOf` is a single call that still reads plausibly if
   * replaced by `observation.responseHeaders`.
   *
   * `responseHeaders` is the FIRST response's by contract: on a
   * locale-autodetect `302` that is the redirect's bag, and its
   * `Link: …; rel="alternate"` and `Content-Language` are the redirect's own
   * declarations. Folding them into the digest of the document at the END of
   * the chain merges two resources into one `DocumentEvidence`, which
   * `core/inventory-sources-disagree` then publishes as a defect of a named
   * site. The native probers record only the first response's today, so the
   * honest answer here is no header declarations at all: an alternate the
   * collector did not collect is a gap, one taken off another resource is an
   * accusation.
   */
  it('never digests a redirect’s own declarations into the page it points at', async () => {
    const LINK = '<https://example.com/de/>; rel="alternate"; hreflang="de"';
    const redirected = ok(HTML, {
      finalUrl: 'https://example.com/uk/',
      responseHeaders: { 'content-type': 'text/html', link: LINK, 'content-language': 'de' },
      redirectChain: [{ url: 'https://example.com/', status: 302, location: '/uk/' }],
    });
    const evidence = await collectMatrix({ ...BASE, probe: always(redirected).impl });
    const page = evidence.pages[0];

    expect(page?.url).toBe('https://example.com/uk/');
    // The body declares no alternates, so anything here came off the redirect.
    expect(page?.document.alternates).toEqual([]);
    expect(page?.document.head?.declarations.map((entry) => entry.kind)).not.toContain(
      'content-language',
    );
    // The probe keeps that bag, and `core/serving-vary-missing` still reads it:
    // the fix is "each caller names which resource it means", never "drop the
    // redirect's headers".
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];
    expect(probes[0]?.responseHeaders['link']).toBe(LINK);
  });

  /** The other direction: a leg that never redirected still folds its own in. */
  it('folds in the serving response’s declarations when nothing redirected', async () => {
    const direct = ok(HTML, {
      responseHeaders: {
        'content-type': 'text/html',
        link: '<https://example.com/de/>; rel="alternate"; hreflang="de"',
      },
      redirectChain: [],
    });
    const evidence = await collectMatrix({ ...BASE, probe: always(direct).impl });
    const alternates = evidence.pages[0]?.document.alternates ?? [];

    expect(alternates.map((entry) => entry.hreflang)).toEqual(['de']);
    expect(alternates[0]?.source).toBe('header');
  });

  it('produces evidence the pure kernel can adjudicate', async () => {
    // The point of the whole split: this collector shares nothing with the
    // kernel but `Evidence`, so `evaluate()` must accept it untouched.
    const evidence = await collectMatrix({ ...BASE, probe: always(ok(HTML)).impl });
    const report = evaluate(evidence, CORE_RULESET);

    expect(report.evidence.collector.id).toBe('swift-urlsession');
    expect(report.evidence.sourceKind).toBe('network');
    expect(report.coverage.rules).toBeGreaterThan(0);
    // `not-collected` is never a pass — this tier collects no rendered DOM and
    // follows no declared targets, so some of the catalogue must say so.
    expect(report.coverage.passed + report.coverage.notCollected).toBeGreaterThan(0);
  });
});

describe('collectMatrix — reporting progress', () => {
  it('reports each settled leg, in order, up to the matrix size', async () => {
    const seen: [number, number][] = [];
    await collectMatrix({
      ...BASE,
      probe: always(ok(HTML)).impl,
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual(MATRIX_HEADERS.map((_, index) => [index + 1, MATRIX_HEADERS.length]));
  });

  it('still advances on a leg the bridge refused', async () => {
    // A run is one step further along whether or not the site answered, and a
    // bar that stalled on the first refusal would look wedged for the rest of
    // the matrix.
    const seen: number[] = [];
    const probe = vi
      .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
      .mockResolvedValueOnce(ok(HTML))
      .mockResolvedValue(void 0);
    await collectMatrix({ ...BASE, probe, onProgress: (done) => seen.push(done) });
    expect(seen).toEqual(MATRIX_HEADERS.map((_, index) => index + 1));
  });
});

describe('the digest runs against a DOMParser document', () => {
  it('finds a language picker without jsdom or any globals shim', async () => {
    // The load-bearing claim of the whole WebView tier: `@movar/lang-pickers`
    // runs unmodified against `DOMParser` output. `<html data-lang>` is the
    // UMI.CMS shape whose page-root guard used to resolve through the GLOBAL
    // document — which, in a WebView, is the host app's own UI.
    const withPicker = `<!doctype html><html lang="ru" data-lang="ru"><body>
      <div class="lang"><a href="/">UKR</a><a href="/ru/">RU</a></div>
      <p>Добро пожаловать</p></body></html>`;

    const evidence = await collectMatrix({ ...BASE, probe: always(ok(withPicker)).impl });
    const picker = evidence.pages[0]?.document.picker;

    expect(picker).not.toBeNull();
    expect(picker?.options.map((option) => option.label).toSorted()).toEqual(['RU', 'UKR']);
  });
});

describe('collectMatrix — the edges of an untrusted reply', () => {
  it('stamps a warm run as warm, so the matrix caveat is on the evidence', async () => {
    // A warm, logged-in session breaks the matrix's everything-else-identical
    // requirement. It is allowed, but it must be visible in the bundle.
    const evidence = await collectMatrix({
      ...BASE,
      probe: always(ok(HTML, { cookieState: 'warm' })).impl,
    });
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];
    expect(probes.every((probe) => probe.cookieState === 'warm')).toBe(true);
  });

  it('drops a redirect hop whose url or location is not a string', async () => {
    const bad = {
      status: 302,
      outcome: 'ok',
      responseHeaders: {},
      redirectChain: [
        { url: 42, status: 302, location: '/uk/' },
        { url: 'https://example.com/', status: 302, location: null },
        { url: 'https://example.com/', status: 301, location: '/uk/' },
      ],
      body: HTML,
      finalUrl: 'https://example.com/uk/',
    } as unknown as ProbeReply;

    const evidence = await collectMatrix({ ...BASE, probe: always(bad).impl });
    const probes = evidence.source.kind === 'network' ? evidence.source.probes : [];
    // Only the well-formed hop survives — a half-parsed chain must never become
    // the evidence a redirect finding rests on.
    expect(probes[0]?.redirectChain).toEqual([
      { url: 'https://example.com/', status: 301, location: '/uk/' },
    ]);
  });
});
