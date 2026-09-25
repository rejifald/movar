import { expect, test } from '@playwright/test';

/**
 * The studio band's content contract: `StudioBand.astro` renders on every
 * page (`Footer.astro` renders it as a sibling, right after `</footer>` —
 * see `AGENTS.md` "The studio band"), with the right links, in the page's
 * own language, and with no ask — movar.fyi's `ask` is `null` in both
 * `src/data/studio-band.{en,uk}.json` (Movar is non-commercial and runs no
 * ads; anatomy.md §2 "the ask"). The visual suite (`marketing.visual.spec.ts`)
 * pins pixels; this pins the data and structure underneath them, so a
 * malformed data file, a wrong href, or the band drifting inside `<footer>`
 * is a failing assertion instead of something only a diff would catch.
 *
 * `/` and `/uk/` only: `Footer.astro` — and so the band — renders on every
 * page, but its markup is identical everywhere (same as the footer/header
 * baselines' own "shot once" reasoning), so the home page in each locale is
 * the representative sample.
 */

interface Expectation {
  path: string;
  lang: string;
  localeTag: string;
  title: string;
  allLabel: string;
  relatedName: string;
  relatedTagline: string;
}

const PAGES: readonly Expectation[] = [
  {
    path: '/',
    lang: 'en',
    localeTag: 'en-US',
    title: 'Other projects by the studio',
    allLabel: 'All projects',
    relatedName: 'Langtell',
    relatedTagline: 'Tell me the language.',
  },
  {
    path: '/uk/',
    lang: 'uk',
    localeTag: 'uk-UA',
    title: 'Інші проєкти студії',
    allLabel: 'Усі проєкти',
    relatedName: 'Langtell',
    relatedTagline: 'Визначає мову коротких текстів і показує, чому саме так.',
  },
];

for (const expectation of PAGES) {
  test.describe(`the studio band on ${expectation.path}`, () => {
    // Pinned the same way `marketing.a11y-focus.spec.ts` pins it:
    // `BaseLayout`'s inline locale-redirect script reads the browser's own
    // language and bounces a mismatched visitor between `/` and `/uk/` — an
    // unpinned `en-US` default would silently redirect `/uk/` back to `/`
    // before any assertion below ran, and the failure would read as a wrong
    // `lang` rather than as what it actually was: the wrong page.
    test.use({ locale: expectation.localeTag });

    test('renders with the right links, language and no ask', async ({ page }) => {
      await page.goto(expectation.path, { waitUntil: 'domcontentloaded' });

      expect(new URL(page.url()).pathname, 'the locale-redirect script must not have fired').toBe(
        expectation.path,
      );

      const band = page.locator('#studio-band');
      await expect(band).toHaveAttribute('lang', expectation.lang);

      // A sibling after the footer, not inside it (anatomy.md §6) — a CSS
      // adjacent-sibling match is the whole proof: it can only match when
      // #studio-band is the element immediately following </footer>.
      await expect(page.locator('footer + #studio-band')).toHaveCount(1);

      // The heading reads "<title> Oleks Crane" — the title text plus the
      // wordmark link's accessible name, one heading (anatomy.md §5).
      const heading = band.locator('#studio-band-title');
      await expect(heading).toHaveAccessibleName(`${expectation.title} Oleks Crane`);

      const studioLink = band.getByRole('link', { name: 'Oleks Crane' });
      await expect(studioLink).toHaveAttribute('href', 'https://olekscrane.com/work/movar');

      const allLink = band.getByRole('link', { name: expectation.allLabel });
      await expect(allLink).toHaveAttribute('href', 'https://olekscrane.com/work');

      const relatedLink = band.getByRole('link', { name: expectation.relatedName });
      await expect(relatedLink).toHaveAttribute('href', 'https://olekscrane.com/work/langtell');
      await expect(relatedLink).toHaveAccessibleName(
        `${expectation.relatedName} ${expectation.relatedTagline}`,
      );

      // No ask on movar.fyi: the data file's `ask` is null in both locales,
      // so the only three links are the wordmark, "All projects", and the
      // one related item — a 4th would mean an ask rendered.
      await expect(band.getByRole('link', { name: /discuss/i })).toHaveCount(0);
      await expect(band.locator('a')).toHaveCount(3);
      await expect(band.locator('li a')).toHaveCount(1);

      // Same-tab links: no `target` or `rel`, so olekscrane.com still sees
      // this site as the referrer (anatomy.md §2 "Links open in the same
      // tab").
      for (const link of await band.locator('a').all()) {
        await expect(link).not.toHaveAttribute('target');
        await expect(link).not.toHaveAttribute('rel');
      }
    });
  });
}
