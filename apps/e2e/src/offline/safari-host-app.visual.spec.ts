/**
 * Safari host-app visual-regression suite. Loads the React host app's BUILT
 * bundle (`apps/safari-host-app/dist/index.html`) from `file://`, mocks the
 * native `webkit` bridge, pins the device locale + color scheme, drives the
 * live host state via `window.show(...)`, selects a tab, and compares pixels
 * against a committed baseline.
 *
 * This is the appearance-parity coverage for the host app the Safari wrapper's
 * WKWebView renders (Detector / Settings / About tabs) — the React
 * re-platforming of the frozen magical-snyder `Main.html` screen. The matrix
 * pins every tab on BOTH platforms — iOS (390px, the phone-class window) and
 * macOS (480px, the native window's `contentRect` width) — across both shipped
 * locales and both color schemes, so a regression in any one cell can't hide
 * behind a passing neighbour.
 *
 * ─────────────────────────────────────────────────────────────────────
 * State matrix — 7 states × {en, uk} × {light, dark} = 28 baselines
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌───────────────────┬───────┬─────────────────────────────────────┐
 *   │ State             │ Width │ What it pins                        │
 *   ├───────────────────┼───────┼─────────────────────────────────────┤
 *   │ detector-ios      │ 390   │ the on-device Cyrillic checker card │
 *   │ detector-macOS    │ 480   │ (idle, empty input → no verdict     │
 *   │                   │       │ box) — iOS phone width vs the wider │
 *   │                   │       │ macOS window reflow                 │
 *   │ settings-ios      │ 390   │ the full options surface: master    │
 *   │ settings-macOS    │ 480   │ switch, 3-language priority (head/  │
 *   │                   │       │ mid/tail reorder states), Conceal-  │
 *   │                   │       │ ModeField segmented control, allow- │
 *   │                   │       │ list chip, locked-language note     │
 *   │ about-ios         │ 390   │ iOS enablement banner: "One last    │
 *   │                   │       │ step" + Settings→Safari→Extensions  │
 *   │                   │       │ chips + feedback button (iOS-only)  │
 *   │ about-macOS-setup │ 480   │ macOS off: "One last step" + Safari │
 *   │                   │       │ →Settings→Extensions chips + "Open  │
 *   │                   │       │ Safari Settings" CTA                │
 *   │ about-macOS-on    │ 480   │ macOS enabled: "Movar is on" + green│
 *   │                   │       │ dot + chips + CTA                   │
 *   └───────────────────┴───────┴─────────────────────────────────────┘
 *
 * Axes covered:
 *   - platform (iOS vs macOS) — every state is driven by the real `show()` call
 *     Swift makes, which sets the `<html>` platform class (macOS adds the
 *     `.platform-mac` bottom-padding end-gap; the About banner picks its iOS /
 *     macOS-setup / macOS-on branch) and, in this suite, its window width;
 *   - window width (390 iPhone vs 480 macOS) — both under the 600px
 *     `--content-max` cap, so this is a real single-column reflow axis (text
 *     re-wraps, the column breathes), not a layout-mode switch. macOS's true
 *     `contentRect` is 480×700 (`macOS (App)/…/Main.storyboard`);
 *   - locale (en vs uk) — every host-shell + options string, resolved from the
 *     pinned `navigator.language`;
 *   - prefers-color-scheme (light vs dark) — the shared `@movar/theme` tokens
 *     flip the whole surface on this media query (no class toggle), so each
 *     light cell has a dark counterpart.
 *
 * Axes intentionally NOT exercised here:
 *   - the Detector's verdict states (uk/ru/other/unknown dots) — those are
 *     pure `@movar/lang-detect` output rendered into a small box, covered by
 *     `DetectorTab.test.tsx`'s unit assertions; a pixel baseline per verdict
 *     would be churn for no extra signal beyond the idle card here;
 *   - the macOS ≤12 "Preferences" wording (`useSettings: false`) — a one-word
 *     copy swap covered structurally in `AboutTab.test.tsx`.
 *
 * Baseline workflow (matches popup/options):
 *   - `pnpm --filter @movar/e2e test` runs every offline spec; visual failures
 *     show actual/expected/diff PNGs under `playwright-report/`.
 *   - Regenerate baselines with
 *     `pnpm e2e:baselines -- safari-host-app.visual.spec.ts` (inside the
 *     pinned Playwright container). The e2e:test:update target already passes
 *     `--update-snapshots=all`, so sub-tolerance intentional changes are
 *     rewritten too, not silently left as a stale PNG.
 *   - A single Linux set (`*-linux.png`) is committed, generated in the same
 *     container CI runs so it matches byte-for-byte. Don't run `:update` on
 *     your host — it writes a `*-darwin.png` CI does not use.
 */
