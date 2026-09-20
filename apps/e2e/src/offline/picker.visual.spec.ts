/**
 * Language-picker surface baselines — the two layouts that had no pixels.
 *
 * `LAYOUT_SURFACES` in apps/extension/src/lib/picker-filter.ts gives each
 * picker shape exactly one surface to explain the gap Movar leaves behind:
 *
 *   list   → an in-row chip standing where the hidden entry was
 *   native → a badge floating beside a control it cannot mark inside
 *   inline → a tooltip on each survivor
 *
 * Only the third had a committed baseline (tooltip.visual.spec.ts). The other
 * two were guarded by DOM-shape and geometry specs — picker-listbox.behavior
 * and picker-badge.behavior — which assert where these surfaces are and how big
 * they are, and by construction cannot see what they look like. That is the gap
 * tooltip.ts shipped a dark-mode defect through: a card sitting at `--surface`
 * (#1c1917) sank into a dark host page while its action button kept the light
 * `:host` defaults, and every structural assertion stayed green. The chip and
 * the badge draw from the same token bundles through the same curtain shell, so
 * they were one token edit away from the same class of regression.
 *
 * Six baselines, light + dark for each state:
 *
 *   picker-entry-chip        the chip in a hidden listbox row
 *   picker-control-badge     the badge at rest beside a `<select>`
 *   picker-control-badge-hover  the badge expanded to its label
 *
 * The badge gets two states because it has two: at rest it is a bare mark, and
 * only on hover does it say what it is. Both are what a visitor sees, and the
 * expansion crosses a `max-width` transition — the shape most likely to break
 * silently.
 *
 * Same offline contract as content-script.spec.ts: each fixture is served via
 * `context.route` and the REAL picker filter runs against it — `defaultSettings`
 * blocks `ru`, so the Russian entry is hidden and the layout's own surface
 * mounts. Both fixtures are Ukrainian pages, not Russian ones, for the reason
 * picker-survivor-uk gives: the filter strips blocked entries whatever language
 * the page is in, so this tells the true product story rather than showing a
 * wholly-Russian page Movar appears to have ignored.
 *
 * The dark companions emulate `prefers-color-scheme: dark`; both fixtures then
 * paint as dark host pages (their `@media` blocks flip `color-scheme` + bg), so
 * `page-mode` reads `dark` and the orchestrator schemes the host. Each dark test
 * guards the host's own `data-movar-color-scheme` first, so a LIGHT rendering
 * can never be silently baked under a dark filename (mirrors the curtain and
 * tooltip dark-skin guards).
 *
 * What is deliberately NOT here: the flush-right badge, whose hovered form has
 * to flip to the leading side to stay on screen. That is a measurement, it is
 * asserted in viewport coordinates by picker-badge.behavior.spec.ts, and a
 * pixel baseline would re-pin it far less precisely.
 *
 * Baselines are Linux PNGs generated in the pinned Playwright container via
 * `pnpm e2e:baselines picker.visual.spec.ts` — the same image CI's
 * `e2e-offline` job compares against. Don't run `:update` on a macOS host (it
 * writes a `*-darwin.png` CI does not use).
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

const LISTBOX_URL = 'https://mocked-picker-listbox-visual.example.test/';
const SELECT_URL = 'https://mocked-picker-select-visual.example.test/';

const CHIP = '[data-movar-kind="picker-entry"]';
const BADGE = '[data-movar-kind="picker-badge"]';

/** The listbox fixture's popover column plus its page heading, with no room to
 *  spare — the chip has to read as one row among the rest, so the baseline is
 *  worth nothing if the neighbouring rows are cropped out of it. */
const LIST_VIEWPORT = { width: 460, height: 420 };
/** The select fixture is a header bar over two paragraphs. Short enough that
 *  the badge is a real part of the frame rather than a speck in a page. */
const SELECT_VIEWPORT = { width: 520, height: 300 };

/**
 * Serve `fixture` at `url`, run the real content script over it, and return
 * once Movar has stopped touching the page.
 *
 * `route.hits` guards the "URL typo → 404 → nothing hidden → baseline of an
 * empty page" mode every sibling spec guards; `hiddenLinkCount` guards its
 * quieter cousin, where the page loads but the filter never fires and the
 * baseline bakes a picker with nothing hidden in it.
 */
async function openPicker(
  movarContext: BrowserContext,
  movarPage: Page,
  fixture: string,
  url: string,
  viewport: { width: number; height: number },
): Promise<void> {
  await movarPage.setViewportSize(viewport);
  const route = await mockSite(movarContext, `${url}**`, fixture);

  await movarPage.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

  expect(route.hits).toBeGreaterThanOrEqual(1);
  const state = await readMovarDomState(movarPage);
  expect(state.hiddenLinkCount).toBe(1);
}

