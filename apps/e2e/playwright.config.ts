import { defineConfig } from '@playwright/test';

/**
 * Default e2e config — the deterministic, no-side-effects suite. This is
 * what `playwright test` runs with no `--config` flag, and what CI gates
 * on. Every spec under `src/offline/` is matched:
 *
 *   - popup.spec.ts                  structural
 *   - popup.visual.spec.ts           pixel baselines
 *   - popup.behavior.spec.ts         click → storage round-trip
 *   - options.spec.ts                structural
 *   - options.visual.spec.ts         pixel baselines
 *   - options.behavior.spec.ts       click → storage round-trip
 *   - content-script.spec.ts         content-script behaviour against page.route() HTML
 *   - russian-browser-lang.spec.ts   locked-Russian invariants under `--lang=ru-RU`
 *
 * No live network is touched: HTML fixtures under `src/fixtures/html/` are
 * served via `context.route()`, and the only environmental dependency is
 * the extension build under `apps/extension/.output/chrome-mv3` (the Nx
 * `dependsOn: extension:build` target wires that in).
 *
 * The live-website assertion suite lives at `playwright.live.config.ts`
 * (manual only; `pnpm test:live`). The demo-recording pipeline lives at
 * `playwright.demo.config.ts`. Neither runs in CI.
 *
 * Narrow popup-only iteration loop: `pnpm test -- --grep popup` matches
 * just the popup specs without booting options / content / behavior.
 */
export default defineConfig({
  testDir: './src/offline',
  // No network → parallelism is cheap. Each spec gets its own Chromium
  // persistent context (extension launch is ~1-2s), so we cap workers to
  // avoid stampeding the host on a small machine.
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
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
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
      // Project name lands in every baseline filename
      // (`<spec-name>-<project>-<platform>.png`). Plain `chromium` because
      // this is the only Playwright project in this config — the popup-
      // specific name from the pre-consolidation era retired with the
      // dedicated popup config.
      name: 'chromium',
      // Fixture at `src/fixtures/extension.ts` is the load-bearing bit;
      // `chromium.launchPersistentContext` is the only path that loads
      // MV3 extensions, and Playwright's project-level `channel`/
      // `launchOptions` don't reach it.
    },
  ],
});
