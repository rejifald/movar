/**
 * Behaviour coverage for the settings guide at `/uk/guide`.
 *
 * Sibling of `marketing.blog.spec.ts`, and it carries the same Ukrainian-only
 * routing assertions for the same reason (see that file's header). Three more
 * things here have no pixels for the visual suite to catch, and every one of
 * them fails silently:
 *
 *  1. **The diagnosis.** It reports up to two INDEPENDENT faults — Ukrainian
 *     missing or misplaced, Russian present — where the checker it replaced
 *     walked an ordered first-match table and could only ever report one. A
 *     browser asking for `['ru']` alone was told only that Ukrainian was not
 *     declared, never that Russian was what it was asking for. That is the
 *     single case this guide exists for, so each state is driven here through an
 *     overridden `navigator.languages`.
 *
 *  2. **Which fix a reader is shown.** The steps must belong to the surface that
 *     owns their language list, which is not always their browser — Safari has
 *     none of its own, and on iOS no browser does. Nothing type-checks that
 *     routing, so five user agents drive it here.
 *
 *  3. **The links out of the hub.** Twenty cards, a back-link on every page and
 *     one cross-link to the explainer, all built from content-collection ids.
 *     A renamed file leaves a 404 that no type error and no snapshot notices.
 *
 *  4. **The install CTAs.** This section renders three of them, and a button
 *     pointing at the wrong place is pixel-identical to one pointing at the
 *     right place — which is precisely how the multi-instance bug the hub
 *     exposed stayed invisible.
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
const HYGIENE = '/uk/blog/movna-hihiiena';
/** The checklist's twenty-first row — the one with no checkbox, and the anchor
 *  the sticky bar's completion shortcut points at. */
const BEYOND_ROW = '#krok-21';

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

  /* The glossary footnote's one link out. Same reason the explainer link is
     tested: both hrefs are built from a content-collection id, which is a
     filename, so renaming the post breaks the link silently. */
  test('links to the post its glossary footnote defines', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await page.locator(`a[href="${HYGIENE}"]`).first().click();
    await page.waitForURL(/\/uk\/blog\/movna-hihiiena/);
    await expect(page.locator('h1')).toContainText('Мовна гігієна');
  });

  /* Scoped to `main`, because the header's «Для мови» menu also links the hub
     on every page — and it is the FIRST such anchor in the document, sitting
     inside a closed `<details>` where a click cannot reach it. The claim under
     test is about the guide page's own back-link, so the page is where it is
     asserted. */
  test('a page links back to the hub', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await page.locator(`main a[href="${INDEX}"]`).first().click();
    await page.waitForURL(/\/uk\/guide\/?$/);
  });

  test('a page stamps when its steps were last checked', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('time[datetime]').first()).toBeVisible();
  });
});

/**
 * User agents the diagnosis routes on. Written out rather than built, because
 * the routing they exercise is exactly the kind of thing a helper would hide:
 * on iOS every browser reads the system list, and Edge's UA also says Chrome.
 */
const AGENTS = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
} as const;

