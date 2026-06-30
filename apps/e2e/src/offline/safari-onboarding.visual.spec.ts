/**
 * Safari-onboarding visual-regression suite. Loads the BUILT wrapper-app
 * bundle (`apps/safari-onboarding/dist/index.html`) over `file://`, drives the
 * native-bridge state the Swift host would push, pins the locale + colour
 * scheme, and compares pixels against a committed baseline.
 *
 * Unlike the popup/options suites this is NOT an extension page — there's no
 * service worker, no `chrome.storage`, no `chrome-extension://` origin. The
 * helper (`fixtures/safari-onboarding.ts`) loads the plain Vite bundle the
 * wrapper app ships and calls the global `show(...)` to put the screen into one
 * of its three states, exactly as `ViewController.swift` does at runtime. The
 * Nx `test` / `test:update` targets list `safari-onboarding:build` as a
 * dependency (mirroring `extension:build`) so the bundle exists before this
 * runs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * State matrix — 3 states × 2 locales × 2 schemes = 12 baselines
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌──────────────┬──────────────────────────┬───────────────────────────┐
 *   │ State        │ Bridge call              │ What's on screen          │
 *   ├──────────────┼──────────────────────────┼───────────────────────────┤
 *   │ ios          │ show('ios')              │ Settings-app setup, NO CTA│
 *   │ macos-setup  │ show('mac', false)       │ Safari setup + CTA        │
 *   │ macos-on     │ show('mac', true)        │ "Movar is on" + CTA       │
 *   └──────────────┴──────────────────────────┴───────────────────────────┘
 *
 * Axes covered:
 *   - platform/state (ios / macos-setup / macos-on) — the three status blocks
 *     and the presence/absence of the macOS "Open Safari Settings" CTA
 *   - navigator.language (en vs uk) — every translated string, INCLUDING the
 *     new "Send feedback" button copy
 *   - prefers-color-scheme (light vs dark) — the shared @movar/ui token flip
 *     across every surface (same tokens as popup/options)
 *
 * The "Send feedback" button (in the trust footer, every state) appears in all
 * 12 baselines — that's the point of regenerating them after adding it.
 *
 * Dark-mode coverage: every light case has a dark counterpart so a dark-only
 * regression can't hide behind a passing light baseline — same rationale as the
 * popup/options suites.
 *
 * Why a separate file (not folded into a structural spec): pixel failures and
 * structural failures are different CI signals. This file owns its baselines
 * under `safari-onboarding.visual.spec.ts-snapshots/`.
 *
 * Baseline workflow (mirrors options/popup):
 *   - `pnpm --filter @movar/e2e test:update -- --grep "safari-onboarding"`
 *     regenerates ONLY these baselines (the grep keeps popup/options snapshots
 *     untouched). Run when an onboarding change is intentional; review the diff
 *     in `git status`.
 *   - Baselines are platform-specific — Playwright stamps the OS into the
 *     filename (`*-chromium-darwin.png`, `*-chromium-linux.png`). The repo
 *     commits `*-darwin.png` (regenerated locally via `:update`); CI runs Linux
 *     and lands the missing `*-linux.png` via the `regenerate-baselines`
 *     GitHub Actions workflow on first push of a new spec.
 */
import { expect, test } from '@playwright/test';
import { onboardingRoot, openOnboarding } from '../fixtures/safari-onboarding';
import type { OnboardingVisualLocale, OnboardingVisualState } from '../fixtures/safari-onboarding';

/**
 * The bundle is loaded over `file://` (see the fixture), and its entry is an ES
 * `<script type="module">`. Chromium enforces CORS on module scripts, and a
 * `file://` document has an opaque (`null`) origin — so by default the module
 * (and the stylesheet) are blocked and React never mounts. `--allow-file-
 * access-from-files` lifts that restriction for `file://`→`file://` fetches,
 * which is exactly the relaxed policy the real WKWebView host runs under. We
 * also pin `channel: 'chromium'`: Playwright's default headless binary
 * (`chromium-headless-shell`) is a stripped build, and we validate against the
 * full Chromium that the extension fixture also uses, so the baseline glyphs/
 * AA match the rest of the suite's `-chromium-` snapshots. Scoped to this spec
 * via `test.use` so the extension specs are untouched. */
