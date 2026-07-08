/**
 * Google /search DNR redirect e2e suite — network-side proof that the
 * pre-request language rewrite works where it matters: in Chrome's real
 * declarativeNetRequest matcher, before the request leaves the browser.
 *
 * Why this exists: the content-script `searchParams` rewrite corrects a raw
 * entry search only AFTER the poisoned request (Chrome's opaque `gs_lcrp`
 * omnibox token, no `lr`) has been served — one wasted page load per entry
 * search, and the raw request can seed a server-side pinned candidate set
 * that zeroes results under the `lr` filter (docs/google-search-url-params.md,
 * finding #1). The DNR rule redirects the URL inside the network stack, so
 * the raw request never leaves. The unit suite (lib/dnr.test.ts) pins the
 * rule JSON; what only a browser can prove is pinned here:
 *
 *   - Chrome's matcher (`testMatchOutcome`) actually selects the rule for an
 *     omnibox-shaped URL, and leaves /maps and q-less URLs alone — the real
 *     RE2 engine + requestDomains semantics, not a JS RegExp approximation
 *   - a navigation to a raw entry URL arrives at the network layer ALREADY
 *     rewritten: the route sees exactly one request, and it carries `hl`/`lr`
 *     with the session tokens stripped — the raw URL is never requested
 *   - loop safety is real, not assumed: navigating to an already-rewritten
 *     URL loads exactly once (Chrome skips a redirect whose target equals
 *     the request URL — behaviour the rule's design leans on but Chrome's
 *     docs don't spell out, hence the empirical pin)
 *
 * Deliberately offline: every navigation is fulfilled by a `context.route`
 * handler, so no request ever reaches live Google. The route mocks the real
 * `www.google.com` host because both the DNR rule's `requestDomains` and the
 * content-script host gate are exact — a `mocked-google.example.test` host
 * would exercise neither (same reasoning as the YouTube case in
 * content-script.spec.ts).
 *
 * The stub body has NO `#search` container on purpose: the empty-results
 * retry treats an absent results area as "not a results page" and stays
 * quiet, so these tests observe only the DNR + content-script layers.
 */
import type { BrowserContext, Worker } from '@playwright/test';
import { expect, test } from '../fixtures/extension';

/** Stable id mirrors `apps/extension/src/lib/dnr.ts` (GOOGLE_SEARCH_RULE_ID).
 *  Duplicated here intentionally — same rationale as ACCEPT_LANGUAGE_RULE_ID
 *  in russian-browser-lang.spec.ts: the e2e package consumes the built
 *  extension, not its sources, and the id is a persisted DNR contract. */
const GOOGLE_SEARCH_RULE_ID = 2;

/** A realistic omnibox entry URL: `gs_lcrp`/`aqs`/`sourceid`/`ie`/`oq` are
 *  minted by Chrome before any extension code runs; no entry surface emits
 *  `hl` or `lr` (docs/google-search-url-params.md, finding #2). */
const OMNIBOX_URL =
  'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5&oq=rele&gs_lcrp=EgZjaHJvbWU&aqs=chrome..69i57&sourceid=chrome&ie=UTF-8';

/** Read Movar's installed Google redirect rule from real DNR state (not a
 *  mock), evaluated inside the MV3 service worker. */
async function readGoogleRedirectRule(
  serviceWorker: Worker,
): Promise<chrome.declarativeNetRequest.QueryTransform | null> {
  return serviceWorker.evaluate(async (ruleId) => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const rule = rules.find((r) => r.id === ruleId);
    const transform = rule?.action.redirect?.transform?.queryTransform;
    return transform ?? null;
  }, GOOGLE_SEARCH_RULE_ID);
}

/** Which dynamic rules match `url` as a main_frame request, per Chrome's own
 *  matcher. `testMatchOutcome` (Chrome 103+) is available because the e2e
 *  build loads the extension unpacked; the installed @types/chrome predates
 *  the API, hence the local declaration. */
async function matchedRuleIds(serviceWorker: Worker, url: string): Promise<number[]> {
  return serviceWorker.evaluate(async (testUrl) => {
    const dnr = chrome.declarativeNetRequest as typeof chrome.declarativeNetRequest & {
      testMatchOutcome(details: {
        url: string;
        type: string;
        method: string;
      }): Promise<{ matchedRules: { ruleId: number }[] }>;
    };
    const outcome = await dnr.testMatchOutcome({
      url: testUrl,
      type: 'main_frame',
      method: 'get',
    });
    return outcome.matchedRules.map((r) => r.ruleId);
  }, url);
}

/** Fulfil every www.google.com request with a minimal stub document and
 *  record each requested URL — the "what actually left the browser" log the
 *  redirect assertions read. */
async function mockGoogle(context: BrowserContext): Promise<string[]> {
  const requestedUrls: string[] = [];
  await context.route('https://www.google.com/**', async (route) => {
    requestedUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head><title>stub serp</title></head><body><p>stub</p></body></html>',
    });
  });
  return requestedUrls;
}

