/**
 * Safari host-app STICKY-NAV visual spec — the `HostLayout` component's own
 * "the tab bar stays pinned to the bottom" behaviour proof.
 *
 * Sibling of `safari-host-app.visual.spec.ts` (appearance parity, `fit:
 * 'content'` hug — no baseline here overlaps with that suite: this spec's job
 * is exclusively to prove the PINNING mechanic, not to re-cover any tab's
 * appearance). Both use the same `openHostApp` fixture; this one explicitly
 * passes `fit: 'viewport'` so every capture uses the SAME fixed, generously
 * -tall {@link HOST_VIEWPORT} instead of hugging content — a hugged capture
 * would always show the tab bar flush against the content's bottom edge by
 * construction, which proves nothing about whether it's actually `position:
 * fixed` (pinned to the viewport) vs. just flowing after the content (which
 * would look identical for the short case and WRONG — scrolled out of view —
 * for the tall case).
 *
 * Two real production states stand in for "minimal short content" and "tall /
 * overflowing content" — no synthetic DOM is injected (the e2e suite never
 * does this for the host app; every capture drives real React state via the
 * mocked `show()` bridge, exactly like the main visual suite):
 *   - **short** — the About tab, pre-`show()` (`state === null`), English:
 *     the shortest real state (lede + features + trust row + footer links, no
 *     enablement banner — see `AboutTab.tsx`), ~760px of natural content at
 *     the 16px-base type scale — comfortably under {@link HOST_VIEWPORT}'s
 *     1320px. At the fixed tall viewport this leaves empty space between the
 *     content and the tab bar — proving the bar sticks to the viewport bottom
 *     rather than floating up under the content;
 *   - **tall** — the Settings tab (the fixture's `HOST_SETTINGS`: 3-language
 *     priority list + ConcealModeField + allowlist chip + locked-language
 *     note), Ukrainian: the tallest real state, and specifically the
 *     Ukrainian strings push it to ~1380px of natural content — genuinely
 *     past {@link HOST_VIEWPORT}'s 1320px (the English Settings copy, at
 *     ~1315px, does not reliably overflow), so this is a real overflow case,
 *     not a coincidentally-tall one. Proves content scrolls under the fixed
 *     bars while the tab bar stays visible, pinned at the bottom, rather than
 *     being pushed off-screen by the overflow.
 *
 * One color scheme (light) — the dark-mode axis is the main visual suite's
 * job; this spec only needs to demonstrate the pinning behaviour, which
 * doesn't vary by color scheme. The two cases deliberately use different
 * locales (en for short, uk for tall) because that pairing is what actually
 * produces a genuine under-fill vs. overflow at the one shared viewport —
 * not a locale/appearance axis to cover.
 */
import { expect, HOST_VIEWPORT, hostRoot, openHostApp, test } from '../fixtures/host';

test.describe('safari host-app — sticky nav (HostLayout pinning)', () => {
  test('short content — tab bar pinned at the viewport bottom, empty space above', async ({
    hostContext,
  }) => {
    const page = await openHostApp(hostContext, {
      locale: 'en-US',
      tab: 'about',
      show: null,
      fit: 'viewport',
    });

    // Sanity-check the premise: the content is shorter than the viewport, so
    // a non-fixed tab bar would end up floating directly under the content —
    // NOT at the bottom of the frame. `hasVerticalOverflow` false confirms
    // there's genuine empty space for the bar to (wrongly) not fill.
    const hasOverflow = await page.evaluate(() => document.body.scrollHeight > window.innerHeight);
    expect(hasOverflow).toBe(false);

    const tabsBox = await page.locator('.tabs').boundingBox();
    expect(tabsBox).not.toBeNull();
    // Pinned to the viewport's bottom edge, not the content's.
    expect(tabsBox!.y + tabsBox!.height).toBeCloseTo(HOST_VIEWPORT.height, 0);

    await expect(hostRoot(page)).toHaveScreenshot('safari-host-app-sticky-nav-short-en.png');
    await page.close();
  });

  test('tall / overflowing content — content scrolls, tab bar still pinned at the bottom', async ({
    hostContext,
  }) => {
    // Ukrainian, not English: the Settings tab's Ukrainian copy is what
    // actually pushes its natural height (~1380px) past HOST_VIEWPORT's
    // 1320px — the English copy (~1315px) does not reliably overflow. See the
    // file-level comment.
    const page = await openHostApp(hostContext, {
      locale: 'uk-UA',
      tab: 'settings',
      show: null,
      fit: 'viewport',
    });

    // Sanity-check the premise: the Settings tab's content genuinely
    // overflows the fixed viewport, so this exercises the "content scrolls
    // under the fixed bars" path, not just a coincidentally-short fit.
    const hasOverflow = await page.evaluate(() => document.body.scrollHeight > window.innerHeight);
    expect(hasOverflow).toBe(true);

    const tabsBox = await page.locator('.tabs').boundingBox();
    expect(tabsBox).not.toBeNull();
    // Still pinned to the viewport's bottom edge, not pushed off-screen by
    // the overflowing content above it.
    expect(tabsBox!.y + tabsBox!.height).toBeCloseTo(HOST_VIEWPORT.height, 0);

    await expect(hostRoot(page)).toHaveScreenshot('safari-host-app-sticky-nav-tall-uk.png');
    await page.close();
  });
});
