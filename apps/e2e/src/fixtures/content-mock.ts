/**
 * Content-script test helpers — serve fixed HTML for a mocked URL via
 * `page.route()` so the content script can be exercised offline.
 *
 * Why offline: the live `sites.spec.ts` suite is opt-in, slow, and
 * network-flaky. The offline counterpart in `content-script.spec.ts`
 * proves the picker-filter / curtain-blur / no-op paths react to known
 * inputs deterministically — no DNS, no anti-bot, no IP geolocation
 * variance.
 *
 * Why context.route, not page.route: the content script runs at
 * `document_start` on `<all_urls>`. Routing on `context` means the
 * MV3 service worker sees the response the same way it would on a
 * real navigation, and the matcher fires for every page in the context.
 *
 * The HTML fixtures live under `src/fixtures/html/`. They're standalone
 * documents — no external scripts, no remote stylesheets — so the
 * mocked response is fully self-contained and the content script's
 * mutations are the only DOM changes after document_start.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Route } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where the HTML fixtures live. Resolved relative to this file so the
 *  helper works whether tests are launched from the e2e package root or
 *  the workspace root. */
const HTML_FIXTURE_DIR = path.resolve(__dirname, 'html');

/** Load one of the named HTML fixture documents from `src/fixtures/html/`.
 *  Pass the filename WITHOUT the `.html` suffix — e.g. `loadHtmlFixture('cs-cart-ru')`. */
export function loadHtmlFixture(name: string): string {
  return readFileSync(path.join(HTML_FIXTURE_DIR, `${name}.html`), 'utf8');
}

/**
 * Register a route on `context` that fulfills `urlPattern` with the
 * named HTML fixture as the response body. Returns a small bookkeeping
 * record the test can read after the fact to confirm the route fired
 * (useful when a typo in the URL would otherwise produce a silent
 * "route never matched, page got default 404, test still passed because
 * nothing was hidden anyway" failure).
 *
 * The pattern is forwarded to `context.route` verbatim. Use a string
 * with wildcards (`'https://www.youtube.com/results*'`), a glob, or a
 * RegExp as needed; the route fulfilment is the same shape for all.
 *
 * To register multiple URLs for one site (e.g. mock both `/` and `/uk/`
 * for the redirect-path test), call this once per URL.
 */
export async function mockSite(
  context: BrowserContext,
  urlPattern: string | RegExp,
  fixtureName: string,
): Promise<{ hits: number }> {
  const body = loadHtmlFixture(fixtureName);
  const bookkeeping = { hits: 0 };
  await context.route(urlPattern, async (route: Route) => {
    bookkeeping.hits += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    });
  });
  return bookkeeping;
}
