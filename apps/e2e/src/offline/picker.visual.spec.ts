/**
 * Language-picker surface baselines — the layout that has pixels.
 *
 * `LAYOUT_SURFACES` in apps/extension/src/lib/picker-filter.ts gives each
 * picker shape one way to explain the gap Movar leaves behind:
 *
 *   list   → an in-row chip standing where the hidden entry was  ← here
 *   inline → a tooltip on each survivor                          ← tooltip.visual
 *   native → the blocked `<option>`, disabled and relabelled in place
 *
 * Only the first two can be photographed. The third deliberately draws nothing
 * on the page: its mark IS the option's label, and a native `<select>`'s popup
 * is rendered by the OS rather than the page compositor, so Playwright's
 * screenshot never contains it. There is no camera angle from which that
 * surface exists — which is the point of it — so it is pinned by DOM assertions
 * in picker-native.behavior.spec.ts instead. This spec used to carry four
 * baselines of the floating badge that preceded it; they went with the badge.
 *
 * The chip is here because it is a real overlay drawn into the page, and
 * because it draws from the same token bundles through the same curtain shell
 * that shipped tooltip.ts's dark-mode defect — a card at `--surface` sinking
 * into a dark host page while its action button kept the light `:host`
 * defaults, with every structural assertion staying green.
 *
 * Same offline contract as content-script.spec.ts: the fixture is served via
 * `context.route` and the REAL picker filter runs against it — `defaultSettings`
 * blocks `ru`, so the Russian row is hidden and the chip takes its slot. The
 * fixture is a Ukrainian page, not a Russian one, for the reason
 * picker-survivor-uk gives: the filter strips blocked entries whatever language
 * the page is in, so this tells the true product story rather than showing a
 * wholly-Russian page Movar appears to have ignored.
 *
 * The dark companion emulates `prefers-color-scheme: dark`; the fixture then
 * paints as a dark host page (its `@media` block flips `color-scheme` + bg), so
 * `page-mode` reads `dark` and the orchestrator schemes the host. It guards the
 * host's own `data-movar-color-scheme` first, so a LIGHT rendering can never be
 * silently baked under a dark filename (mirrors the curtain and tooltip
 * dark-skin guards).
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

const CHIP = '[data-movar-kind="picker-entry"]';

/** The listbox fixture's popover column plus its page heading, with no room to
 *  spare — the chip has to read as one row among the rest, so the baseline is
 *  worth nothing if the neighbouring rows are cropped out of it. */
const LIST_VIEWPORT = { width: 460, height: 420 };

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