test.describe('Google /search DNR pre-request rewrite', () => {
  test('the redirect rule is installed with the language transform derived from settings.priority', async ({
    serviceWorker,
  }) => {
    // Poll: the rule lands via resync shortly after worker startup/seeding.
    await expect(async () => {
      expect(await readGoogleRedirectRule(serviceWorker)).not.toBeNull();
    }).toPass({ timeout: 10_000 });

    const transform = (await readGoogleRedirectRule(serviceWorker))!;
    // E2E settings keep the default priority [uk, en] → hl from the top
    // preference, lr pipe-joined across the full list.
    expect(transform.addOrReplaceParams).toEqual([
      { key: 'hl', value: 'uk' },
      { key: 'lr', value: 'lang_uk|lang_en' },
    ]);
    expect(transform.removeParams).toContain('gs_lcrp');
    expect(transform.removeParams).toContain('sei');
  });

  test("Chrome's matcher selects the rule for an entry SERP URL and rejects /maps + q-less URLs", async ({
    serviceWorker,
  }) => {
    await expect(async () => {
      expect(await matchedRuleIds(serviceWorker, OMNIBOX_URL)).toContain(GOOGLE_SEARCH_RULE_ID);
    }).toPass({ timeout: 10_000 });

    // Path gate: /maps interprets lr differently and must stay untouched.
    expect(await matchedRuleIds(serviceWorker, 'https://www.google.com/maps?q=kyiv')).not.toContain(
      GOOGLE_SEARCH_RULE_ID,
    );
    // Param gate: homepage and q-less surfaces stay untouched.
    expect(await matchedRuleIds(serviceWorker, 'https://www.google.com/')).not.toContain(
      GOOGLE_SEARCH_RULE_ID,
    );
    expect(
      await matchedRuleIds(serviceWorker, 'https://www.google.com/search?tbm=isch'),
    ).not.toContain(GOOGLE_SEARCH_RULE_ID);
    // Host gate: a non-Google host with the same path shape is out of scope.
    expect(await matchedRuleIds(serviceWorker, 'https://example.com/search?q=test')).not.toContain(
      GOOGLE_SEARCH_RULE_ID,
    );
  });

  test('a raw omnibox entry request is rewritten BEFORE it leaves the browser — one request, already clean', async ({
    movarContext,
    movarPage,
    serviceWorker,
  }) => {
    // Wait for the rule first — navigating before it lands would race resync.
    await expect(async () => {
      expect(await readGoogleRedirectRule(serviceWorker)).not.toBeNull();
    }).toPass({ timeout: 10_000 });

    const requestedUrls = await mockGoogle(movarContext);
    await movarPage.goto(OMNIBOX_URL, { waitUntil: 'domcontentloaded' });

    // The document the user lands on carries the language params and none of
    // the session tokens…
    const landed = new URL(movarPage.url());
    expect(landed.pathname).toBe('/search');
    expect(landed.searchParams.get('hl')).toBe('uk');
    expect(landed.searchParams.get('lr')).toBe('lang_uk|lang_en');
    expect(landed.searchParams.get('gs_lcrp')).toBeNull();
    expect(landed.searchParams.get('aqs')).toBeNull();
    // …user-facing params intact…
    expect(landed.searchParams.get('q')).toBe('реле');
    expect(landed.searchParams.get('oq')).toBe('rele');

    // …and — the point of the whole layer — the raw URL was never requested:
    // the network saw exactly one request, already rewritten. A content-script
    // correction would show two (raw served, then the rewrite navigation).
    expect(requestedUrls).toHaveLength(1);
    const requested = new URL(requestedUrls[0]!);
    expect(requested.searchParams.get('gs_lcrp')).toBeNull();
    expect(requested.searchParams.get('lr')).toBe('lang_uk|lang_en');
  });

  test('an already-rewritten URL loads exactly once (same-URL redirect skip — the loop-safety pin)', async ({
    movarContext,
    movarPage,
    serviceWorker,
  }) => {
    await expect(async () => {
      expect(await readGoogleRedirectRule(serviceWorker)).not.toBeNull();
    }).toPass({ timeout: 10_000 });

    const requestedUrls = await mockGoogle(movarContext);
    // A SERP-internal-shaped URL already at the target state: hl/lr correct,
    // no removable token. The rule matches it (q= present), the transform
    // computes an identical URL, and Chrome must skip the redirect — a loop
    // here would surface as ERR_TOO_MANY_REDIRECTS failing the goto.
    const clean = 'https://www.google.com/search?q=test&hl=uk&lr=lang_uk%7Clang_en&start=10';
    await movarPage.goto(clean, { waitUntil: 'domcontentloaded' });

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toBe(clean);
    expect(movarPage.url()).toBe(clean);
  });
});
