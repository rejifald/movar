import type { StorybookConfig } from '@storybook/react-vite';

import tailwindcss from '@tailwindcss/vite';

/**
 * Marketing Storybook — full-section gallery for the components in
 * apps/marketing/src/components/. Mirrors the @movar/ui Storybook
 * (packages/ui/.storybook/) so the two share Vite + Tailwind plumbing and
 * cold-start cost.
 *
 * Astro components don't render in React-Vite Storybook directly. Each
 * `<Name>.astro` has a sibling `<Name>.stories.tsx` that re-implements the
 * markup in React, reading from the same `i18n.ts` strings. The `.astro`
 * file stays the production source; the React mock exists only for
 * Storybook isolation development. Drift between the two is the
 * trade-off — see `.storybook/preview.tsx` for the maintenance note.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  // Serve the site's public/ so stories (e.g. the Social before/after card)
  // can reference committed assets like /screenshots/*.png. The capture build
  // copies these into storybook-static, so Playwright loads them too.
  staticDirs: ['../public'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    // Marketing already runs `astro check` for .astro files and tsc emits
    // are disabled — let Storybook trust that and skip re-checking on every
    // dev boot.
    check: false,
  },
  async viteFinal(viteConfig) {
    return {
      ...viteConfig,
      // Force automatic JSX runtime. The marketing app's `tsconfig.json`
      // overrides `jsx: "preserve"` so Astro can drive its own JSX, but
      // Storybook's Vite picks that up via esbuild and emits classic
      // `React.createElement` calls without auto-importing React — every
      // story then crashes with `ReferenceError: React is not defined`.
      // Pinning the runtime here keeps the story tsx files free of a
      // boilerplate `import React from 'react'` on every file.
      esbuild: {
        ...viteConfig.esbuild,
        jsx: 'automatic',
        jsxImportSource: 'react',
      },
      plugins: [...(viteConfig.plugins ?? []), ...tailwindcss()],
    };
  },
};

export default config;