/**
 * Hover the CONTROL — the badge is `pointer-events: none` and cannot feel a
 * hover of its own — and wait for the label to finish animating out.
 *
 * Polling the width to a fixed point rather than waiting a duration: the
 * `max-width` transition is `duration.slow`, and on the emulated-amd64 host
 * these baselines are generated on, a guessed sleep is either flaky or wasted.
 * `toHaveScreenshot`'s own `animations: 'disabled'` would finish the transition
 * anyway; settling first means the two-shot handshake starts from a still frame
 * instead of racing it.
 */
async function hoverControl(movarPage: Page): Promise<void> {
  await movarPage.locator('#lang-select').hover();
  await expect(movarPage.locator(BADGE)).toHaveAttribute('data-expanded', 'true');
  let last = -1;
  await expect
    .poll(async () => {
      const width = await movarPage
        .locator(BADGE)
        .evaluate((el) => el.getBoundingClientRect().width);
      const settled = width === last && width > 0;
      last = width;
      return settled;
    })
    .toBe(true);
}

test.describe('list layout — the in-row chip', () => {
  test('chip renders its light skin', async ({ movarContext, movarPage }) => {
    await openPicker(movarContext, movarPage, 'picker-listbox-ru', LISTBOX_URL, LIST_VIEWPORT);

    // The list branch, asserted rather than assumed: a chip in the row and not
    // one survivor tooltip anywhere. A layout misverdict would otherwise bake a
    // baseline of the wrong surface entirely.
    const state = await readMovarDomState(movarPage);
    expect(state.pickerEntryCurtainCount).toBe(1);
    await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(0);
    await expect(movarPage.locator(CHIP)).toHaveAttribute('data-movar-color-scheme', 'light');

    await expect(movarPage).toHaveScreenshot('picker-entry-chip.png');
  });

  test('chip renders its dark skin over a dark page', async ({ movarContext, movarPage }) => {
    await movarPage.emulateMedia({ colorScheme: 'dark' });
    await openPicker(movarContext, movarPage, 'picker-listbox-ru', LISTBOX_URL, LIST_VIEWPORT);

    const state = await readMovarDomState(movarPage);
    expect(state.pickerEntryCurtainCount).toBe(1);
    await expect(movarPage.locator(CHIP)).toHaveAttribute('data-movar-color-scheme', 'dark');

    await expect(movarPage).toHaveScreenshot('picker-entry-chip-dark.png');
  });
});

test.describe('native layout — the control badge', () => {
  test('badge renders its light skin at rest', async ({ movarContext, movarPage }) => {
    await openPicker(movarContext, movarPage, 'picker-select-uk', SELECT_URL, SELECT_VIEWPORT);

    // The native branch: a badge beside the control, and neither of the other
    // two layouts' surfaces anywhere on the page.
    const state = await readMovarDomState(movarPage);
    expect(state.pickerBadgeCount).toBe(1);
    expect(state.pickerEntryCurtainCount).toBe(0);
    await expect(movarPage.locator(BADGE)).toHaveAttribute('data-movar-color-scheme', 'light');

    await expect(movarPage).toHaveScreenshot('picker-control-badge.png');
  });

  test('badge renders its dark skin at rest over a dark page', async ({
    movarContext,
    movarPage,
  }) => {
    await movarPage.emulateMedia({ colorScheme: 'dark' });
    await openPicker(movarContext, movarPage, 'picker-select-uk', SELECT_URL, SELECT_VIEWPORT);

    const state = await readMovarDomState(movarPage);
    expect(state.pickerBadgeCount).toBe(1);
    await expect(movarPage.locator(BADGE)).toHaveAttribute('data-movar-color-scheme', 'dark');

    await expect(movarPage).toHaveScreenshot('picker-control-badge-dark.png');
  });

  test('badge renders its light skin expanded to its label', async ({
    movarContext,
    movarPage,
  }) => {
    await openPicker(movarContext, movarPage, 'picker-select-uk', SELECT_URL, SELECT_VIEWPORT);
    await hoverControl(movarPage);

    await expect(movarPage.locator(BADGE)).toHaveAttribute('data-movar-color-scheme', 'light');

    await expect(movarPage).toHaveScreenshot('picker-control-badge-hover.png');
  });

  test('badge renders its dark skin expanded to its label', async ({ movarContext, movarPage }) => {
    await movarPage.emulateMedia({ colorScheme: 'dark' });
    await openPicker(movarContext, movarPage, 'picker-select-uk', SELECT_URL, SELECT_VIEWPORT);
    await hoverControl(movarPage);

    await expect(movarPage.locator(BADGE)).toHaveAttribute('data-movar-color-scheme', 'dark');

    await expect(movarPage).toHaveScreenshot('picker-control-badge-hover-dark.png');
  });
});