import { expect, test } from '../fixtures/host';
import { hostRoot, openHostApp } from '../fixtures/host';

/** iPhone-class host window width. */
const IOS_WIDTH = 390;
/** Native macOS window content width (`Main.storyboard` `contentRect` 480×700). */
const MAC_WIDTH = 480;

/** The seven states the matrix snapshots — each of the three tabs on iOS (390px)
 *  and on macOS (480px), with the About tab split into its off/on macOS branches.
 *  `show` is the `show()` payload Swift makes after `didFinish` (it sets the
 *  `<html>` platform class + the About banner branch); `width` is the platform's
 *  window width. `name` is the baseline-filename stem
 *  (`safari-host-app-<name>-<locale>[-dark]`). The macOS Detector/Settings states
 *  pass `enabled`/`useSettings` that only the About banner reads — inert on those
 *  tabs, but the type wants a complete `mac` payload. */
const STATES = [
  // iOS (390px, platform-ios).
  { name: 'detector-ios', tab: 'detector', width: IOS_WIDTH, show: { platform: 'ios' } },
  { name: 'settings-ios', tab: 'settings', width: IOS_WIDTH, show: { platform: 'ios' } },
  { name: 'about-ios', tab: 'about', width: IOS_WIDTH, show: { platform: 'ios' } },
  // macOS (480px, platform-mac).
  {
    name: 'detector-macOS',
    tab: 'detector',
    width: MAC_WIDTH,
    show: { platform: 'mac', enabled: true, useSettings: true },
  },
  {
    name: 'settings-macOS',
    tab: 'settings',
    width: MAC_WIDTH,
    show: { platform: 'mac', enabled: true, useSettings: true },
  },
  {
    name: 'about-macOS-setup',
    tab: 'about',
    width: MAC_WIDTH,
    show: { platform: 'mac', enabled: false, useSettings: true },
  },
  {
    name: 'about-macOS-on',
    tab: 'about',
    width: MAC_WIDTH,
    show: { platform: 'mac', enabled: true, useSettings: true },
  },
] as const;

const LOCALES = [
  { tag: 'en-US', suffix: 'en' },
  { tag: 'uk-UA', suffix: 'uk' },
] as const;

test.describe('safari host-app — visual', () => {
  for (const locale of LOCALES) {
    for (const state of STATES) {
      test(`${state.name} — ${locale.suffix}`, async ({ hostContext }) => {
        const page = await openHostApp(hostContext, {
          locale: locale.tag,
          tab: state.tab,
          show: state.show,
          width: state.width,
        });
        await expect(hostRoot(page)).toHaveScreenshot(
          `safari-host-app-${state.name}-${locale.suffix}.png`,
        );
        await page.close();
      });
    }
  }
});

test.describe('safari host-app — visual (dark mode)', () => {
  // Dark counterparts of every light cell above — identical setup save the
  // `colorScheme: 'dark'` that flips the shared tokens. Only the baseline
  // filename and the rendered pixels change, so a dark-only regression (a token
  // that loses contrast on the dark surface) can't hide behind a green light
  // baseline.
  for (const locale of LOCALES) {
    for (const state of STATES) {
      test(`${state.name} — ${locale.suffix}`, async ({ hostContext }) => {
        const page = await openHostApp(hostContext, {
          locale: locale.tag,
          tab: state.tab,
          show: state.show,
          colorScheme: 'dark',
          width: state.width,
        });
        await expect(hostRoot(page)).toHaveScreenshot(
          `safari-host-app-${state.name}-${locale.suffix}-dark.png`,
        );
        await page.close();
      });
    }
  }
});
