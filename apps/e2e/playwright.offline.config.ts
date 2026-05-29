import { defineConfig } from '@playwright/test';

/**
 * Offline suite — the CI gate. Matches every spec that can run without
 * touching the live network:
 *
 *   - popup.spec.ts                  structural (already covered by popup config)
 *   - popup.visual.spec.ts           pixel baselines (already covered by popup config)
 *   - popup.behavior.spec.ts         click → storage round-trip
 *   - options.spec.ts                structural
 *   - options.visual.spec.ts         pixel baselines
 *   - options.behavior.spec.ts       click → storage round-trip
 *   - content-script.spec.ts         content-script behaviour against page.route() HTML
 *
 * Coexists with `playwright.popup.config.ts`, which stays as a narrower,
 * popup-only config for the focused "iterate a popup pixel, regenerate
 * just this baseline" workflow. The popup specs are matched by both
 * configs but only run when their config is invoked — CI invokes this
 * one and never the popup-only one, so no double-runs in CI.
 *
 * Subset runs use `--grep`:
 *   - test:options     →  --grep "options"
 *   - test:behavior    →  --grep "behavior"
 *   - test:content     →  --grep "content-script"
 *
 * The full config still loads when you grep, but spec discovery is
 * microseconds — the trade-off vs three separate per-category configs is
 * a single source of truth for headless-Chromium-with-MV3 launch
 * settings, snapshot tolerances, and report folder.
 *
 * Unlike `playwright.config.ts` (the live-website suite), this config is
 * intended to be CI-safe — every spec is fully deterministic, fast, and
 * the only environmental dependency is the extension build under
 * `apps/extension/.output/chrome-mv3` (the Nx target wires that in).
 */
export default defineConfig({
  testDir: './src/tests',
  // Every offline spec — structural, visual, behavior, content-script.
  // Adding a new offline spec? Add its glob here.
  testMatch: [
    '**/popup.spec.ts',
    '**/popup.visual.spec.ts',
    '**/popup.behavior.spec.ts',
    '**/options.spec.ts',
    '**/options.visual.spec.ts',
    '**/options.behavior.spec.ts',
    '**/content-script.spec.ts',
  ],
  // No network → parallelism is cheap. Each spec gets its own Chromium
  // persistent context (extension launch is ~1-2s), so we cap workers to
  // avoid stampeding the host on a small machine. Same value as the
  // popup-only config; the offline suite is just "more popup-like specs".
  workers: 2,
  fullyParallel: true,
  // Generous enough for a cold extension launch + first React render on
  // a loaded CI runner; tight enough to surface a real hang quickly.
  // Behavior specs occasionally need a second navigation (e.g. reopen
  // popup in a fresh tab), so the budget covers two mount cycles.
  timeout: 30_000,
  // No retries: every spec here is deterministic against a fixed build.
  // A failure means the surface actually changed and the test (or the
  // surface) needs to be looked at.
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-offline', open: 'never' }]],
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      // Popup and options baselines share this tolerance. The popup is
      // ≈360x720 and the options page is ≈1200x900 — both small enough
      // that a handful of anti-aliasing pixels shouldn't fail the test.
      // We allow 0.1% of pixels to differ; per-pixel threshold stays at
      // the Playwright default (0.2) which catches real-colour changes
      // but not channel rounding.
      maxDiffPixelRatio: 0.001,
      // `animations: 'disabled'` is belt + braces with the rule we
      // inject in `openPopup()` / `openOptions()` — Playwright's freeze
      // covers Web Animations API, our injected CSS covers transition-*
      // / animate-* utilities. Together: no jitter source left.
      animations: 'disabled',
    },
  },
  use: {
    // MV3 extensions force headed Chromium (Playwright's true-headless
    // can't load extensions). Same constraint as every other config in
    // this package.
    headless: false,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },
  projects: [
    {
      // Intentionally MATCHES the popup config's project name so visual
      // baselines are shared. Playwright stamps the project name into
      // each baseline filename (`<name>-<project>-<platform>.png`), so
      // a different name here would mean the popup specs need a parallel
      // set of baselines under `<name>-chromium-offline-darwin.png` even
      // though the rendering is identical. Reusing the popup baselines
      // avoids that duplication and means both configs are kept in
      // pixel-perfect lockstep automatically.
      name: 'chromium-popup',
      // Fixture at `src/fixtures/extension.ts` is the load-bearing bit;
      // `chromium.launchPersistentContext` is the only path that loads
      // MV3 extensions, and Playwright's project-level `channel`/
      // `launchOptions` don't reach it.
    },
  ],
});
