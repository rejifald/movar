/**
 * Options-page test helpers — opening, preparing for visual snapshots,
 * and pinning the React-mount target for screenshot scoping.
 *
 * Mirrors `popup.ts` in shape so a contributor reading either file
 * recognises the pattern. The two pages differ in:
 *   - viewport (popup is 360px wide; options is wide enough to render
 *     the lg+ two-column grid with the right-hand aside in view)
 *   - mount target (popup's `#root > div` vs options' `<main>`)
 *
 * Both share the determinism scaffolding: emulate reduced motion, inject
 * a transition-killer rule, await `document.fonts.ready`. The shared
 * fixture (`extension.ts`) pins `--lang=en-US` and `deviceScaleFactor: 1`
 * so locale-derived UI and pixel scale are constant across runners.
 *
 * Determinism notes for visual snapshots:
 *  - Viewport pinned at 1200x900. Tailwind's `lg` breakpoint is 1024px,
 *    so 1200 reliably activates the `lg:grid-cols-[1fr_240px]` layout
 *    and the right-hand aside is in the baseline. Height covers the
 *    default settings render comfortably; `priority-three-langs` adds
 *    one extra row that still fits without scroll.
 *  - All non-default seeding (settings) happens BEFORE navigation. The
 *    options page reads `getSettings()` in a useEffect — a mid-mount
 *    storage mutation would silently produce a wrong-state snapshot.
 *    Seed-then-open is the only safe order, same as the popup.
 */
import type { BrowserContext, Locator, Page } from '@playwright/test';

/** Pinned visual viewport for options snapshots. Width is past Tailwind's
 *  `lg` breakpoint (1024px) so the two-column grid + aside render; height
 *  covers the default + 3-language priority states without scroll. The
 *  `<main>` element has `min-h-screen`, so the rendered surface fills
 *  the viewport regardless of content length. */
export const OPTIONS_VIEWPORT = { width: 1200, height: 900 } as const;

/** Element-scoped snapshot target. The options page mounts a single
 *  `<main>` inside `#root` with `bg-bg min-h-screen` — pinning the
 *  screenshot to this element captures the page exactly as a user sees
 *  it (background, grid, footer) and excludes any browser chrome around
 *  it. */
export function optionsRoot(page: Page): Locator {
  return page.locator('main');
}

/** Options accepted by `openOptions`. Mirrors `OpenPopupOptions` in
 *  popup.ts — both surfaces respond to the same browser-level media
 *  queries (the design tokens flip on `prefers-color-scheme: dark`),
 *  so the option lives on both helpers with the same shape. */
export interface OpenOptionsOptions {
  /** Browser color-scheme preference Playwright reports to the page.
   *  Drives any `@media (prefers-color-scheme: …)` rules — the Movar
   *  extension's design tokens (packages/ui/src/tokens.css) flip on
   *  exactly this media query, so passing `'dark'` here renders the
   *  options surface in dark mode without any setting flip or class
   *  toggle. */
  colorScheme?: 'light' | 'dark';
}

/**
 * Open the options page at `chrome-extension://<id>/options.html` and
 * prepare it for assertion / snapshot: pin viewport, emulate reduced
 * motion, wait for fonts, kill transitions, and wait for the first
 * React mount cycle (the useEffect that reads settings from storage).
 *
 * Callers must seed any non-default storage BEFORE calling this — the
 * options page reads settings once on mount.
 */
export async function openOptions(
  context: BrowserContext,
  extensionId: string,
  options: OpenOptionsOptions = {},
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ ...OPTIONS_VIEWPORT });
  // Match the popup helper's shape: pass `colorScheme: 'dark'` only
  // when explicitly asked for, so the default light path stays identical
  // to the pre-dark-mode behaviour.
  await page.emulateMedia(
    options.colorScheme === 'dark'
      ? { reducedMotion: 'reduce', colorScheme: 'dark' }
      : { reducedMotion: 'reduce' },
  );
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  // Wait for React to mount under `#root`. `<main>` is the App's outer
  // container; its appearance proves the React tree rendered past the
  // I18nProvider into OptionsBody.
  await page.waitForSelector('#root main', { state: 'attached' });

  // Belt + braces — emulateMedia handles components that gate on
  // `prefers-reduced-motion`, the injected rule handles components that
  // unconditionally use `transition-*` / `animate-*`. Either alone would
  // leave residual motion in some Tailwind utilities.
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

  // Fonts: the options page uses the same @fontsource/manrope +
  // ibm-plex-mono as the popup. A snapshot taken before fonts.ready
  // resolves uses the platform's fallback font — different glyph
  // metrics on macOS vs Linux. Await once explicitly; subsequent reads
  // are cached.
  await page.evaluate(async () => document.fonts.ready);

  return page;
}
