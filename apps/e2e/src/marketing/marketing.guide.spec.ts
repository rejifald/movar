/**
 * Behaviour coverage for the settings guide at `/uk/guide`.
 *
 * Sibling of `marketing.blog.spec.ts`, and it carries the same Ukrainian-only
 * routing assertions for the same reason (see that file's header). Three more
 * things here have no pixels for the visual suite to catch, and every one of
 * them fails silently:
 *
 *  1. **The checker's verdict.** It reports two independent faults — Ukrainian
 *     missing, Russian present — and an `if/else` ladder over both made one of
 *     them unreachable: a browser asking for `['ru']` alone was told only that
 *     Ukrainian was not declared, never that Russian was what it was asking
 *     for. That is the single case this guide exists for, so each state is
 *     driven here through an overridden `navigator.languages`.
 *
 *  2. **The detection shortcut.** A card is surfaced by matching its `match`
 *     tokens against `detectTokens(navigator.userAgent)`. The collection schema
 *     now rejects a token no user agent can emit, but nothing type-checks the
 *     other direction — that the tokens which *are* valid still reach a card.
 *
 *  3. **The links out of the hub.** Twenty cards, a back-link on every page and
 *     one cross-link to the explainer, all built from content-collection ids.
 *     A renamed file leaves a 404 that no type error and no snapshot notices.
 *
 * The checklist is covered because its whole reason for being interactive is
 * surviving a reload, which is the one thing a static render cannot show.
 *
 * Runs against the same `astro preview` server as the visual suite — see
 * `playwright.marketing.config.ts`.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const INDEX = '/uk/guide';
const PAGE = '/uk/guide/windows';
const EXPLAINER = '/uk/blog/ukrainska-za-zamovchuvannyam';

/** Override the list the checker reads, before any page script runs. */
async function withLanguages(page: Page, languages: string[]): Promise<void> {
  // `configurable` matters: a test that walks several lists adds one init
  // script per case, and a non-configurable property makes every redefinition
  // after the first throw — leaving the first list in place and every later
  // case silently asserting against it.
  await page.addInitScript((langs: string[]) => {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => langs });
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => langs[0] ?? '' });
  }, languages);
}

/**
 * An English-preferring browser, which is what makes the routing assertions
 * meaningful: on any two-locale page this locale would trigger the inline
 * redirect out of `/uk/`.
 */
test.use({ locale: 'en-US' });

test.describe('guide — Ukrainian-only routing', () => {
  for (const [name, path] of [
    ['hub', INDEX],
    ['page', PAGE],
  ] as const) {
    test(`${name} does not bounce an English-preferring visitor out of /uk/`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Give the inline redirect a chance to run before asserting it didn't.
      await page.waitForLoadState('networkidle');

      expect(new URL(page.url()).pathname).toMatch(/^\/uk\/guide/);
      await expect(page.locator('h1')).toBeVisible();
    });
  }

  test('a page advertises no hreflang alternate to a page that does not exist', async ({
    page,
  }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/uk\/guide\/windows\/?$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });
});

test.describe('guide — hub', () => {
  test('every card resolves, and each group renders', async ({ page, request }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    // The five blocks of the hub, in `GUIDE_GROUPS` order. Matched on `h2`
    // rather than by role: the closing checklist re-uses three of these words
    // as its own `h3` group headings, so a role query hits two elements.
    for (const heading of ['Пристрій', 'Браузер', 'Google', 'Сервіси', 'Окремі сайти']) {
      await expect(page.locator('h2', { hasText: heading }).first()).toBeVisible();
    }

    const hrefs = await page
      .locator('a[data-nav-label]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));

    expect(hrefs.length, 'hub should list every guide page').toBeGreaterThanOrEqual(20);
    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.status(), `${href} should resolve`).toBe(200);
    }
  });

  test('links to the explainer it was split out of', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await page.locator(`a[href="${EXPLAINER}"]`).first().click();
    await page.waitForURL(/\/uk\/blog\/ukrainska-za-zamovchuvannyam/);
    await expect(page.locator('h1')).toContainText('українську мовою за замовчуванням');
  });

  test('a page links back to the hub', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await page.locator(`a[href="${INDEX}"]`).first().click();
    await page.waitForURL(/\/uk\/guide\/?$/);
  });

  test('a page stamps when its steps were last checked', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('time[datetime]').first()).toBeVisible();
  });
});

