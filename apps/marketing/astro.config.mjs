// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://movar.fyi',
  output: 'static',
  // Auto-generated sitemap (sitemap-index.xml → sitemap-0.xml) so new pages
  // can never silently drop out the way the old hand-maintained sitemap.xml
  // did. The i18n block teaches the integration our routing — EN at the root,
  // UK under /uk/ — so it emits the same xhtml:link hreflang alternates as
  // BaseLayout's <head>. Status pages (404/500, incl. /uk/404) are excluded
  // automatically. robots.txt points crawlers at /sitemap-index.xml.
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', uk: 'uk' },
      },
    }),
  ],
  // Keep dev/preview on the port declared in .claude/launch.json so the
  // preview MCP's health check on 4321 doesn't miss the server when vite
  // would otherwise silently fall through to 4322+.
  server: { port: 4321 },
  vite: {
    server: { strictPort: true },
    preview: { strictPort: true },
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
