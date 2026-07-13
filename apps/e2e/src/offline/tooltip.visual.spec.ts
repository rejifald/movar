/**
 * Survivor-tooltip visual baselines — light + dark.
 *
 * The survivor tooltip (apps/extension/src/lib/tooltip.ts) is the curtain's
 * sibling injected overlay: a shadow-DOM card the picker filter attaches to a
 * surviving language link when it hides that link's blocked-language siblings.
 * Unlike the curtain it had NO committed pixel baseline, so its dark skin was
 * unguarded — and it shipped a real dark-mode defect the light rendering can't
 * show: under `data-movar-color-scheme="dark"` the card sat at `--surface`
 * (#1c1917, the bottom of the warm-stone ramp) and sank into a dark host page,
 * while the action button kept the light `:host` defaults (near-white surface
 * under near-white `ink-strong` text). These two baselines pin the fixed skin
 * so a regression in either mode lands as a pixel diff.
 *
 * Same offline contract as content-script.spec.ts: the `picker-survivor-ru`
 * fixture is served via `context.route`, and the REAL picker filter runs —
 * `defaultSettings` blocks `ru`, so the ru anchor is hidden and the uk + en
 * survivors each get a tooltip (two survivors is the annotate-links branch, not
 * the container-curtain one). Hovering a survivor opens its tooltip; the
 * orchestrator colour-schemes it from the detected page mode.
 *
 * The dark companion emulates `prefers-color-scheme: dark` — the fixture then
 * paints as a dark host page (its `@media` block flips `color-scheme` + bg), so
 * `page-mode` reads `dark` and the tooltip mounts its dark skin. Each test
 * guards that the open host carries the scheme it should, so a LIGHT rendering
 * can never be silently baked under the dark filename (mirrors the curtain
 * dark-skin guard).
 *
 * Baselines are Linux PNGs generated in the pinned Playwright container via
 * `pnpm e2e:baselines -- tooltip.visual.spec.ts` — the same image CI's
 * `e2e-offline` job compares against. Don't run `:update` on a macOS host (it
 * writes a `*-darwin.png` CI doesn't use).
 */
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

const PICKER_URL = 'https://mocked-picker-survivor.example.test/';

/** ru hidden, uk + en survive — so exactly two survivor tooltips attach. */
const SURVIVOR_COUNT = 2;

// A short, fixed viewport: the picker sits at the bottom (fixture flex layout),
// so the default top-placement tooltip renders in the clear space above it, on
// the page background — which is the whole point (the card must read as a
// distinct surface against the host page, light and dark).
const VIEWPORT = { width: 460, height: 340 };

/**
 * Drive the real picker filter over the fixture and open one survivor's
 * tooltip. Returns the OPEN tooltip host so the caller can guard its scheme and
 * snapshot the page. Copy renders in the suite's default en-US UI ("Some
 * options hidden" / "Show hidden options").
 */
async function openSurvivorTooltip(
  movarContext: BrowserContext,
  movarPage: Page,
): Promise<Locator> {
  await movarPage.setViewportSize(VIEWPORT);
  const route = await mockSite(movarContext, `${PICKER_URL}**`, 'picker-survivor-ru');

  await movarPage.goto(PICKER_URL, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

  // Guard the "URL typo → 404 → nothing hidden → passes for the wrong reason"
  // mode, and confirm the survivor path (not the container-curtain path) fired:
  // exactly the ru anchor hidden, and one tooltip host per survivor.
  expect(route.hits).toBeGreaterThanOrEqual(1);
  const state = await readMovarDomState(movarPage);
  expect(state.hiddenLinkCount).toBe(1);
  await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(SURVIVOR_COUNT);

  // Hover a survivor to open its tooltip (200ms dwell; the attribute poll below
  // waits it out). Hovering — not focusing — keeps a keyboard focus ring off
  // the anchor so the baseline pins only the tooltip.
  await movarPage.locator('a[hreflang="uk"]').hover();
  const openTooltip = movarPage.locator('[data-movar-tooltip][data-state="open"]');
  await expect(openTooltip).toHaveCount(1);
  return openTooltip;
}

test('survivor tooltip renders its light skin', async ({ movarContext, movarPage }) => {
  const openTooltip = await openSurvivorTooltip(movarContext, movarPage);

  // The orchestrator threads the detected page mode through; a light page →
  // light skin. Guarding the attribute keeps this from passing on an unschemed
  // (fallback) render.
  await expect(openTooltip).toHaveAttribute('data-movar-color-scheme', 'light');

  await expect(movarPage).toHaveScreenshot('tooltip-survivor.png');
});

test('survivor tooltip renders its dark skin over a dark page', async ({
  movarContext,
  movarPage,
}) => {
  await movarPage.emulateMedia({ colorScheme: 'dark' });
  const openTooltip = await openSurvivorTooltip(movarContext, movarPage);

  // Guard against silently baking the LIGHT rendering under a dark filename: the
  // open host must carry the dark scheme the orchestrator sets when `page-mode`
  // detects a dark page.
  await expect(openTooltip).toHaveAttribute('data-movar-color-scheme', 'dark');

  await expect(movarPage).toHaveScreenshot('tooltip-survivor-dark.png');
});
