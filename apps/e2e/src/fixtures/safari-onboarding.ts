/**
 * Safari-onboarding test helpers — loading the BUILT wrapper-app bundle from
 * `file://`, driving its native-bridge state, pinning a locale, and preparing
 * the page for a deterministic visual snapshot.
 *
 * Mirrors `options.ts` / `popup.ts` in shape (viewport pin, reduced-motion
 * emulation, transition-killer rule, `document.fonts.ready` await, element-
 * scoped snapshot target) so a contributor reading any of the three recognises
 * the pattern. The safari-onboarding screen differs from the extension surfaces
 * in three ways this helper encapsulates:
 *
 *   - It is NOT an extension page. There's no service worker, no
 *     `chrome.storage`, no `chrome-extension://` origin — so this fixture does
 *     NOT extend `extension.ts`. It loads the plain Vite bundle the wrapper app
 *     ships (`apps/safari-onboarding/dist/index.html`) over `file://`.
 *   - State comes from the native bridge, not storage. The Swift host normally
 *     calls a global `show(platform, enabled?, useSettings?)` via
 *     `evaluateJavaScript` after the WebView loads; here we call that same
 *     global in page context to put the screen into iOS / macOS-setup /
 *     macOS-on. `window.show` is installed at bundle module-eval and buffers
 *     the latest state, so calling it after `load` is safe even if React hasn't
 *     finished mounting — `main.tsx`'s `subscribe` replays the buffered snapshot.
 *   - Locale comes from `navigator.language`, read once at module eval by
 *     `main.tsx`. To pin uk vs en we override `navigator.language` via
 *     `addInitScript` BEFORE navigation, so the bundle reads the value we want
 *     on first (and only) evaluation.
 *
 * Determinism notes for visual snapshots (same scaffolding as the extension
 * helpers): viewport pinned, `reducedMotion: 'reduce'` emulated AND a `*` rule
 * injected to nuke animation/transition durations, `document.fonts.ready`
 * awaited. The screen uses the native system font (no `@fontsource`), so
 * `fonts.ready` is effectively immediate, but we await it anyway to match the
 * other helpers and guard against a fallback-font first frame.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';

/** `file://` URL of the BUILT onboarding bundle's HTML entry. Vite emits
 *  `dist/index.html` with `./`-relative bundle paths (`base: './'` in the
 *  app's `vite.config.ts`), so loading it over `file://` resolves
 *  `onboarding.js` / `onboarding.css` from the same dir. The Nx `test` /
 *  `test:update` targets list `safari-onboarding:build` as a dependency, so by
 *  the time this spec runs the file exists. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SAFARI_ONBOARDING_URL = pathToFileURL(
  path.resolve(__dirname, '../../../safari-onboarding/dist/index.html'),
);

/** Build a `file://` URL from an absolute filesystem path. Node's
 *  `url.pathToFileURL` would do this, but importing it for one call when we
 *  already pull in `fileURLToPath` keeps the import list tight; the manual
 *  form is fine for the always-absolute path above. */
