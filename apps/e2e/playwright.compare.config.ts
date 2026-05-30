import { defineConfig } from '@playwright/test';
import { LIVE_BASE_USE } from './playwright.live.base';

/**
 * Compare suite — paired baseline (no Movar) vs treatment (with Movar)
 * against real Google Search. NOT a CI gate; runs nightly + on demand.
 *
 * What it proves:
 *   1. The bug is real upstream (baseline returns Russian content
 *      for Ukrainian queries under `Accept-Language: ru-RU`).
 *   2. Movar fixes it on the same query, same minute, same egress IP
 *      (treatment returns Ukrainian content, no Russian leak words).
 *
 * Why a separate config from `playwright.live.config.ts`:
 *   - Different `testMatch` (this suite's spec is `compare/runner.spec.ts`,
 *     not `sites.spec.ts`).
 *   - Different retry policy: live is `retries: 0` because a failure
 *     usually means a rule needs updating. Compare is `retries: 2`
 *     because the failure shape we care about (Movar regressed) is
 *     a small minority of the failure modes (Google CAPTCHA, network
 *     blip, transient anti-bot) and retrying clears the noisy ones.
 *   - Longer per-test timeout: each scenario does TWO navigations +
 *     Movar settle + double measurement + screenshot capture.
 *
 * Manual run: `pnpm --filter @movar/e2e test:compare`
 * (or `pnpm test:e2e:compare` from the repo root).
 * Headed for live debugging: `pnpm --filter @movar/e2e test:compare:headed`.
 *
 * Selective scenario skip via env vars (`SKIP_NEWS=1`, `SKIP_VOLTAGE_RELAY=1`,
 * etc. — see `compare/scenarios.ts` for the full list). Useful when one
 * query is wedged by a CAPTCHA and the others still work.
 *
 * The extension MUST be built before this runs — the Nx target
 * `e2e:test:compare` declares `extension:build` as a dependency.
 */
export default defineConfig({
  testDir: './src/live/compare',
  testMatch: '**/runner.spec.ts',
  // One worker — keeps the per-second request rate to Google polite
  // and means the per-scenario flake budget isn't shared across
  // concurrent tabs racing on the same domain. The two legs INSIDE
  // each scenario already run concurrently in two contexts.
  workers: 1,
  fullyParallel: false,
  // Each scenario: navigate × 2 + consent dismiss + Movar settle (≤ 15s)
  // + networkidle wait (≤ 10s) + measurement + screenshot × 2. Real
  // Google can stall behind anti-bot challenges; 90s gives recovery
  // headroom without masking a true hang.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Two retries. Real Google's flake shape:
  //   - CAPTCHA / 429 / transient block — clears on retry.
  //   - Movar regressed — persists across retries.
  // Retrying lets the first kind self-heal so we only see the second.
  retries: 2,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-compare', open: 'never' }]],
  use: {
    // Shared headed/trace/video/screenshot/timeout block — see
    // playwright.live.base.ts.
    ...LIVE_BASE_USE,
  },
  projects: [
    {
      name: 'chromium-compare',
      // The fixture under src/fixtures/extension.ts is the load-
      // bearing bit; it supplies both `cleanContext` (no extension,
      // baseline leg) and `movarContext` (extension loaded,
      // treatment leg).
    },
  ],
});
