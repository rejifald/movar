import { defineConfig } from '@playwright/test';

import { SLOW_HOST, budget } from './playwright.budgets';

/**
 * Marketing-site visual config — pixel baselines for the Astro marketing site
 * (`apps/marketing`), separate from the extension/offline suite because it needs
 * a running HTTP server (Astro's client hydration + routing don't work off
 * `file://`) rather than the extension's `launchPersistentContext` + `file://`
 * fixtures. Precedent: `playwright.live.config.ts` / `playwright.demo.config.ts`
 * are likewise their own configs.
 *
 * The `webServer` serves the BUILT site (`astro preview`) — the Nx
 * `e2e:test:marketing[:update]` target lists `marketing:build` as a `dependsOn`,
 * so `dist/` exists by the time preview starts. A built preview (not `astro dev`)
 * keeps the bytes identical to production and drops HMR/dev-overlay noise from
 * the snapshots.
 *
 * Determinism: every spec pins `locale` to match the page it loads so
 * `BaseLayout`'s inline `navigator.languages` redirect (/ ↔ /uk/) never fires,
 * `colorScheme` drives the `prefers-color-scheme` token flip, and
 * `animations: 'disabled'` cancels the infinite hero-aurora keyframes to their
 * initial frame (plus `reducedMotion: 'reduce'` for the site's own
 * prefers-reduced-motion gates).
 *
 * Baselines are the same single Linux PNG set CI compares against, generated in
 * the pinned Playwright container via `pnpm e2e:baselines:marketing`.
 */
const PORT = 4330;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './src/marketing',
  // Full-page marketing shots are heavier than the popup/options crops; keep
  // workers modest so a small CI runner doesn't thrash on the parallel captures.
  // Regenerating drops to one: an emulated run is slow enough already without
  // two 6k-px captures also competing for the same cores.
  workers: SLOW_HOST ? 1 : 2,
  fullyParallel: true,
  timeout: budget(30_000, 180_000),
  // Deterministic against a fixed build — a failure is a real pixel change.
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  expect: {
    // Roomier while regenerating: this budget also caps `toHaveScreenshot`'s
    // two-identical-captures handshake, which the tallest pages cannot finish
    // in 10s under emulation. See ./playwright.budgets.ts.
    timeout: budget(10_000, 60_000),
    toHaveScreenshot: {
      // Same tolerance as the offline suite — 0.5% absorbs the residual
      // anti-aliasing jitter seen even within the pinned container while still
      // catching a real token regression (colour shift, spacing, font swap).
      // Full-page marketing shots are large, so 0.5% is a generous absolute
      // headroom; a genuine regression moves far more than that.
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: BASE_URL,
    headless: true,
    // Constant CSS px across 1x/2x hosts — the same pixel-stability guarantee
    // the extension/host-app fixtures give their baselines.
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: budget(15_000, 90_000),
  },
  projects: [{ name: 'chromium', use: { channel: 'chromium' } }],
  webServer: {
    // `astro preview` serves the built `dist/` (see `dependsOn: marketing:build`).
    // Bound to loopback on a dedicated port so it never collides with the dev
    // supervisor's :4321.
    command: `pnpm --filter @movar/marketing exec astro preview --port ${PORT} --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