test.describe('guide — browser-language checker', () => {
  /**
   * One case per verdict, each with the phrase that distinguishes it — written
   * out rather than derived, so the test states the mapping instead of
   * recomputing it from the same rules it is meant to police.
   *
   * The first two are the pair an ordered ladder collapsed: both have Russian
   * declared, and they must not read the same.
   */
  const CASES = [
    {
      name: 'Russian only — the worst state, and the one that regressed',
      languages: ['ru'],
      says: 'української не просить зовсім',
    },
    {
      name: 'Russian alongside Ukrainian',
      languages: ['uk-UA', 'en', 'ru'],
      says: 'У списку є російська',
    },
    {
      name: 'Ukrainian present but not first',
      languages: ['en-US', 'uk'],
      says: 'але не першою',
    },
    { name: 'Ukrainian first', languages: ['uk-UA', 'en'], says: 'просить сторінки українською' },
    { name: 'nothing declared', languages: [], says: 'не повідомляє список мов' },
  ] as const;

  for (const { name, languages, says } of CASES) {
    test(`reports ${name}`, async ({ page }) => {
      await withLanguages(page, [...languages]);
      await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

      const verdict = page.locator('[data-checker-verdict]');
      await expect(verdict).toBeVisible();
      await expect(verdict).toContainText(says);
    });
  }

  test('every verdict is distinct, so no state can quietly borrow another’s copy', async ({
    page,
  }) => {
    const seen = new Set<string>();
    for (const { languages } of CASES) {
      await withLanguages(page, [...languages]);
      await page.goto(INDEX, { waitUntil: 'domcontentloaded' });
      seen.add((await page.locator('[data-checker-verdict]').textContent())?.trim() ?? '');
    }
    expect(seen.size, 'each language list should get its own sentence').toBe(CASES.length);
  });

  test('a Russian-only browser is told about Russian, not just about Ukrainian', async ({
    page,
  }) => {
    await withLanguages(page, ['ru-RU', 'ru']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const text = (await page.locator('[data-checker-verdict]').textContent()) ?? '';
    // The regression: this state used to render the weaker «not declared»
    // sentence, which never mentions what the browser is actually asking for.
    expect(text).toContain('російську');
    expect(text).not.toBe('Українська не заявлена взагалі — сайти обиратимуть мову за вас.');
  });

  test('shows the raw list as its own evidence', async ({ page }) => {
    await withLanguages(page, ['uk-UA', 'en-US']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-checker-list]')).toHaveText('uk-UA, en-US');
  });
});

test.describe('guide — platform detection', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });

  test('surfaces the visitor’s own platform and browser first', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const shortcuts = page.locator('[data-detect-links] a');
    await expect(shortcuts).toHaveCount(2);
    await expect(shortcuts.nth(0)).toHaveText('Windows');
    await expect(shortcuts.nth(1)).toHaveText('Chrome');
    await expect(page.locator('[data-detect-heading]')).toContainText('Windows і Chrome');
  });
});

test.describe('guide — checklist', () => {
  test('a tick survives a reload, and reset clears it', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const first = page.locator('[data-checklist-item]').first();
    await first.check();
    await expect(page.locator('[data-checklist-progress]')).toContainText('1 з');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-checklist-item]').first()).toBeChecked();

    await page.locator('[data-checklist-reset]').click();
    await expect(page.locator('[data-checklist-item]').first()).not.toBeChecked();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-checklist-item]').first()).not.toBeChecked();
  });
});

test.describe('guide — without JavaScript', () => {
  // The claim in `GuideChecklist.astro` is that the list works before any script
  // runs, and the claim in `GuideChecker.astro` is that a no-JS visitor sees the
  // plain link list rather than a box stuck on «Перевіряємо…». Both are only
  // true if nothing here needs the island, so both are asserted with JS off.
  test.use({ javaScriptEnabled: false });

  test('the checklist is still a usable list, and the widgets stay out of the way', async ({
    page,
  }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const boxes = page.locator('input[type="checkbox"][data-checklist-item]');
    expect(await boxes.count()).toBeGreaterThan(0);
    await expect(boxes.first()).toBeEnabled();

    // Progressive chrome: hidden until the script reveals it.
    await expect(page.locator('[data-checklist-progress]')).toBeHidden();
    await expect(page.locator('[data-checklist-reset]')).toBeHidden();
    await expect(page.locator('[data-guide-checker]')).toBeHidden();
    await expect(page.locator('[data-guide-detect]')).toBeHidden();

    // …and the guide itself is fully readable regardless.
    await expect(page.locator('a[data-nav-label]').first()).toBeVisible();
  });
});

/*
 * The footer's guide row exists in one locale. Each half needs its own locale,
 * because `/uk/` and `/` are two-locale pages: the inline redirect really does
 * fire on them, so an en-US visitor asserting against the Ukrainian footer
 * would be measuring the English one after the bounce.
 */
test.describe('guide — Ukrainian footer', () => {
  test.use({ locale: 'uk-UA' });

  test('links the guide', async ({ page }) => {
    await page.goto('/uk/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).pathname, 'a uk visitor should stay on /uk/').toBe('/uk/');
    await expect(page.locator(`footer a[href="${INDEX}"]`)).toHaveCount(1);
  });
});

test.describe('guide — English footer', () => {
  test('does not link the guide, which has no English half', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).pathname, 'an en visitor should stay on /').toBe('/');
    await expect(page.locator(`footer a[href="${INDEX}"]`)).toHaveCount(0);
  });
});
