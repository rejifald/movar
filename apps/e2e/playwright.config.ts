import { defineConfig } from '@playwright/test';

/**
 * Manual-run live-website suite. Not wired into CI: real sites change
 * unpredictably and the cost of a flaky merge gate is higher than the
 * value of opportunistic coverage.
 *
 * The extension MUST be built before this runs — `nx run e2e:test:live`
 * already declares the dependency. If you invoke `playwright test`
 * directly, build with `pnpm --filter @movar/extension build` first.
 *
 * Why a single chromium project: Playwright cannot load MV3 extensions
 * in true headless mode today, so `headless: false` is required. We
 * could also exercise Firefox via `webkit`/`firefox` projects, but
 * loading a signed XPI through Playwright's launcher is awkward; the
 * existing `pnpm --filter @movar/extension dev:firefox:installed`
 * script already covers manual Firefox verification.
 */
export default defineConfig({
  testDir: './src/tests',
  // Live suite owns sites.spec.ts only. popup.spec.ts is a separate,
  // offline, CI-friendly spec with its own config (playwright.popup.config.ts) —
  // running it under this config would mean spinning up the slow,
  // network-dependent live harness for tests that don't need it.
  testMatch: '**/sites.spec.ts',
  // Live-network suite. One worker keeps the request load polite and
  // means the per-site flake budget isn't shared across concurrent
  // tabs racing on the same domain.
  workers: 1,
  fullyParallel: false,
  // Real sites can stall behind anti-bot challenges; give each test
  // enough budget to recover from a slow DNS or a 1-2s captcha probe.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // No automatic retries: a real-site failure usually means the site
  // changed (rule needs updating) — retrying just hides it. Re-run
  // manually when you want a second look.
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    // Extensions force headed in Playwright; this just makes it
    // explicit — `pnpm test:live:headed` lifts it for live debugging.
    headless: false,
    // Real sites; trace + video on failure for postmortem.
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-with-movar',
      // The fixture under src/fixtures/extension.ts is the load-bearing
      // bit; no Playwright `use.channel` knobs are involved (persistent
      // context launches its own Chromium).
    },
  ],
});
