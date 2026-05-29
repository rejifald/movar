import { defineConfig } from '@playwright/test';

/**
 * Popup-render suite. Fully offline: every test navigates to
 * `chrome-extension://<id>/popup.html` against the locally-built WXT output,
 * never touches the live network, and asserts the popup's default-state
 * UI renders.
 *
 * Unlike `playwright.config.ts` (the live-website suite), this config is
 * intended to be CI-safe — it's fast, deterministic, and the only
 * environmental dependency is the extension build under
 * `apps/extension/.output/chrome-mv3` (the Nx target wires that in).
 *
 * Why a separate config: the live config sets `workers: 1` and 60-second
 * timeouts because real sites stall and one CAPTCHA shouldn't poison a
 * neighbour worker. Popup tests have none of that risk; collapsing them
 * into the live config would mean inheriting limits they don't need.
 */
export default defineConfig({
  testDir: './src/tests',
  // Match both the structural spec and the visual spec. The visual file
  // is its own spec rather than additional cases in popup.spec.ts so that
  // snapshot baseline failures are categorically separate from "the popup
  // didn't even mount" failures in CI triage.
  testMatch: ['**/popup.spec.ts', '**/popup.visual.spec.ts'],
  // No network → parallelism is cheap. Each spec gets its own Chromium
  // persistent context (extension launch is ~1-2s), so we cap workers to
  // avoid stampeding the host on a small machine.
  workers: 2,
  fullyParallel: true,
  // Generous enough for a cold extension launch + first React render on
  // a loaded CI runner; tight enough to surface a real hang quickly.
  timeout: 30_000,
  // No retries: popup rendering is deterministic against a fixed build;
  // a failure here means the popup actually changed and the test (or the
  // popup) needs to be looked at.
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-popup', open: 'never' }]],
  // Visual baselines for the popup live next to the spec at
  // `src/tests/popup.visual.spec.ts-snapshots/<name>-<project>-<platform>.png`.
  // Default Playwright path; calling it out so a future move is intentional.
  //
  // `toHaveScreenshot` tolerances: the popup is small (≈360x720), so a
  // handful of stray pixels (anti-aliasing on rounded chips, sub-pixel
  // gradient stops) shouldn't fail the test. We allow 0.1% of pixels to
  // differ; per-pixel threshold stays at the Playwright default (0.2)
  // which catches real-colour changes but not channel rounding.
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      // `animations: 'disabled'` is belt + braces with the rule we
      // inject in `openPopup()` — Playwright's freeze covers Web
      // Animations API, our injected CSS covers transition-* / animate-*
      // utilities. Together: no jitter source left.
      animations: 'disabled',
    },
  },
  use: {
    // MV3 extensions force headed Chromium (see live config for the
    // longer note). Same constraint applies here.
    headless: false,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium-popup',
      // Fixture at `src/fixtures/extension.ts` is the load-bearing bit;
      // `chromium.launchPersistentContext` is the only path that loads
      // MV3 extensions, and Playwright's project-level `channel`/
      // `launchOptions` don't reach it.
    },
  ],
});