test.describe('guide — diagnosis: what is wrong', () => {
  test.use({ userAgent: AGENTS.chromeWindows });

  /*
   * The regression this whole model exists for. The checker it replaced walked
   * an ordered first-match table, so a browser asking for `['ru']` was told only
   * that Ukrainian was missing — never that Russian was what it was asking for.
   * Faults are independent now, so this list must produce BOTH rows.
   */
  test('a Russian-only list reports both faults, not the first one that matched', async ({
    page,
  }) => {
    await withLanguages(page, ['ru']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const problems = page.locator('[data-problems] article');
    await expect(problems).toHaveCount(2);
    await expect(problems.nth(0)).toContainText('Російська');
    await expect(problems.nth(1)).toContainText('Української немає');
    await expect(page.locator('[data-count]')).toContainText('2');
  });

  const CASES = [
    {
      name: 'Russian alongside Ukrainian first',
      languages: ['uk-UA', 'en', 'ru'],
      problems: 1,
      says: 'Російська',
    },
    {
      name: 'Ukrainian present but not first',
      languages: ['en-US', 'uk'],
      problems: 1,
      says: 'не перша',
    },
    {
      name: 'nothing but English',
      languages: ['en-US', 'en'],
      problems: 1,
      says: 'Української немає',
    },
    {
      name: 'Russian present AND Ukrainian not first — two faults that are not the ru-only pair',
      languages: ['en', 'uk', 'ru'],
      problems: 2,
      says: 'не перша',
    },
  ] as const;

  for (const { name, languages, problems, says } of CASES) {
    test(`reports ${name}`, async ({ page }) => {
      await withLanguages(page, [...languages]);
      await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('[data-problems] article')).toHaveCount(problems);
      await expect(page.locator('[data-problems]')).toContainText(says);
    });
  }

  /*
   * The explanation is picked from the fault SET, and the two-fault sets cannot
   * borrow a single-fault sentence: «українська стоїть першою» is false when
   * `notFirst` also holds, and the `notFirst` sentence never mentions Russian.
   */
  test('a doubly-wrong list does not borrow a sentence that contradicts it', async ({ page }) => {
    await withLanguages(page, ['en', 'uk', 'ru']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const explain = page.locator('[data-explain]');
    await expect(explain).toContainText('російська');
    await expect(explain).not.toContainText('стоїть першою');
  });

  test('a list already in the target state reports no problems at all', async ({ page }) => {
    await withLanguages(page, ['uk-UA', 'uk', 'en-US']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-count]')).toContainText('Усе гаразд');
    await expect(page.locator('[data-problems] article')).toHaveCount(1);
    await expect(page.locator('[data-problems]')).toContainText('Проблем немає');
    // The all-clear carries no steps: there is nothing to do.
    await expect(page.locator('[data-fix-steps]')).toHaveCount(0);
  });

  test('a browser that reports no languages says so instead of guessing', async ({ page }) => {
    await withLanguages(page, []);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-count]')).toContainText('Немає даних');
    await expect(page.locator('[data-languages]')).toContainText('браузер не каже');
  });
});

test.describe('guide — diagnosis: the language list', () => {
  test.use({ userAgent: AGENTS.chromeWindows });

  /*
   * `uk-UA` and `uk` are one claim. Numbering the raw tags would tell a reader
   * their list is longer than it is, and would rank Ukrainian second in a list
   * where it is plainly first.
   */
  test('collapses regional tags to one row per language', async ({ page }) => {
    await withLanguages(page, ['ru-RU', 'ru', 'en-US']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const chips = page.locator('[data-languages] li');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText('російська');
    await expect(chips.nth(1)).toContainText('англійська');
  });

  test('names languages rather than printing their codes', async ({ page }) => {
    await withLanguages(page, ['uk-UA', 'en-US']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const list = page.locator('[data-languages]');
    await expect(list).toContainText('українська');
    await expect(list).not.toContainText('uk-UA');
  });

  test('states the browser and the system plainly', async ({ page }) => {
    await withLanguages(page, ['uk']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-field-browser]')).toHaveText('Chrome');
    await expect(page.locator('[data-field-system]')).toHaveText('Windows');
  });
});

/*
 * The relevance contract, and the reason this suite carries five user agents.
 *
 * The fix a reader is shown must belong to the surface that actually owns their
 * language list. That is not always their browser: Safari has none of its own,
 * and on iOS no browser does — they all run on WebKit and read the system list.
 * Sending those readers to "your browser's settings" would send them somewhere
 * that does not exist, and nothing but this test would notice.
 */
test.describe('guide — diagnosis: the fix follows the platform', () => {
  const ROUTES = [
    {
      name: 'Chrome on Windows gets Chrome, with an address to paste',
      agent: AGENTS.chromeWindows,
      label: 'Chrome',
      address: 'chrome://settings/languages',
    },
    {
      name: 'Firefox on Windows gets Firefox, with its own address',
      agent: AGENTS.firefoxWindows,
      label: 'Firefox',
      address: 'about:preferences#general',
    },
    {
      name: 'Safari on macOS is sent to the system, not to Safari',
      agent: AGENTS.safariMac,
      label: 'у системі',
      address: null,
    },
    {
      name: 'Chrome on iOS is sent to the system too — every iOS browser reads it',
      agent: AGENTS.chromeIos,
      label: 'у системі',
      address: null,
    },
    {
      name: 'Chrome on Android keeps its own list',
      agent: AGENTS.chromeAndroid,
      label: 'Android',
      address: 'chrome://settings/languages',
    },
  ] as const;

  for (const { name, agent, label, address } of ROUTES) {
    test(name, async ({ browser }) => {
      const context = await browser.newContext({ userAgent: agent, locale: 'en-US' });
      const page = await context.newPage();
      await withLanguages(page, ['ru', 'en']);
      await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('[data-fix-label]').first()).toContainText(label);

      const steps = page.locator('[data-problems] article').first().locator('[data-fix-steps] li');
      expect(await steps.count(), 'a fix with no steps is a dead end').toBeGreaterThan(0);

      // A platform with no settings URL shows no address at all, rather than a
      // disabled stub — there is nothing for the reader to paste.
      const addresses = page.locator('[data-step-address-text]');
      await (address === null
        ? expect(addresses).toHaveCount(0)
        : expect(addresses.first()).toHaveText(address));

      await context.close();
    });
  }

  /*
   * The tag on the cards is what became of the platform-shortcut block that
   * used to sit under the checker — same `detectTokens` vocabulary, same
   * `data-match` attributes, shown on the cards that are already there rather
   * than as a second list of the same links.
   */
  test("marks the reader's own cards in the grid, and only those", async ({ browser }) => {
    const context = await browser.newContext({ userAgent: AGENTS.chromeWindows, locale: 'en-US' });
    const page = await context.newPage();
    await withLanguages(page, ['uk', 'en']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const tagged = page.locator('a[data-nav-label]:has([data-yours]:visible)');
    const labels = await tagged.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-nav-label') ?? ''),
    );

    expect(labels.toSorted()).toEqual(['Chrome', 'Windows']);
    await context.close();
  });

  test('tags nothing when it cannot tell what the reader is on', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'SomeCrawler/1.0', locale: 'en-US' });
    const page = await context.newPage();
    await withLanguages(page, ['uk']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-yours]:visible')).toHaveCount(0);
    await context.close();
  });

  test('every fix links out to the page it summarises, and that page resolves', async ({
    page,
    request,
  }) => {
    await withLanguages(page, ['ru']);
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const links = page.locator('[data-fix-link]');
    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? ''),
    );

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, 'a fix must link to a real guide page').toMatch(/^\/uk\/guide\//);
      expect((await request.get(href)).status(), `${href} should resolve`).toBe(200);
    }
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

