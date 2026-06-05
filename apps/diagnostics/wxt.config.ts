import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Diagnostics reuses the product's pure model packages (@movar/page-content,
// @movar/lang-pickers, @movar/page-mode, @movar/page-language) and never its
// rendering (conceal/curtain/tooltip/i18n) — imported as normal workspace deps.

/**
 * Movar Diagnostics — a private, never-published dev extension that re-runs
 * `@movar/lang-detect`'s classifier + franc oracle on visited pages and surfaces
 * classifier-vs-oracle divergences in an in-page FAB + floating panel. See
 * docs/diagnostics-devtools-panel.md. The published `@movar/extension` carries
 * ZERO diagnostics surface; this app is self-contained and reaches into nothing.
 *
 * It is a content-script-only extension: no background, no devtools page, no
 * relay, no extra permissions — just a UI injected into a shadow root. That is
 * what makes it cross-browser (Chrome, Firefox, and Safari, which has no
 * DevTools-panel API).
 */

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react'],
  // Force MV3 on every target (WXT defaults Firefox to MV2 otherwise).
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Movar Diagnostics (dev)',
    description:
      'Maintainer-only language-detection diagnostics. Re-runs the classifier + franc oracle on pages and surfaces divergences in an in-page panel. Never published; sends nothing off-device.',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    // Stable add-on identity so a Firefox temporary install keeps the same id
    // across reloads. Never submitted to AMO.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: { id: 'diagnostics@movar.fyi', strict_min_version: '128.0' },
      },
    }),
  }),
  vite: () => ({
    // Cast mirrors apps/extension/wxt.config.ts: the plugin's types are pinned
    // to whichever `vite` copy hoisted; the runtime contract is identical.
    plugins: [tailwindcss() as unknown as never],
  }),
});
