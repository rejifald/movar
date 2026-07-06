/**
 * Safari host-app test fixture — launches the React host app's built bundle
 * from `file://`, mocks the native `webkit` bridge, drives the live host state
 * via `window.show(...)`, pins the locale + color scheme, and prepares the page
 * for a deterministic visual snapshot.
 *
 * Why this is its own fixture (not the WXT `extension.ts` one):
 *   The popup/options visual suites load the real MV3 extension via
 *   `chromium.launchPersistentContext(--load-extension=…)` and drive it through
 *   `chrome.storage` + the service worker. The host app is a different beast: it
 *   is a plain React bundle the Safari wrapper's WKWebView loads from the app
 *   bundle over a `default-src 'self'` CSP, with NO extension APIs. Its only
 *   environmental inputs are
 *     - `navigator.language` (the device language → en/uk), and
 *     - the `webkit.messageHandlers.controller` bridge (`show()` pushes state in;
 *       `callNative('readSettings'|…)` round-trips `MovarSettings`).
 *   So this fixture loads `apps/safari-host-app/dist/index.html` directly via
 *   `file://` (with Chromium's `--allow-file-access-from-files` so the relative
 *   `./host-app.js` / `./host-app.css` next to it resolve), and mocks the bridge
 *   in an init script that runs BEFORE the bundle's module eval — exactly the
 *   timing `bridge.ts` documents: `window.show` / `window.__movarReply` are
 *   installed at module eval, so the mock must already be on `globalThis.webkit`
 *   when that module imports.
 *
 * The mock is intentionally tiny and deterministic:
 *   - `readSettings`  → replies `{ settings: <KNOWN_SETTINGS> }` (the legacy host
 *     wraps the record as `{ settings }`, which `hostSettingsSource.read`
 *     unwraps), so the Settings tab renders fully populated.
 *   - `writeSettings` / `feedback` / `open-preferences` → acknowledged no-ops
 *     (reply `null`); the visual suite never asserts a native side effect.
 * The About states are driven by the SAME `show(platform, enabled, useSettings)`
 * call Swift makes after `didFinish`, so the banner each test snapshots is the
 * real production branch.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, test as base } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The built single-file bundle the WKWebView loads. `safari-host-app:build`
 *  (a `dependsOn` of the e2e `test` / `test:update` targets) emits this, so by
 *  the time the suite runs the file exists. We load Vite's own `dist/index.html`
 *  (relative `./host-app.{js,css}` paths) over `file://`. */
export const HOST_APP_INDEX = path.resolve(__dirname, '../../../safari-host-app/dist/index.html');

/** Initial visual viewport for host-app snapshots, before a `fit: 'content'`
 *  capture measures + resizes to the state's natural height (see
 *  {@link measureNaturalBodyHeight}). Width mirrors a phone-class host window
 *  (the screen was designed at ~390pt); height is generous enough to lay out
 *  even the tallest state — the Settings tab with a 3-language priority list,
 *  the conceal-mode segmented control, an allowlist chip, and the locked note
 *  — without wrapping oddly while the fixture measures it. `fit: 'viewport'`
 *  captures (the sticky-nav spec) use this size as-is: a single fixed,
 *  generously-tall viewport so the pinned-tab-bar behaviour is visible for
 *  both a short-content and a tall/overflowing-content case. */
export const HOST_VIEWPORT = { width: 390, height: 1320 } as const;

/** A fully-specified, deterministic `MovarSettings` the bridge mock returns for
 *  `readSettings`, chosen to exercise the Settings tab's every section:
 *    - `enabled: true`              → master switch ON;
 *    - `priority: ['uk','en','pl']` → reorder controls in head/middle/tail
 *      disable-states (Up disabled at head, Down disabled at tail);
 *    - `contentModification: true`  → the ConcealModeField segmented control
 *      renders (it is gated off when content modification is off);
 *    - `allowlist: ['example.com']` → the Exempt-sites chip renders;
 *    - `blocked: ['ru']`            → the locked-language note resolves 'ru';
 *    - `uiLanguage: 'auto'`         → the options copy follows the device
 *      locale, matching the host shell (the wrapper has no language picker).
 *  Spread over `defaultSettings` so `schemaVersion` and any future field stay
 *  current. */
