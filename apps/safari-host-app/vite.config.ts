import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Vite build for the Safari wrapper app's unified host screen (Detector /
 * Settings / About tabs).
 *
 * Goal: emit exactly ONE JavaScript file and ONE CSS file, fully self-
 * contained (small assets inlined as data URIs), that the WKWebView in
 * `Shared (App)/ViewController.swift` loads from the app bundle under a strict
 * `default-src 'self'` CSP. No code-splitting, no dynamic chunks, no remote
 * or external assets — everything the CSP would block is eliminated at build
 * time. `scripts/sync-safari-app.mts` then copies `host-app.{js,css}` into
 * the app's Resources and (re)writes the localized `Main.html` shells.
 *
 * Why no `@vitejs/plugin-react`: it isn't directly resolvable from this app
 * (it lives in the tree only as a transitive dep of `@wxt-dev/module-react`),
 * and the workspace notes its v5/v6 rolldown interop hazards. We don't need
 * Fast Refresh for a production-only bundle, so Vite's built-in esbuild JSX
 * transform (`jsx: 'automatic'`) handles the React 19 automatic runtime with
 * zero extra dependencies. `@movar/ui` + `@movar/options-ui` + `@movar/i18n`
 * are consumed in source mode (TSX), exactly as the popup/options pages and
 * the onboarding screen consume them.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative asset URLs in the emitted `dist/index.html` (`./host-app.js`
  // rather than `/host-app.js`). The SHIPPED shell is the separately generated
  // `Main.html` (see `scripts/sync-safari-app.mts`, which writes its own
  // `../`-relative paths) — this `base` only governs Vite's own
  // `dist/index.html`, loaded from `file://` by `vite preview` and the e2e
  // visual spec. Root-absolute paths resolve against the filesystem root under
  // `file://` and would 404; `./` keeps the bundle reachable next to the HTML.
  base: './',
  plugins: [
    // Tailwind v4 — same plugin the extension (via WXT) and marketing (via
    // Astro) use. Reads tokens + @theme inline wiring from `src/styles.css`.
    tailwindcss(),
  ],
  // React 19 automatic runtime through esbuild — no React import needed in TSX.
  esbuild: {
    jsx: 'automatic',
    jsxDev: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // No <link> preload modulepreload injection — there is a single module.
    modulePreload: false,
    // Inline every asset (the 1.8 KB brand PNG) as a data URI so the bundle is
    // genuinely one JS + one CSS with no sidecar files. Generous ceiling: this
    // screen has only the brand icon, and a data URI is same-document (CSP-safe).
    assetsInlineLimit: 1024 * 1024,
    // One CSS file for the whole build instead of per-chunk stylesheets.
    cssCodeSplit: false,
    // Readable output — this is app chrome, not perf-critical, and a minified
    // single bundle that a reviewer can't diff is a poor trade here. esbuild
    // still tree-shakes; we just skip mangling.
    minify: false,
    rollupOptions: {
      output: {
        // Stable, hashless names so the committed Xcode references and the
        // generated Main.html shells stay valid across rebuilds.
        entryFileNames: 'host-app.js',
        // Force a single chunk — no vendor split, no lazy chunks. Any dynamic
        // import (there are none today) would be inlined rather than emitted
        // as a separate file the CSP-bound, file://-loaded shell couldn't fetch.
        manualChunks: undefined,
        inlineDynamicImports: true,
        assetFileNames: (info) =>
          info.names.some((name) => name.endsWith('.css')) ? 'host-app.css' : '[name][extname]',
      },
    },
  },
});
