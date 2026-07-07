/**
 * Onboarding-page test helpers — opening, preparing for visual snapshots,
 * and pinning the React-mount target for screenshot scoping.
 *
 * Mirrors `options.ts` / `popup.ts` in shape. Two differences worth calling
 * out:
 *   - Language: the popup/options helpers seed `settings.uiLanguage`
 *     directly; the onboarding page resolves its locale from
 *     `settings.priority` via `uiLanguageFromPriority` (see
 *     `entrypoints/onboarding/App.tsx`'s `useUiLanguage`), so callers seed
 *     `priority` instead (`['en', 'uk']` for English, `['uk', 'en']` for
 *     Ukrainian) — same convention `popup.visual.spec.ts`'s `seedEnglish`
 *     uses.
 *   - Host-permission state: the e2e build sets `MOVAR_E2E=1`
 *     (`wxt.config.ts`), which keeps `<all_urls>` a REQUIRED host
 *     permission instead of the optional-at-runtime shape production
 *     ships. That means `chrome.permissions.contains` always resolves
 *     `true` here — this suite can only exercise the access-step's
 *     "granted" line, never "missing"/"requesting". Those two states (and
 *     the Safari/Firefox flow variants, which the build target pins to
 *     Chromium in this harness) are covered by the
 *     `Components/Onboarding` Storybook stories instead, which mock
 *     `browser.permissions` directly rather than relying on the real API.
 */
import type { BrowserContext, Locator, Page } from '@playwright/test';

/** Pinned visual viewport for onboarding snapshots. The page is a single
 *  `max-w-xl` (576px) column with generous padding; 800px comfortably
 *  clears it without engaging any wider breakpoint, and 1000px covers the
 *  full pin+access step list without scroll. */
export const ONBOARDING_VIEWPORT = { width: 800, height: 1000 } as const;

/** Element-scoped snapshot target. `App.tsx` renders a single `<main>`
 *  under `#root` — pinning the screenshot to it captures the page exactly
 *  as a user sees it and excludes any browser chrome around it. */
export function onboardingRoot(page: Page): Locator {
  return page.locator('main');
}

/** Options accepted by `openOnboarding`. Mirrors `OpenOptionsOptions` — the
 *  onboarding page responds to the same `prefers-color-scheme` media query
 *  the shared design tokens flip on. */
export interface OpenOnboardingOptions {
  /** Browser color-scheme preference Playwright reports to the page. Drives
   *  `@media (prefers-color-scheme: …)` in `packages/ui/src/tokens.css`. */
  colorScheme?: 'light' | 'dark';
}

/**
 * Open the onboarding page at `chrome-extension://<id>/onboarding.html` and
 * prepare it for assertion / snapshot: pin viewport, emulate reduced
 * motion, wait for fonts, kill transitions, and wait for the first React
 * mount cycle.
 *
 * Callers must seed `settings.priority` (for locale) BEFORE calling this —
 * the page reads it once on mount via `getSettings()`.
 */
export async function openOnboarding(
  context: BrowserContext,
  extensionId: string,
  options: OpenOnboardingOptions = {},
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ ...ONBOARDING_VIEWPORT });
  await page.emulateMedia(
    options.colorScheme === 'dark'
      ? { reducedMotion: 'reduce', colorScheme: 'dark' }
      : { reducedMotion: 'reduce' },
  );
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

  // Wait for React to mount under `#root`; `<main>` is the App's outer
  // container.
  await page.waitForSelector('#root main', { state: 'attached' });

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });

  // Fonts: same @fontsource bundle as popup/options. Await once explicitly
  // so the snapshot never captures a fallback-font frame.
  await page.evaluate(async () => document.fonts.ready);

  return page;
}
