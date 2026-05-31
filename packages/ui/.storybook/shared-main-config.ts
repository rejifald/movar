import type { StorybookConfig } from '@storybook/react-vite';

import tailwindcss from '@tailwindcss/vite';

/**
 * Shared Storybook config fields common to every app in this monorepo.
 *
 * Each app's `main.ts` spreads this object and overrides only the
 * `stories` glob (and optionally any other app-specific field).
 *
 * Why `viteFinal` lives here: the design tokens (`bg-surface`,
 * `text-ui-base`, …) only resolve when `@tailwindcss/vite` runs over the
 * preview's CSS.  Registered via `viteFinal` rather than a sibling
 * `vite.config.ts` so Storybook stays the single source of bundler config
 * for every preview.
 */
export const sharedStorybookConfig = {
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    // Each package already runs `tsc --noEmit` via its `typecheck` script;
    // let Storybook trust the emit. Re-checking inside the dev server
    // doubles the cold-start cost for a check the typecheck target already
    // enforces.
    check: false,
  },
  async viteFinal(viteConfig: Parameters<NonNullable<StorybookConfig['viteFinal']>>[0]) {
    return {
      ...viteConfig,
      plugins: [...(viteConfig.plugins ?? []), ...tailwindcss()],
    };
  },
} satisfies Partial<StorybookConfig>;