export const HOST_SETTINGS: MovarSettings = {
  ...defaultSettings,
  enabled: true,
  priority: ['uk', 'en', 'pl'],
  blocked: ['ru'],
  allowlist: ['example.com'],
  contentModification: true,
  concealMode: 'curtain',
  uiLanguage: 'auto',
};

/** The host platform/state a test drives via `show()`. `null` leaves the app in
 *  its pre-`show()` window (no platform class; the About banner stays hidden,
 *  trust row only). */
export type HostShow =
  | null
  | { platform: 'ios' }
  | { platform: 'mac'; enabled: boolean; useSettings: boolean };

/** Which tab the snapshot captures. */
export type HostTab = 'detector' | 'settings' | 'about';

/**
 * How the viewport is sized before the snapshot:
 *   - `'content'` (default) — hug the state's natural content height (app-bar
 *     + `.app` content + tab-bar, no dead space): after the tab/state is
 *     selected, {@link measureNaturalBodyHeight} measures the body's true
 *     content height with the `min-height: 100dvh` floor neutralized, then the
 *     viewport is resized to exactly that so the fixed tab bar lands directly
 *     under the content. This is the appearance-parity mode the main visual
 *     suite uses — a short state (Detector/About) no longer shows a gap above
 *     the tab bar.
 *   - `'viewport'` — keep the fixed {@link HOST_VIEWPORT} size as-is (no
 *     measure/resize). This is the behaviour-proof mode the sticky-nav suite
 *     uses: a FIXED, generously-tall viewport makes the "tab bar stays pinned
 *     to the viewport bottom" behaviour visible for both a short-content case
 *     (empty space above the bar) and a tall/overflowing-content case (content
 *     scrolls, bar still pinned) — exactly what a content-hugged capture would
 *     hide.
 */
export type HostFit = 'content' | 'viewport';

export interface OpenHostAppOptions {
  /** Device language the bundle reads from `navigator.language` (pinned BEFORE
   *  load so `resolveLocale` + the i18n provider both see it). en/uk. */
  locale: string;
  /** `prefers-color-scheme` Playwright reports — the shared design tokens flip
   *  the whole surface on this media query (no class toggle). */
  colorScheme?: 'light' | 'dark';
  /** The tab to select before snapshotting. */
  tab: HostTab;
  /** The native state to push via `show()` (drives the About banner + the
   *  `<body>` platform class). Omit / `null` for the pre-`show()` window. */
  show?: HostShow;
  /** Viewport sizing strategy for the snapshot — see {@link HostFit}. Defaults
   *  to `'content'` (the main visual suite's appearance-parity hug); the
   *  sticky-nav suite passes `'viewport'` explicitly. */
  fit?: HostFit;
}

/** Build the `file://` URL for the built bundle. `pathToFileURL` would also
 *  work; we go through it via Playwright's `goto`, which accepts a `file://`
 *  string. Each path segment is encoded so a space / unicode char in the repo
 *  path (the `.claude/worktrees/…` tree can contain either) stays valid. */
function hostAppUrl(): string {
  return `file://${HOST_APP_INDEX.split(path.sep).map(encodeURIComponent).join('/')}`;
}

/**
 * Measure the page body's TRUE natural content height — app-bar clearance +
 * `.app`'s content + tab-bar clearance, with zero dead space — for a
 * `fit: 'content'` capture.
 *
 * Naively reading `document.body.scrollHeight` as rendered does NOT give the
 * natural height: `body { min-height: 100dvh }` floors the body at the
 * viewport height, and because `body` is a column flexbox with `.app { flex: 1
 * 1 auto }` as its only flow child (`.appbar` / `.tabs` are `position: fixed`,
 * so they don't participate in body's flex layout), `.app` GROWS to fill
 * whatever height the floor leaves available — so its measured height tracks
 * the viewport, not its own content. The fixture must temporarily neutralize
 * the floor (`min-height`/`height` → `0`/`auto`, `!important` so it wins over
 * the stylesheet rule without touching the stylesheet itself) so `body`
 * collapses to `.app`'s real content height, read `scrollHeight`, then restore
 * the inline overrides — a no-op once the viewport is resized to match, since
 * the floor and the natural height coincide there.
 */
