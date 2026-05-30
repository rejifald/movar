import { defineConfig } from '@playwright/test';
import { LIVE_BASE_USE } from './playwright.live.base';

/**
 * Live-website assertion suite — manual only. Drives the real internet
 * against the rule-bearing sites under `src/live/sites/`, asserting the
 * four-part contract (opens in RU → recognised → switched → hidden).
 *
 * NOT wired into CI: real sites change unpredictably and the cost of a
 * flaky merge gate is higher than the value of opportunistic coverage.
 * Run with `pnpm --filter @movar/e2e test:live` (or `pnpm test:e2e:live`
 * from the repo root). The default `playwright.config.ts` is the
 * deterministic CI gate and covers everything that CAN run without the
 * live network.
 *
 * The extension MUST be built before this runs — `nx run e2e:test:live`
 * already declares the dependency. If you invoke `playwright test
 * --config playwright.live.config.ts` directly, build with
 * `pnpm --filter @movar/extension build` first.
 *
 * Why a single chromium project: Playwright cannot load MV3 extensions
 * in true headless mode today, so `headless: false` is required. We
 * could also exercise Firefox via `webkit`/`firefox` projects, but
 * loading a signed XPI through Playwright's launcher is awkward; the
 * existing `pnpm --filter @movar/extension dev:firefox:installed`
 * script already covers manual Firefox verification.
 */
export default defineConfig({
  testDir: './src/live',
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
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-live', open: 'never' }]],
  use: {
    // Shared headed/trace/video/screenshot/timeout block — see
    // playwright.live.base.ts. Spread first so explicit overrides can
    // follow if any axis-specific tweak is ever needed here.
    ...LIVE_BASE_USE,
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
