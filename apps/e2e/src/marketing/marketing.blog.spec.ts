/**
 * Behaviour coverage for the blog — the parts of a Ukrainian-only section that
 * have no pixels for the visual suite next door to catch.
 *
 * Two things here are load-bearing and both fail silently:
 *
 *  1. **The locale redirect must not fire.** Every other page on this site
 *     ships in both locales, and `BaseLayout` runs an inline
 *     `navigator.languages` script that moves a visitor between `/` and `/uk/`
 *     accordingly. The blog has no English twin, so that script is switched off
 *     for it (`localeAlternates={false}`). Switch it back on — or forget the
 *     prop on a new post template — and every English-preferring visitor who
 *     opens a shared article link is bounced to a `/blog/…` URL that does not
 *     exist. The visual suite cannot see this: it pins `locale` to `uk-UA`
 *     precisely so the redirect never runs. So these tests pin `en-US` instead,
 *     which is the exact condition that breaks.
 *
 *  2. **The feed must be well-formed XML.** `rss.xml.ts` builds the document by
 *     string concatenation with a hand-written `escapeXml`, which is cheap and
 *     correct right up until a post title contains an ampersand. Parsing the
 *     built feed is what keeps that honest, and it is why the endpoint needs no
 *     unit test (this app has no vitest project on purpose — adding one would
 *     pull `.astro` files into the coverage denominator).
 *
 * Runs against the same `astro preview` server as the visual suite — see
 * `playwright.marketing.config.ts`.
 */
import { expect, test } from '@playwright/test';

const INDEX = '/uk/blog';
const POST = '/uk/blog/tykha-kapitulyatsiya';
const FEED = '/uk/blog/rss.xml';

/**
 * An English-preferring browser, which is what makes these assertions
 * meaningful: on any two-locale page this locale would trigger the inline
 * redirect out of `/uk/`.
 */
test.use({ locale: 'en-US' });

test.describe('blog — Ukrainian-only routing', () => {
  for (const [name, path] of [
    ['index', INDEX],
    ['post', POST],
  ] as const) {
    test(`${name} does not bounce an English-preferring visitor out of /uk/`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Give the inline redirect a chance to run before asserting it didn't.
      await page.waitForLoadState('networkidle');

      expect(new URL(page.url()).pathname).toMatch(/^\/uk\/blog/);
      await expect(page.locator('h1')).toBeVisible();
    });
  }

  test('post advertises no hreflang alternate to a page that does not exist', async ({ page }) => {
    await page.goto(POST, { waitUntil: 'domcontentloaded' });

    // A single-locale page is canonical to itself and claims no twin.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/uk\/blog\/tykha-kapitulyatsiya\/?$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });

  /* The back-link is looked up under `main`: the header's «Для мови» menu links
     the blog index from every page, and it is the first such anchor in the
     document — inside a closed `<details>`, so it is not clickable. The claim
     here is that the POST links back, so the post's own body is the scope. */
  test('index links to the post, and the post links back', async ({ page }) => {
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });
    await page.locator(`a[href="${POST}"]`).first().click();
    await page.waitForURL(/\/uk\/blog\/tykha-kapitulyatsiya/);

    await expect(page.locator('h1')).toContainText('Тиха капітуляція');
    await page.locator(`main a[href="${INDEX}"]`).first().click();
    await page.waitForURL(/\/uk\/blog\/?$/);
  });
});

