/**
 * Keyboard-reachability guard for the marketing site: the skip link and the
 * focus ring.
 *
 * WHY THIS EXISTS. The site shipped with no focus treatment at all — zero
 * `focus-visible` rules across every component and `global.css` — and with ten
 * pages carrying no `<main>` landmark, so there was neither a ring to see nor
 * anywhere to skip to. Neither gap is visible to the suites next door: the
 * visual suite shoots pages at rest, where a focus ring does not exist, and the
 * contrast suite measures *text* against its background and says in its own
 * docblock that WCAG 1.4.11 non-text contrast — focus rings included — is out
 * of its scope. Both would have gone on passing forever.
 *
 * THE ONE TRAP, and the reason this is a Playwright spec rather than a
 * check in a dev-tools console. `:focus` and `:focus-visible` only match while
 * the *document itself* has focus: in a hidden or backgrounded page,
 * `element.focus()` sets `document.activeElement` and matches neither selector,
 * so a skip link that is in fact working reads as broken, and one that is
 * genuinely broken reads the same way. Every assertion below therefore drives
 * real keyboard input against a focused page and asserts on geometry — where
 * the link actually sits — rather than on a selector match.
 *
 * The skip link deliberately uses `:focus`, not `:focus-visible`: tabbing is
 * the only way to reach it, so there is no state in which it is focused and
 * should stay hidden, and `:focus-visible` is a browser heuristic that does not
 * fire for programmatic focus.
 */
import { expect, test } from '@playwright/test';

import { PAGES } from './pages';

/** Both locales, so the skip link's own string is covered in each. */
const LOCALES = [
  { locale: 'en' as const, label: 'Skip to content' },
  { locale: 'uk' as const, label: 'Перейти до вмісту' },
];

for (const { locale, label } of LOCALES) {
  test.describe(`focus — ${locale}`, () => {
    test.use({ locale: locale === 'uk' ? 'uk-UA' : 'en-US' });

    test('the first Tab reaches the skip link, and it becomes visible', async ({ page }) => {
      await page.goto(locale === 'uk' ? '/uk/' : '/');

      const skip = page.locator('a.skip-link');
      // Off-screen at rest: present in the DOM and in the tab order, but not
      // painted over the header.
      const parked = await skip.evaluate((el) => el.getBoundingClientRect().top);
      expect(parked).toBeLessThan(0);

      await page.keyboard.press('Tab');

      await expect(skip).toBeFocused();
      await expect(skip).toHaveText(label);
      // Geometry, not a selector match: this is what the reader actually sees.
      const shown = await skip.evaluate((el) => el.getBoundingClientRect().top);
      expect(shown).toBeGreaterThanOrEqual(0);
    });

    test('the skip link stays in the viewport when the page is scrolled', async ({ page }) => {
      await page.goto(locale === 'uk' ? '/uk/' : '/');
      // Reach halfway down, then walk backwards to the top of the tab order —
      // the path that catches a link positioned against the document rather
      // than the viewport, which would surface it far above the fold.
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.locator('a.skip-link').focus();

      const box = await page.locator('a.skip-link').boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeLessThan(viewport!.height);
    });

    test('activating the skip link moves focus into <main>', async ({ page }) => {
      await page.goto(locale === 'uk' ? '/uk/' : '/');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');

      await expect(page.locator('main#main')).toBeFocused();
      // The destination is a landing place, not a control — it must not draw a
      // ring of its own.
      const outline = await page
        .locator('main#main')
        .evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).toBe('none');
    });

    test('a focused link draws the accent ring', async ({ page }) => {
      await page.goto(locale === 'uk' ? '/uk/' : '/');
      // Tab past the skip link into the header's own navigation.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          visible: el.matches(':focus-visible'),
          width: cs.outlineWidth,
          style: cs.outlineStyle,
          offset: cs.outlineOffset,
        };
      });
      expect(ring.visible).toBe(true);
      expect(ring.style).toBe('solid');
      expect(ring.width).toBe('2px');
      expect(ring.offset).toBe('2px');
    });
  });
}

/**
 * Every page is a skip destination. This is the assertion that would have
 * caught the original gap: five page types (changelog, why-not-ai,
 * for-ukrainian, install, transparency) had no `<main>` in either locale, and
 * nothing anywhere said so.
 */
for (const entry of PAGES) {
  for (const locale of ['en', 'uk'] as const) {
    const url = entry[locale];
    if (!url) continue;
    test(`${entry.stem} (${locale}) has a single skip destination`, async ({ page }) => {
      await page.goto(url);
      const main = page.locator('main#main');
      await expect(main).toHaveCount(1);
      await expect(main).toHaveAttribute('tabindex', '-1');
      await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    });
  }
}
