import type { StorybookConfig } from '@storybook/react-vite';

import tailwindcss from '@tailwindcss/vite';

/**
 * Storybook config for @movar/ui — the single canvas where every primitive
 * gets exercised in isolation. Two integration points worth flagging:
 *
 *   - **Vite + Tailwind v4.** Storybook bundles the preview with Vite, and
 *     the design tokens (`bg-surface`, `text-ui-base`, …) only resolve when
 *     `@tailwindcss/vite` runs over the preview's CSS. Registered via
 *     `viteFinal` rather than a sibling `vite.config.ts` so Storybook stays
 *     the single source of bundler config for the preview.
 *   - **Stories live next to components.** Story files use the
 *     `<name>.stories.tsx` sibling pattern so a primitive and its examples
 *     evolve together. Matches the test-file convention used elsewhere in
 *     the repo.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    // The package already runs `tsc --noEmit` via Nx; let Storybook trust the
    // emit. Re-checking inside the dev server doubles the cold-start cost for
    // a check the typecheck target already enforces.
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