test.use({
  channel: 'chromium',
  launchOptions: { args: ['--allow-file-access-from-files'] },
});

/** The three native-bridge states, paired with a settle signal (a locale-
 *  independent role/structure assertion that proves React reflected the state
 *  before we snapshot) and the snapshot-name fragment. */
const STATES: readonly {
  state: OnboardingVisualState;
  slug: string;
  /** Assert the screen settled into this state, in a locale-agnostic way. */
  settle: (root: ReturnType<typeof onboardingRoot>) => Promise<void>;
}[] = [
  {
    state: 'ios',
    slug: 'ios',
    // iOS shows a status heading and NO macOS CTA button. Asserting the button
    // is absent proves we rendered the iOS block, not a macOS one — without
    // depending on any translated string.
    settle: async (root) => {
      await expect(root.getByRole('heading', { level: 2 })).toBeVisible();
      await expect(root.getByRole('button', { name: /safari/i })).toHaveCount(0);
    },
  },
  {
    state: 'macos-setup',
    slug: 'macos-setup',
    // macOS renders the "Open Safari Settings" CTA. Its accessible name is the
    // English label in en and the Ukrainian label in uk, so match on the
    // ExternalLink-bearing button by its role + the shared "Safari" token that
    // appears in both locales' CTA copy.
    settle: async (root) => {
      await expect(root.getByRole('button', { name: /safari/i })).toBeVisible();
    },
  },
  {
    state: 'macos-on',
    slug: 'macos-on',
    // macOS-on still offers the CTA; the status-dot heading is the
    // discriminator vs setup, but a role-only settle is enough to gate the
    // snapshot — the pixels assert the rest.
    settle: async (root) => {
      await expect(root.getByRole('button', { name: /safari/i })).toBeVisible();
    },
  },
];

const LOCALES: readonly OnboardingVisualLocale[] = ['en', 'uk'];

/** Build the snapshot name per the options/popup convention:
 *  `safari-onboarding-<state>-<locale>[-dark].png`. Playwright appends the
 *  `-chromium-darwin` / `-chromium-linux` project+platform suffix itself. */
function snapshotName(slug: string, locale: OnboardingVisualLocale, dark: boolean): string {
  return `safari-onboarding-${slug}-${locale}${dark ? '-dark' : ''}.png`;
}

test.describe('safari onboarding — visual', () => {
  for (const { state, slug, settle } of STATES) {
    for (const locale of LOCALES) {
      test(`${slug} state, ${locale} UI`, async ({ page }) => {
        await openOnboarding(page, { state, locale });
        const root = onboardingRoot(page);
        // The feedback button lives in the trust footer in every state; assert
        // its role is present (locale-agnostic) so a regression that drops it
        // surfaces structurally before the pixel diff.
        await expect(root.getByRole('button', { name: /.+/ }).last()).toBeVisible();
        await settle(root);

        await expect(root).toHaveScreenshot(snapshotName(slug, locale, false));
      });
    }
  }
});

test.describe('safari onboarding — visual (dark mode)', () => {
  // Dark-mode counterpart of each light case above. Identical setup except for
  // `colorScheme: 'dark'`, which triggers the `@media (prefers-color-scheme:
  // dark)` rules in the shared @movar/ui tokens. Settle signals are role-based
  // so they fire identically in either scheme — only the baseline filename and
  // the rendered pixels change.
  for (const { state, slug, settle } of STATES) {
    for (const locale of LOCALES) {
      test(`${slug} state, ${locale} UI`, async ({ page }) => {
        await openOnboarding(page, { state, locale, colorScheme: 'dark' });
        const root = onboardingRoot(page);
        await expect(root.getByRole('button', { name: /.+/ }).last()).toBeVisible();
        await settle(root);

        await expect(root).toHaveScreenshot(snapshotName(slug, locale, true));
      });
    }
  }
});
