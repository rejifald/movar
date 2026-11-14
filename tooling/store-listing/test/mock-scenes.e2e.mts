/* eslint-disable no-console, unicorn/no-process-exit -- CLI script: reports to stdout, exits non-zero on failure */
/**
 * End-to-end contract check for the curated mock sites, against the REAL Movar
 * extension (Chromium, the `MOVAR_E2E=1` build) with `contentModification` on.
 * Not part of vitest: run it with
 *
 *   cd tooling/store-listing && npx tsx test/mock-scenes.e2e.mts
 *
 * Build the extension first:  cd apps/extension && MOVAR_E2E=1 pnpm exec wxt build
 * Env: MOVAR_EXT_PATH (default apps/extension/.output/chrome-mv3),
 *      MOCK_CHECK_OUT (screenshot directory).
 *
 * Page content is served by `context.route` from the same route table the proxy
 * serves (src/mock/routes.ts); the proxy itself is covered by test/mock-proxy.test.ts.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as PlaywrightTest from '@playwright/test';
type BrowserContext = PlaywrightTest.BrowserContext;
type Page = PlaywrightTest.Page;
import { defaultSettings } from '@movar/settings';
import { MOCK_HOSTS, SCENES, resolveRoute } from '../src/mock/routes.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const requireFromE2e = createRequire(path.join(repoRoot, 'apps/e2e/package.json'));
const { chromium } = requireFromE2e('@playwright/test') as typeof PlaywrightTest;

const EXTENSION_PATH =
  process.env['MOVAR_EXT_PATH'] ?? path.join(repoRoot, 'apps/extension/.output/chrome-mv3');
const OUT_DIR = process.env['MOCK_CHECK_OUT'] ?? path.join(here, '../.mock-check');
mkdirSync(OUT_DIR, { recursive: true });

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
  if (!ok) failures.push(label);
}

/** Seed Movar's settings through an extension page: evaluating inside the MV3
 *  service worker itself can hang in a loaded headless Chromium, while an
 *  extension page shares the same `chrome.storage` and answers immediately. */
async function seedSettings(context: BrowserContext, settings: object): Promise<void> {
  const sw =
    context.serviceWorkers().at(-1) ??
    (await context.waitForEvent('serviceworker', { timeout: 30_000 }));
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
  await page.evaluate(`(async () => {
    for (let i = 0; i < 80; i++) {
      const got = await chrome.storage.sync.get('settings');
      if (got.settings !== undefined) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const s = ${JSON.stringify(settings)};
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ settings: s });
    await new Promise((r) => setTimeout(r, 150));
    await chrome.storage.sync.set({ settings: s });
  })()`);
  await page.close();
}

async function launch(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--lang=uk-UA',
    ],
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'uk-UA',
  });
  const settings = { ...defaultSettings, contentModification: true };
  await seedSettings(context, settings);

  // Serve mocked hosts from the route table; refuse everything else, so the
  // check proves the pages need no external network.
  const refused: string[] = [];
  await context.route(
    () => true,
    async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return route.continue();
      if (!MOCK_HOSTS.includes(url.hostname)) {
        refused.push(url.href);
        return route.abort('blockedbyclient');
      }
      const hit = resolveRoute(url.hostname, `${url.pathname}${url.search}`);
      if (hit === null) {
        refused.push(`MISS ${url.href}`);
        return route.fulfill({ status: 404, body: 'miss' });
      }
      return route.fulfill({ status: hit.status, headers: hit.headers, body: hit.body });
    },
  );
  (context as unknown as { refused: string[] }).refused = refused;
  return context;
}

/** A card/entry is concealed when Movar curtained or hid it (or an ancestor/descendant). */
async function concealed(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (el === null) throw new Error(`missing ${sel}`);
    const marker = '[data-movar-curtain],[data-movar-hidden]';
    if (el.closest(marker) !== null) return true;
    return el.querySelector('[data-movar-curtain],[data-movar-hidden]') !== null;
  }, selector);
}

async function settle(page: Page, ms = 2500): Promise<void> {
  await page.waitForTimeout(ms);
}

