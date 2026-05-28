import { defineConfig } from '@playwright/test';

/**
 * Manual-run demo recording suite. Renders the Movar extension performing
 * its work on live sites, captures the session as WebM, and lets a follow-up
 * ffmpeg pass (see `src/demo/Makefile`) derive the three publish formats:
 *
 *   • `master-1080p.mp4` — 1920×1080, for upload to YouTube → linked from
 *     the Chrome Web Store listing video field.
 *   • `hero.gif` — short loop for the README and marketing hero.
 *   • `social-{square,vertical}.mp4` — 1080×1080 and 1080×1920 crops, with
 *     burned-in captions from `src/demo/captions/{uk,en}.srt` for muted
 *     autoplay on Bluesky/X/Mastodon.
 *
 * Distinct from `playwright.config.ts` (the live-site assertion suite) so
 * the recording-specific knobs (`video: 'on'`, slow-mo, single worker,
 * no retries) don't pollute the regular e2e runs. The two configs share
 * the extension-loading fixture under `src/fixtures/extension.ts`.
 *
 * Run it: `pnpm --filter @movar/e2e demo:record`.
 *
 * Output: WebM files land under `test-results/<spec>/<beat>/video.webm`.
 * The Makefile reads them from there.
 */
export default defineConfig({
  // Scoped to `src/demo/`; the live-site assertion suite under `src/tests/`
  // stays untouched.
  testDir: './src/demo',
  testMatch: '**/*.spec.ts',
  // Sequential, one worker — videos are concatenated by the Makefile and a
  // race condition between two beats would land them in non-deterministic
  // output paths. Cheap to keep linear at this scale (1–5 beats).
  workers: 1,
  fullyParallel: false,
  // Each beat scripts a real-browser sequence with human-paced waits; a 90-s
  // ceiling per beat is comfortable headroom for a slow network on the day.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // No retries: a flaky take produces a bad video, not a misleading green
  // CI signal. Re-run manually when you see something wrong.
  retries: 0,
  // List reporter only — the HTML reporter is overkill for a recording run
  // and slows the teardown.
  reporter: [['list']],
  use: {
    headless: false,
    // Always record, at the exact resolution the screenshot pipeline uses
    // — keeps the visual language consistent across stills and video.
    video: {
      mode: 'on',
      size: { width: 1280, height: 800 },
    },
    viewport: { width: 1280, height: 800 },
    // Real network + real sites; generous nav timeout for the first cold
    // request, which often eats a captcha or DNS lookup.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  // The recording pipeline doesn't share output paths with the assertion
  // suite — keep videos under `demo-results/` so a stray `pnpm test:live`
  // run doesn't blow them away.
  outputDir: './demo-results',
  projects: [
    {
      name: 'chromium-with-movar',
      // Fixture lives at src/fixtures/extension.ts; persistent context
      // launches its own Chromium with the WXT-built extension loaded.
    },
  ],
});
