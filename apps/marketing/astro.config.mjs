// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://movar.fyi',
  output: 'static',
  vite: {
    // Astro 5.18 bundles Vite 6 types, but @tailwindcss/vite 4.3 in this
    // workspace resolves to its vite-7 build (Storybook 10 forces vite 7
    // hoisted at the marketing devDep root). The two Plugin shapes are
    // runtime-compatible — Astro accepts the plugin — but cross-major
    // Plugin types collide under `astro check`. Drop the cast when Astro
    // ships vite-7 types.
    // @ts-expect-error cross-major vite Plugin shape (vite 6 ↔ vite 7)
    plugins: [tailwindcss()],
  },
});