/*
 * The install CTA, which this section grew three of: a strip closing the
 * diagnosis, the checklist's twenty-first row, and a callout on every page.
 * None of them has pixels the visual suite can judge — a CTA pointing at the
 * wrong place looks exactly like one pointing at the right place — so every
 * failure below is a silent one.
 */
test.describe('guide — install CTA', () => {
  const CHROME_STORE = /chromewebstore\.google\.com/;

  test('every CTA on the hub resolves, not just the first', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    const ctas = page.locator('[data-cta]');
    await expect(ctas).toHaveCount(2);

    // The regression this pins: `DownloadButtons`' script used to resolve a
    // single `querySelector('[data-cta]')`, which was correct for as long as
    // every caller owned its own page. On this hub the second button would have
    // stayed frozen on its SSR markup — enabled, green, and pointing at the
    // GitHub releases page instead of a store.
    for (const cta of await ctas.all()) {
      await expect(cta).toHaveAttribute('href', CHROME_STORE);
    }

    // An id may exist once per document, so the guide's CTAs opt out of it.
    await expect(page.locator('#download')).toHaveCount(0);
  });

  test('a page argues its own case, and argues it once', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });

    const callout = page.locator('[data-guide-callout]');
    await expect(callout).toBeVisible();
    // The hole this closed: twenty pages of instructions that never once named
    // the thing that handles the part instructions cannot reach.
    await expect(callout).toContainText('Мовар');
    await expect(callout.locator('[data-cta]')).toHaveAttribute('href', CHROME_STORE);

    // And exactly one button on the page — the closing block keeps only the
    // follow tier, so the callout is not answered by a second ask below it.
    await expect(page.locator('[data-cta]')).toHaveCount(1);
  });

  test('the twenty-first step is offered only once the twenty are done', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });

    // Asserted on the element's own `hidden`, not its visibility: the bar it
    // rides is itself revealed by scroll position, and that is not what this
    // covers.
    const shortcut = page.locator('[data-checklist-sticky-cta]');
    await expect(shortcut).toHaveAttribute('hidden', '');

    const boxes = page.locator('[data-checklist-item]');
    const total = await boxes.count();
    for (let index = 0; index < total; index += 1) await boxes.nth(index).check();

    await expect(page.locator('[data-checklist-progress]')).toHaveText(`${total} з ${total}`);
    await expect(shortcut).not.toHaveAttribute('hidden', '');

    // …and it lands somewhere: the row is the anchor's target.
    await expect(shortcut).toHaveAttribute('href', BEYOND_ROW);
    await expect(page.locator(BEYOND_ROW)).toBeVisible();
  });
});