test.describe('blog — RSS feed', () => {
  test('is well-formed XML and lists the published post', async ({ page, request }) => {
    const response = await request.get(FEED);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
    const body = await response.text();

    // Parse with a real XML parser rather than pattern-matching the string: a
    // broken escape is exactly the failure that still greps fine and breaks
    // every reader. `DOMParser` reports one by returning a `parsererror`
    // element instead of throwing, so that is what gets asserted.
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });
    const feed = await page.evaluate((xml) => {
      const document_ = new DOMParser().parseFromString(xml, 'application/xml');
      const failure = document_.querySelector('parsererror');
      if (failure) return { error: failure.textContent, items: [] };

      return {
        error: null,
        items: [...document_.querySelectorAll('item')].map((item) => ({
          title: item.getElementsByTagName('title')[0]?.textContent ?? '',
          link: item.getElementsByTagName('link')[0]?.textContent ?? '',
          guid: item.getElementsByTagName('guid')[0]?.textContent ?? '',
          pubDate: item.getElementsByTagName('pubDate')[0]?.textContent ?? '',
        })),
      };
    }, body);

    expect(feed.error, 'feed is not well-formed XML').toBeNull();
    expect(feed.items.length).toBeGreaterThan(0);

    // Every published post is listed. Asserted by membership rather than by
    // position: the feed is newest-first, so pinning index 0 to a title makes
    // the next post to be published break this test instead of the feed.
    const titles = feed.items.map((item) => item.title);
    expect(titles.some((title) => title.includes('Тиха капітуляція'))).toBe(true);

    for (const item of feed.items) {
      expect(item.pubDate, 'pubDate must be RFC-822 for readers to sort on').toMatch(
        /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/,
      );
    }

    // Newest first, so a reader's client shows the latest post at the top.
    const dates = feed.items.map((item) => Date.parse(item.pubDate));
    expect(dates).toEqual(dates.toSorted((a, b) => b - a));

    // Each item's link must be the post's canonical URL — absolute, and with
    // the trailing slash Astro's directory routes (and `rel=canonical`) use.
    // A feed `guid` that disagrees with canonical splits one post across two
    // URLs for anyone who follows the link and then finds the page again.
    for (const item of feed.items) {
      expect(item.link).toMatch(/^https:\/\/movar\.fyi\/uk\/blog\/.+\/$/);
      expect(item.guid).toBe(item.link);
    }
  });
});

/*
 * Article charts are inline SVG generated by
 * `apps/marketing/scripts/gen-article-charts.mts`, and their layout is
 * arithmetic — there is no flexbox and nothing measures text, so a label that
 * grows simply runs off the frame or lands on its neighbour. Nothing else in
 * the toolchain can see that: the generator is happy to emit it, the markup is
 * valid, and the freshness check only compares bytes.
 *
 * A browser is the only thing that knows how wide «Але з іншого боку…» actually
 * is, which is why this lives in e2e. Both failures below were real during the
 * SVG rewrite — a caption 43px past the right edge, and source lines drawn
 * through the axis labels.
 */
const CHART_POSTS = ['/uk/blog/tykha-kapitulyatsiya', '/uk/blog/movu-rakhuyut'] as const;

test.describe('blog — chart geometry', () => {
  for (const postPath of CHART_POSTS) {
    test(`${postPath} charts keep their text inside the frame and off each other`, async ({
      page,
    }) => {
      await page.goto(postPath, { waitUntil: 'domcontentloaded' });
      // Glyph widths depend on the real face, so a fallback would measure a
      // different chart than the one readers see.
      await page.evaluate(async () => document.fonts.ready);
      await expect(page.locator('.article-prose svg.m-chart').first()).toBeVisible();

      const report = await page.evaluate(() => {
        const TOLERANCE = 2;
        return [...document.querySelectorAll('.article-prose svg.m-chart')].map((svg) => {
          const view = (svg as SVGSVGElement).viewBox.baseVal;
          const boxes = [...svg.querySelectorAll('text')].map((node) => {
            const box = (node as SVGGraphicsElement).getBBox();
            return {
              text: node.textContent.slice(0, 40),
              left: box.x,
              top: box.y,
              right: box.x + box.width,
              bottom: box.y + box.height,
            };
          });

          const outside = boxes
            .filter(
              (b) =>
                b.left < -TOLERANCE ||
                b.top < -TOLERANCE ||
                b.right > view.width + TOLERANCE ||
                b.bottom > view.height + TOLERANCE,
            )
            .map((b) => b.text);

          const collisions: string[] = [];
          for (const [i, a] of boxes.entries()) {
            for (const b of boxes.slice(i + 1)) {
              const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (overlapX > TOLERANCE && overlapY > TOLERANCE) {
                collisions.push(`${a.text} ⨯ ${b.text}`);
              }
            }
          }

          return {
            label: (svg.getAttribute('aria-label') ?? '').slice(0, 40),
            outside,
            collisions,
          };
        });
      });

      expect(report.length).toBeGreaterThan(0);
      for (const chart of report) {
        expect(chart.outside, `text outside the frame in «${chart.label}»`).toEqual([]);
        expect(chart.collisions, `overlapping text in «${chart.label}»`).toEqual([]);
      }
    });
  }
});