async function measureNaturalBodyHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { body } = document;
    const prevMinHeight = body.style.minHeight;
    const prevHeight = body.style.height;
    body.style.setProperty('min-height', '0', 'important');
    body.style.setProperty('height', 'auto', 'important');
    const natural = body.scrollHeight;
    body.style.minHeight = prevMinHeight;
    body.style.height = prevHeight;
    return natural;
  });
}

/**
 * Launch the host-app bundle and prepare it for assertion / snapshot.
 *
 * Order is load-bearing (mirrors `bridge.ts`'s documented timing):
 *   1. pin `navigator.language` + mock `webkit` in an init script — runs before
 *      the bundle's module eval, so the locale read and the `show()`/`callNative`
 *      installs see the mock already in place;
 *   2. `goto(file://…)`;
 *   3. wait for the tab bar to mount (proves React rendered past the shell);
 *   4. drive `show()` (if asked) and select the tab (+ wait for Settings to
 *      populate) — the state must be fully settled BEFORE the next step, since
 *      a `fit: 'content'` measurement reads the just-selected state's height;
 *   5. `fit: 'content'` (default) only: measure the natural body height (see
 *      {@link measureNaturalBodyHeight}) and resize the viewport to it, so the
 *      fixed tab bar lands directly under the content with no gap. `fit:
 *      'viewport'` skips this — the viewport stays the fixed
 *      {@link HOST_VIEWPORT} size, so the sticky-nav behaviour (bar pinned at
 *      the viewport bottom, whether content under-fills or overflows it)
 *      stays visible;
 *   6. kill transitions + await `document.fonts.ready` (the surface uses
 *      `-apple-system`, but the lucide-react glyphs + any web-ish metrics settle
 *      under fonts.ready) before returning.
 */
