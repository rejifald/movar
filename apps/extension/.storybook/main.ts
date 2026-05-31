import type { StorybookConfig } from '@storybook/react-vite';

import { sharedStorybookConfig } from '../../../packages/ui/.storybook/shared-main-config';

/**
 * Extension Storybook — used to render the four marketplace screenshots that
 * ship to AMO and the Chrome Web Store. Each scene composes the real
 * production popup component (`apps/extension/src/entrypoints/popup/App`)
 * over a per-locale backdrop component under
 * `store-assets/storyboards/backdrops/`.
 *
 * Two integration points worth flagging:
 *
 *   - **Vite + Tailwind v4** and **viteFinal** are handled by the shared
 *     config imported from `packages/ui/.storybook/shared-main-config.ts`.
 *   - **Stories live under `store-assets/storyboards/stories/`.** They are
 *     not co-located with the popup source because the only stories the
 *     extension owns today are the marketplace screenshot scenes, and
 *     keeping them next to the backdrops they compose with is what reads
 *     well at review time.
 *
 * Capture pipeline: `scripts/capture-storybook-assets.mts` reads
 * `storybook-static/index.json` after `pnpm build-storybook`, filters
 * entries under `Marketplace/Screenshots/*`, `Marketplace/Promo/*`, and
 * `Marketing/Screenshots/*`, then screenshots each via a Playwright
 * Chromium driver. See `store-assets/STORYBOOK-PIPELINE-PLAN.md` for
 * the original design discussion.
 */
const config: StorybookConfig = {
  stories: ['../store-assets/storyboards/**/*.stories.@(ts|tsx|mdx)'],
  ...sharedStorybookConfig,
};

export default config;
