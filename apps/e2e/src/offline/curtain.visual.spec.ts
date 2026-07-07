/**
 * Curtain responsive-collapse visual baselines.
 *
 * The content filter conceals a column of Russian YouTube cards, each sized to
 * a different box, so the REAL cover curtain folds through every collapse tier
 * — full vertical card → horizontal bar (both actions) → drop the secondary
 * action → drop the title → eye-only floor. One committed baseline pins the
 * whole ladder, so a regression in any tier's `@container movar-cover`
 * breakpoint (or the eye-only floor) lands as a pixel diff instead of slipping
 * through the structural specs, which don't look at pixels.
 *
 * Same offline contract as content-script.spec.ts: the `curtain-tiers-ru`
 * fixture is served from youtube.com via `context.route` so `getFilterForHost`
 * runs, and each card is a plain `ytd-video-renderer` with Russian title +
 * channel. `/feed/trending` (not `/results`) avoids the enforce-rule redirect.
 *
 * The inline-target tier isn't exercised here — no extractor emits an inline
 * target, so it can't arise from real content. It's covered by the
 * inline-promotion cases in `apps/extension/src/lib/curtain.cover.test.ts` and
 * the `Components/CurtainResponsiveness` Storybook story.
 *
 * Baselines are Linux PNGs generated in the pinned Playwright container via
 * `pnpm e2e:baselines` (see scripts/e2e-baselines.sh) — the same image CI's
 * `e2e-offline` job compares against.
 */
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

// Curtain copy renders in the suite's default en-US UI ("Content hidden" /
// "Show" / "Hide all") — a real user-facing state, and the responsive collapse
// this baseline pins is width-driven, so it's identical whatever the UI locale.
// The page underneath stays Russian (the fixture is `lang="ru"`).

/** Every sized card in the fixture is Russian, so all of them conceal. */
const TIER_COUNT = 5;

const TRENDING_URL = 'https://www.youtube.com/feed/trending';

test('curtain collapses through every responsive tier', async ({ movarContext, movarPage }) => {
  const route = await mockSite(movarContext, 'https://www.youtube.com/**', 'curtain-tiers-ru');

  await movarPage.goto(TRENDING_URL, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

  // Guards against the silent "URL typo → 404 → nothing hidden → passes for the
  // wrong reason" mode, and confirms every sized card actually concealed (so the
  // baseline below can't quietly bake in a missing tier).
  expect(route.hits).toBeGreaterThanOrEqual(1);
  const state = await readMovarDomState(movarPage);
  expect(state.contentBlurCount).toBe(TIER_COUNT);

  // One baseline over the whole ladder — the labels annotate each tier, so a
  // human reading the diff sees exactly which breakpoint moved.
  await expect(movarPage.locator('main')).toHaveScreenshot('curtain-tiers.png');
});