test.describe('guide — without JavaScript', () => {
  // The claim in `GuideChecklist.astro` is that the list works before any script
  // runs, and the claim in `GuideChecker.astro` is that a no-JS visitor sees the
  // plain card grid rather than an empty diagnosis shell. Both are only true if
  // nothing here needs the island, so both are asserted with JS off.
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

    // …and the guide itself is fully readable regardless.
    await expect(page.locator('a[data-nav-label]').first()).toBeVisible();

    // The twenty-first row is plain markup, so it survives the same way the
    // twenty checkboxes do — the ask does not depend on the island either.
    await expect(page.locator('[data-checklist-sticky-cta]')).toBeHidden();
    await expect(page.locator(BEYOND_ROW)).toBeVisible();
    await expect(page.locator(BEYOND_ROW)).toContainText('Мовар');
  });

  test('a page still makes its case', async ({ page }) => {
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-guide-callout]')).toBeVisible();
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

/**
 * The homepage's door into the guide.
 *
 * Two of these three assertions exist to hold a design decision that a later
 * edit would find it very natural to undo. The section first shipped as a
 * tinted card carrying a red chip that counted the faults in the reader's
 * language list — a claim about your device, a problem count and one button,
 * which is the shape of scareware and a poor thing to build under a promise
 * that nothing leaves your browser. It now shows the list and says who
 * computed it, and grading that list stays on the hub, where the reader asked.
 *
 * So: the list renders, and no verdict vocabulary follows it home. The hub's
 * own «{n} проблема» strings are asserted absent by name rather than by
 * selector, because the way this comes back is somebody re-adding the count,
 * not somebody restoring the element that used to hold it.
 */
test.describe('guide — homepage section', () => {
  test.use({ locale: 'uk-UA' });

  test('shows the reader their own language list, and grades nothing', async ({ page }) => {
    await withLanguages(page, ['uk-UA', 'ru', 'en']);
    await page.goto('/uk/', { waitUntil: 'domcontentloaded' });

    const section = page.locator('#language-list');
    await expect(section.locator('[data-guide-languages] li')).toHaveCount(3);
    await expect(section).toContainText('українська');
    await expect(section).toContainText('російська');

    // Whose list, where it was read, and who did not see it — the three claims
    // that separate this from what it could be mistaken for, so they are
    // asserted rather than assumed.
    await expect(section).toContainText('ваш браузер');
    await expect(section).toContainText('поки ви читаєте цю сторінку');
    await expect(section).toContainText('не бачить');

    // No verdict, in any of the hub's three forms, and no count of faults.
    const body = (await section.textContent()) ?? '';
    expect(body).not.toMatch(/проблем/i);
    expect(body).not.toContain('Усе гаразд');
    expect(body).not.toContain('Немає даних');

    /*
     * And nobody on the receiving end. The browser tells SITES, and this one is
     * not among them — a line here that read «каже про вас нам» would be false
     * in the exact direction the product is a claim against, and it would sit
     * one line above the sentence promising Movar cannot see any of it.
     *
     * Tokenised rather than matched with `\b`, which in JavaScript is defined
     * over ASCII word characters and so never fires against Cyrillic: the
     * naive regex passes on text that contains the word.
     */
    const words = new Set(
      body
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter(Boolean),
    );
    expect(words.has('нам'), 'the section must not put this site on the receiving end').toBe(false);
    expect(words.has('нас')).toBe(false);

    // And one link out, not a button — the section closes the way its
    // neighbours do.
    await expect(section.locator(`a[href="${INDEX}"]`)).toHaveCount(1);
    await expect(section.locator('button')).toHaveCount(0);
  });

  /*
   * The evidence is the only progressive part, so with JS off the section has
   * to stand on its argument alone rather than leave an empty labelled shell
   * where the reader's list would be. JS off is also the only way to reach that
   * branch from here: the inline locale redirect reads the same
   * `navigator.languages`, so any list poor enough to produce no evidence
   * bounces the visitor to the English homepage before this section renders.
   */
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('drops the evidence and keeps the argument', async ({ page }) => {
      await page.goto('/uk/', { waitUntil: 'domcontentloaded' });

      await expect(page.locator('[data-guide-list]')).toBeHidden();
      await expect(page.locator('#language-list h2')).toBeVisible();
      await expect(page.locator(`#language-list a[href="${INDEX}"]`)).toBeVisible();
    });
  });
});