function pathToFileURL(absPath: string): string {
  // `path.resolve` already produced an absolute, normalised path; encode it so
  // a space or other reserved char in a checkout path can't break the URL.
  return `file://${absPath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

/** Pinned visual viewport for onboarding snapshots. The screen centres its
 *  content (brand → status → CTA → feedback → trust) in a fixed-height,
 *  `overflow: hidden` body, so the viewport IS the rendered canvas. 480x640
 *  comfortably fits the tallest state (macOS-on: status dot + chip chain +
 *  "Open Safari Settings" + "Send feedback" + trust row) without clipping, and
 *  is roomy enough that the centred layout reads like the real app window. */
export const SAFARI_ONBOARDING_VIEWPORT = { width: 480, height: 640 } as const;

/** Element-scoped snapshot target. `main.tsx` mounts exactly one root `<div>`
 *  under `#root` (App's outer `flex h-full` container). It fills the viewport
 *  (`h-full`), so screenshotting it captures the full centred screen — brand,
 *  status, both buttons, trust footer — cropped to the app surface with no
 *  surrounding whitespace. */
export function onboardingRoot(page: Page): Locator {
  return page.locator('#root > div').first();
}

/** The platform/state the native `show()` bridge can put the screen into.
 *  Maps 1:1 to the three baseline states:
 *   - `ios`         → `show('ios')`            (Settings-app setup, no CTA)
 *   - `macos-setup` → `show('mac', false)`     (Safari setup + CTA)
 *   - `macos-on`    → `show('mac', true)`      ("Movar is on" + CTA) */
export type OnboardingVisualState = 'ios' | 'macos-setup' | 'macos-on';

/** The two locales the wrapper app ships (resolved from `navigator.language`).*/
export type OnboardingVisualLocale = 'en' | 'uk';

export interface OpenOnboardingOptions {
  /** Which native-bridge state to drive the screen into. */
  state: OnboardingVisualState;
  /** Locale to pin via `navigator.language` before the bundle reads it.
   *  Defaults to `'en'`. */
  locale?: OnboardingVisualLocale;
  /** Browser colour-scheme preference. The shared `@movar/ui` tokens flip on
   *  `@media (prefers-color-scheme: dark)`, so `'dark'` renders the screen in
   *  dark mode with no class toggle. Defaults to `'light'`. */
  colorScheme?: 'light' | 'dark';
}

/** Map a visual state to the `show()` argument tuple Swift would pass.
 *  `useSettings` is left at its `show()` default (modern "Settings" wording) —
 *  the legacy "Preferences" path is exercised by the unit tests, not the pixel
 *  baselines. */
function showArgsFor(state: OnboardingVisualState): [platform: 'ios' | 'mac', enabled?: boolean] {
  switch (state) {
    case 'ios': {
      return ['ios'];
    }
    case 'macos-setup': {
      return ['mac', false];
    }
    case 'macos-on': {
      return ['mac', true];
    }
  }
}

/**
 * Open the built onboarding bundle over `file://`, pin the locale + colour
 * scheme, drive the native-bridge state, and prepare the page for a snapshot:
 * pin viewport, emulate reduced motion, kill transitions, await fonts, and wait
 * for React to mount the requested state.
 *
 * Order matters and mirrors the seed-then-open rule of the extension helpers:
 *   1. `addInitScript` overriding `navigator.language` BEFORE `goto` — the
 *      bundle reads it once at module eval, so it must be in place first.
 *   2. `emulateMedia` BEFORE `goto` so the first paint is already in the right
 *      scheme / motion mode.
 *   3. `goto` the bundle. `window.show` installs synchronously as the module
 *      evaluates.
 *   4. `show(...)` in page context to push the state, then wait for the React
 *      tree to reflect it.
 */
export async function openOnboarding(page: Page, options: OpenOnboardingOptions): Promise<Page> {
  const { state, locale = 'en', colorScheme = 'light' } = options;

  await page.setViewportSize({ ...SAFARI_ONBOARDING_VIEWPORT });

  // Pin the locale the bundle resolves from `navigator.language`. `main.tsx`
  // reads it at module eval (once), so the override must be installed before
  // navigation. We redefine the getter so every read — including the one in
  // `resolveLocale(navigator.language)` — returns the pinned tag.
  await page.addInitScript((lang: string) => {
    Object.defineProperty(navigator, 'language', { value: lang, configurable: true });
  }, localeToBcp47(locale));

  // Tokens flip on `prefers-color-scheme`; reduced-motion mirrors the other
  // visual helpers (belt-and-braces with the injected CSS below).
  await page.emulateMedia(
    colorScheme === 'dark'
      ? { reducedMotion: 'reduce', colorScheme: 'dark' }
      : { reducedMotion: 'reduce' },
  );

  await page.goto(SAFARI_ONBOARDING_URL);

  // Wait for React to mount the brand/trust chrome (always present, even before
  // a state push). Proves the bundle loaded and evaluated under `file://`.
  await page.waitForSelector('#root > div', { state: 'attached' });

  // Drive the native-bridge state exactly as Swift's
  // `evaluateJavaScript("show(...)")` would. `window.show` buffers the snapshot
  // and `main.tsx`'s subscribe replays it, so a post-mount call is safe.
  await page.evaluate((args: [platform: 'ios' | 'mac', enabled?: boolean]) => {
    // `show` is installed on the global at bundle module-eval (see
    // bridge.ts, which augments `globalThis`); in a correctly built bundle it
    // is always a function here.
    globalThis.show?.(...args);
  }, showArgsFor(state));

  // Belt + braces — emulateMedia handles components gated on
  // `prefers-reduced-motion`; the injected rule handles unconditional
  // `transition-*` / `animate-*` utilities (the @movar/ui Button uses
  // `transition-colors`). Either alone leaves residual motion.
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

  // Fonts: the screen uses the native system font (no @fontsource), so this
  // resolves immediately — awaited anyway to match the other helpers and guard
  // against a fallback-font first frame on a slow runner.
  await page.evaluate(async () => document.fonts.ready);

  return page;
}

/** Expand a resolved onboarding locale to a representative BCP-47 tag for
 *  `navigator.language`. `resolveLocale` only reads the primary subtag, so the
 *  region is cosmetic — but a realistic tag (`uk-UA`, `en-US`) keeps the
 *  override faithful to what a real device reports. */
function localeToBcp47(locale: OnboardingVisualLocale): string {
  return locale === 'uk' ? 'uk-UA' : 'en-US';
}

declare global {
  // The bundle installs this global at module eval (see
  // `apps/safari-onboarding/src/bridge.ts`, which augments `globalThis`).
  // Declared here so the `page.evaluate` callback above is typed without an
  // `any` cast. `var` is required for a `globalThis` augmentation to be
  // visible through `globalThis` (same reason as bridge.ts).
  // eslint-disable-next-line no-var -- required for a globalThis augmentation
  var show:
    | ((platform: 'ios' | 'mac', enabled?: boolean, useSettings?: boolean) => void)
    | undefined;
}
