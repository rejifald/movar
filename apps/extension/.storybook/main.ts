import type { StorybookConfig } from '@storybook/react-vite';

import tailwindcss from '@tailwindcss/vite';

/**
 * Extension Storybook — used to render the four marketplace screenshots that
 * ship to AMO and the Chrome Web Store. Each scene composes the real
 * production popup component (`apps/extension/src/entrypoints/popup/App`)
 * over a per-locale backdrop component under
 * `store-assets/storyboards/backdrops/`.
 *
 * Two integration points worth flagging — mirrors the comments in
 * `apps/marketing/.storybook/main.ts` and `packages/ui/.storybook/main.ts`:
 *
 *   - **Vite + Tailwind v4.** Storybook bundles the preview with Vite, and
 *     the design tokens (`bg-surface`, `text-ui-base`, …) only resolve when
 *     `@tailwindcss/vite` runs over the preview's CSS. Registered via
 *     `viteFinal` rather than a sibling `vite.config.ts` so Storybook stays
 *     the single source of bundler config for the preview.
 *   - **Stories live under `store-assets/storyboards/stories/`.** They are
 *     not co-located with the popup source because the only stories the
 *     extension owns today are the marketplace screenshot scenes, and
 *     keeping them next to the backdrops they compose with is what reads
 *     well at review time.
 *
 * Capture pipeline: `scripts/capture-store-screenshots.mts` reads
 * `storybook-static/index.json` after `pnpm build-storybook`, filters
 * entries under `Marketplace/Screenshots/*`, and screenshots each via a
 * Playwright Chromium driver. See `store-assets/STORYBOOK-PIPELINE-PLAN.md`.
 */
const config: StorybookConfig = {
  stories: ['../store-assets/storyboards/**/*.stories.@(ts|tsx|mdx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    // The package already runs `tsc --noEmit` via the `typecheck` script;
    // let Storybook trust the emit. Re-checking inside the dev server
    // doubles the cold-start cost for a check the typecheck target already
    // enforces.
    check: false,
  },
  async viteFinal(viteConfig) {
    return {
      ...viteConfig,
      plugins: [...(viteConfig.plugins ?? []), ...tailwindcss()],
    };
  },
};

export default config;