export async function openHostApp(
  context: BrowserContext,
  options: OpenHostAppOptions,
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ ...HOST_VIEWPORT });
  await page.emulateMedia(
    options.colorScheme === 'dark'
      ? { reducedMotion: 'reduce', colorScheme: 'dark' }
      : { reducedMotion: 'reduce', colorScheme: 'light' },
  );

  // Init script: pin the device language and install the mocked native bridge
  // BEFORE any bundle code runs. `bridge.ts` installs `window.show` /
  // `window.__movarReply` at module eval and reads `navigator.language` at
  // mount, so both must be ready here. The mock answers `readSettings` with the
  // known settings (wrapped as the legacy host does) and acks every other action
  // with a `null` reply so fire-and-forget calls resolve cleanly.
  await page.addInitScript(
    ({ settings, locale }: { settings: MovarSettings; locale: string }) => {
      Object.defineProperty(navigator, 'language', { value: locale, configurable: true });
      const bridge = {
        messageHandlers: {
          controller: {
            postMessage: (message: { type: string; id: number; payload: unknown }) => {
              const reply = message.type === 'readSettings' ? JSON.stringify({ settings }) : null;
              // Reply on a macrotask, the way Swift's async `evaluateJavaScript`
              // round-trip lands after the post returns.
              setTimeout(() => {
                const deliver = (
                  globalThis as { __movarReply?: (id: number, json: string | null) => void }
                ).__movarReply;
                deliver?.(message.id, reply);
              }, 0);
            },
          },
        },
      };
      (globalThis as { webkit?: unknown }).webkit = bridge;
    },
    { settings: HOST_SETTINGS, locale: options.locale },
  );

  await page.goto(hostAppUrl());
  // The tab bar is platform-independent and renders as soon as the shell mounts;
  // its presence proves the bundle loaded over `file://` and React committed.
  await page.waitForSelector('.tabs', { state: 'attached' });

  // Drive the native state feed (About banner + `<body>` platform class) the
  // same way Swift does after `didFinish`.
  if (options.show != null) {
    const s = options.show;
    await page.evaluate((show: HostShow) => {
      const fn = (
        globalThis as {
          show?: (platform: string, enabled?: boolean, useSettings?: boolean) => void;
        }
      ).show;
      if (!fn || show == null) return;
      if (show.platform === 'ios') fn('ios');
      else fn('mac', show.enabled, show.useSettings);
    }, s);
  }

  // Select the tab to snapshot. The shell is a roving-tabindex tablist; a click
  // is exactly the user gesture, and it flips `hidden` on the panels.
  await page.locator(`.tab[data-tab="${options.tab}"]`).click();

  // The Settings tab renders nothing until `source.read()` (the mocked
  // `readSettings`) resolves and React commits the populated form. Wait for the
  // master-switch row so a snapshot can't capture the pre-read blank frame.
  if (options.tab === 'settings') {
    await page.waitForSelector('.panel .row-label', { state: 'visible' });
  }

  // `fit: 'content'` (the default): hug the now-settled state's natural
  // height so the fixed tab bar lands directly under the content instead of
  // at the bottom of a fixed, generously-tall viewport. Must run AFTER the
  // tab/state selection above — the natural height is state-dependent (the
  // Settings tab's 3-language priority list is taller than the idle Detector
  // card) — and BEFORE the motion-kill/fonts-ready tail, since neither of
  // those affects layout height.
  if ((options.fit ?? 'content') === 'content') {
    const naturalHeight = await measureNaturalBodyHeight(page);
    await page.setViewportSize({ width: HOST_VIEWPORT.width, height: naturalHeight });
  }

  // Belt + braces motion kill — `emulateMedia` covers `prefers-reduced-motion`
  // gates, this rule covers unconditional `transition-*` utilities (the tab
  // colour transition, the Switch thumb, the conceal-mode segmented control).
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

  // Fonts settle before the first snapshotted frame so glyph metrics are stable
  // across runners (macOS local vs CI Linux).
  await page.evaluate(async () => document.fonts.ready);

  return page;
}

/** Element-scoped snapshot target. `#root` is `display:contents` (no box of its
 *  own), so the real chrome is the `<body>`: it carries the page background, the
 *  full padding, the `<main class="app">` content, and the `position:fixed` tab
 *  bar painted over it. A `body`-element screenshot captures exactly what the
 *  WKWebView shows, cropped to the pinned viewport (the body fills it via
 *  `min-height:100%`), with no surrounding browser chrome. */
export function hostRoot(page: Page): Locator {
  return page.locator('body');
}

/** Per-launch context for the host-app suite: a plain Chromium (NO extension)
 *  with `--allow-file-access-from-files` so the bundle's relative assets resolve
 *  under `file://`, and `deviceScaleFactor: 1` so CSS pixels are constant across
 *  1x / 2x hosts — the same pixel-stability guarantee the extension fixture
 *  gives the popup/options baselines. */
export const test = base.extend<{ hostContext: BrowserContext }>({
  hostContext: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext('', {
      // Match the extension fixture: when headless, force the full `chromium`
      // channel (the default headless-shell binary is fine for a plain page,
      // but pinning the same binary the other suites use keeps rendering — and
      // thus the baselines — consistent across the repo's visual specs).
      ...(headless ? { headless: true, channel: 'chromium' as const } : { headless: false }),
      args: [
        // The bundle loads `./host-app.js` / `./host-app.css` as sibling files
        // over `file://`; without this flag Chromium blocks the cross-`file://`
        // module fetch and the page renders blank.
        '--allow-file-access-from-files',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      deviceScaleFactor: 1,
    });
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
export type { MovarSettings } from '@movar/settings';
