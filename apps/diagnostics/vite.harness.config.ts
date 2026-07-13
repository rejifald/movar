import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Standalone Vite build for the diagnostics e2e visual harness
 * (`e2e-harness/index.html` → `dist/harness/`). Separate from `wxt build`: the
 * harness lives OUTSIDE `src/`, so it never enters the shipped extension — its
 * only consumer is `apps/e2e`'s `diagnostics.visual.spec.ts`, which loads the
 * built `dist/harness/index.html` from `file://` (mirroring how the Safari host
 * app's bundle is loaded).
 *
 * Mirrors `apps/safari-host-app/vite.config.ts`:
 *   - No `@vitejs/plugin-react` — it isn't a direct dep here (only transitive via
 *     `@wxt-dev/module-react`), and Fast Refresh is pointless for a build. Vite's
 *     built-in esbuild JSX transform (`jsx: 'automatic'`) drives the React 19
 *     automatic runtime with zero extra dependencies.
 *   - `base: './'` so the emitted `index.html` references its JS/CSS relatively
 *     (`./assets/…`), which resolves under `file://` (root-absolute `/…` paths
 *     would 404 against the filesystem root). The e2e context grants
 *     `--allow-file-access-from-files` so the sibling assets load.
 *   - one self-contained JS + one CSS (single chunk, `cssCodeSplit: false`), so
 *     nothing has to fetch a lazy chunk the `file://` page can't reach.
 */
export default defineConfig({
  root: fileURLToPath(new URL('e2e-harness', import.meta.url)),
  base: './',
  plugins: [tailwindcss()],
  esbuild: {
    jsx: 'automatic',
    jsxDev: false,
  },
  build: {
    outDir: fileURLToPath(new URL('dist/harness', import.meta.url)),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Force a single chunk — no vendor split, no lazy chunks the
        // `file://`-loaded page would fail to fetch.
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
});
