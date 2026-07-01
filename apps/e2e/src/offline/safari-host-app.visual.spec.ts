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
 * pins each tab (and each About platform/state branch) across both shipped
 * locales and both color schemes, so a regression in any one cell can't hide
 * behind a passing neighbour.
 *
 * ─────────────────────────────────────────────────────────────────────
 * State matrix — 5 states × {en, uk} × {light, dark} = 20 baselines
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌───────────────────┬─────────────────────────────────────────────┐
 *   │ State             │ What it pins                                 │
 *   ├───────────────────┼─────────────────────────────────────────────┤
 *   │ detector          │ the on-device Cyrillic checker card (idle,   │
 *   │                   │ empty input → no verdict box)                │
 *   │ settings          │ the full options surface: master switch,     │
 *   │                   │ 3-language priority (head/mid/tail reorder    │
 *   │                   │ states), ConcealModeField segmented control,  │
 *   │                   │ allowlist chip, locked-language note          │
 *   │ about-ios         │ iOS enablement banner: "One last step" +      │
 *   │                   │ Settings→Safari→Extensions chips + feedback   │
 *   │                   │ button (iOS-only) + trust row                 │
 *   │ about-macOS-setup │ macOS off: "One last step" + Safari→Settings  │
 *   │                   │ →Extensions chips + "Open Safari Settings" CTA│
 *   │ about-macOS-on    │ macOS enabled: "Movar is on" + green dot +    │
 *   │                   │ chips + CTA                                   │
 *   └───────────────────┴─────────────────────────────────────────────┘
 *
 * Axes covered:
 *   - locale (en vs uk) — every host-shell + options string, resolved from the
 *     pinned `navigator.language`;
 *   - prefers-color-scheme (light vs dark) — the shared `@movar/ui` tokens flip
 *     the whole surface on this media query (no class toggle), so each light
 *     cell has a dark counterpart;
 *   - the About banner's three production branches (iOS / macOS-setup /
 *     macOS-on), each driven by the real `show()` call Swift makes.
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
 *   - macOS baselines are regenerated locally with
 *     `pnpm --filter @movar/e2e exec playwright test safari-host-app.visual --update-snapshots=all`.
 *     `=all` (not a bare `--update-snapshots`) is required: a bare update leaves
 *     a baseline untouched when the diff is under tolerance, so a sub-tolerance
 *     intentional change would silently keep the stale PNG.
 *   - Only `*-darwin.png` is committed here; CI runs Linux and the
 *     `regenerate-baselines` workflow lands the `*-linux.png` set on first push.
 */
import { expect, test } from '../fixtures/host';
import { hostRoot, openHostApp } from '../fixtures/host';

/** The five states the matrix snapshots, each with the `show()` payload that
 *  drives it and the tab it lives on. `name` is the baseline-filename stem
 *  (`safari-host-app-<name>-<locale>[-dark]`). */
const STATES = [
  { name: 'detector', tab: 'detector', show: null },
  { name: 'settings', tab: 'settings', show: null },
  { name: 'about-ios', tab: 'about', show: { platform: 'ios' } },
  {
    name: 'about-macOS-setup',
    tab: 'about',
    show: { platform: 'mac', enabled: false, useSettings: true },
  },
  {
    name: 'about-macOS-on',
    tab: 'about',
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
        });
        await expect(hostRoot(page)).toHaveScreenshot(
          `safari-host-app-${state.name}-${locale.suffix}-dark.png`,
        );
        await page.close();
      });
    }
  }
});