async function waitFor(page: Page, fn: () => Promise<boolean>, timeout = 12_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

const context = await launch();
try {
  // ── Scene 1: Google ──────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    const visited: string[] = [];
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) visited.push(f.url());
    });
    await page.goto(SCENES.google.startUrl, { waitUntil: 'domcontentloaded' });
    const redirected = await waitFor(
      page,
      async () => new URL(page.url()).searchParams.get('hl') === 'uk',
    );
    check('google: Movar rewrote the URL to hl=uk', redirected, page.url());
    await waitFor(page, async () => (await page.locator('[data-fixture-id="uk-1"]').count()) > 0);
    await waitFor(page, () => concealed(page, '[data-fixture-id="ru-1"]'));
    await settle(page, 1500);
    check(
      'google: final page is the Ukrainian SERP',
      (await page.locator('[data-fixture-id="uk-1"]').count()) === 1,
    );
    check('google: Russian result 1 curtained', await concealed(page, '[data-fixture-id="ru-1"]'));
    check('google: Russian result 2 curtained', await concealed(page, '[data-fixture-id="ru-2"]'));
    for (const id of ['uk-1', 'uk-2', 'uk-3', 'uk-4', 'en-1']) {
      check(`google: ${id} visible`, !(await concealed(page, `[data-fixture-id="${id}"]`)));
    }
    console.log(
      '      google navigations:',
      visited.map((u) => decodeURIComponent(u)).join('  ->  '),
    );
    await page.screenshot({ path: path.join(OUT_DIR, '1-google.png') });
    await page.close();
  }

  // ── Scene 2: Tochka24 ────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    const visited: string[] = [];
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) visited.push(f.url());
    });
    await page.goto(SCENES.tochka24.startUrl, { waitUntil: 'domcontentloaded' });
    const arrived = await waitFor(page, async () => page.url() === SCENES.tochka24.finalUrl);
    check('tochka24: redirected to /uk/', arrived, page.url());
    await settle(page, 1500);
    check('tochka24: no language gate', (await page.locator('#language-gate').count()) === 0);
    check(
      'tochka24: <html lang> is uk',
      (await page.locator('html').getAttribute('lang')) === 'uk',
    );
    await page.screenshot({ path: path.join(OUT_DIR, '2a-site-uk.png') });

    const ruEntry = '#lang-menu a[hreflang="ru"]';
    check(
      'tochka24: Russian menu entry hidden by Movar',
      await waitFor(page, () => concealed(page, ruEntry), 4000),
    );
    check(
      'tochka24: Ukrainian menu entry untouched',
      !(await concealed(page, '#lang-menu a[hreflang="uk"]')),
    );
    check(
      'tochka24: English menu entry untouched',
      !(await concealed(page, '#lang-menu a[hreflang="en"]')),
    );
    await page.locator('#lang-menu-button').tap();
    await page.waitForTimeout(600);
    check('tochka24: menu opens on tap', (await page.locator('#lang-menu.open').count()) === 1);
    await page.screenshot({ path: path.join(OUT_DIR, '2b-site-uk-menu.png') });
    console.log('      tochka24 navigations:', visited.join('  ->  '));
    await page.close();
  }

  // ── Scene 3: YouTube ─────────────────────────────────────────────────────
  {
    const page = await context.newPage();
    await page.goto(SCENES.youtube.startUrl, { waitUntil: 'domcontentloaded' });
    await waitFor(page, () => concealed(page, '[data-fixture-id="ru-1"]'));
    await settle(page, 1500);
    for (const id of ['ru-1', 'ru-2', 'ru-3']) {
      check(`youtube: ${id} curtained`, await concealed(page, `[data-fixture-id="${id}"]`));
    }
    for (const id of ['uk-1', 'uk-2', 'uk-3', 'en-1', 'en-2']) {
      check(`youtube: ${id} visible`, !(await concealed(page, `[data-fixture-id="${id}"]`)));
    }
    await page.screenshot({ path: path.join(OUT_DIR, '3-youtube.png') });
    await page.screenshot({ path: path.join(OUT_DIR, '3-youtube-full.png'), fullPage: true });
    await page.close();
  }

  const refused = (context as unknown as { refused: string[] }).refused;
  check('no unrouted or external requests', refused.length === 0, refused.join(', '));
} finally {
  await context.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nall checks passed; screenshots in ${OUT_DIR}`);
