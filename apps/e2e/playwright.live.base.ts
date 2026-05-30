/**
 * Shared documentation for live-website suites (live + compare).
 * Both `playwright.live.config.ts` and `playwright.compare.config.ts`
 * include identical use blocks and trace/video/screenshot behavior:
 *
 *   headless: false — headed Chromium is less likely to trip bot detection
 *   trace: 'retain-on-failure' — postmortem traces on real-site failures
 *   video: 'retain-on-failure' — video capture on real-site failures
 *   screenshot: 'only-on-failure' — PNG capture on real-site failures
 *   actionTimeout: 15_000 — allow for slow Google / Bing redirects
 *   navigationTimeout: 30_000 — allow for slow network paths
 *
 * The reporter is split: live uses `playwright-report-live/` while
 * compare uses `playwright-report-compare/` to avoid clobbering reports.
 */

/** `use` block shared by live + compare configs. Each config spreads
 *  this and adds any axis-specific overrides on top. */
export const LIVE_BASE_USE = {
  headless: false,
  trace: 'retain-on-failure',
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
} as const;
