/**
 * Diagnostics-panel visual-regression suite. Loads the diagnostics e2e harness
 * (`apps/diagnostics/dist-harness/index.html`) from `file://`, which renders the
 * REAL `Widget` (the in-page FAB + floating panel) against a hand-pinned
 * `PageDiagnostics` fixture, then compares pixels against a committed baseline.
 *
 * This is the appearance-parity coverage for the maintainer-only diagnostics dev
 * extension — the shadow-root panel injected into pages, which had NO pixel
 * coverage before. Its snapshot is normally built from the live DOM (drifts per
 * page, untestable), so the harness pins one fixture that populates every tab and
 * every visual branch the shared `@movar/theme` tokens touch (see
 * `apps/diagnostics/e2e-harness/fixture.ts`): blocked vs kept cards, franc
 * agree/disagree marks, an `unknown` card, active + blocked picker chips, and the
 * page-mode / page-language signal chains.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Matrix — (collapsed FAB + 4 panel tabs) × {light, dark} = 10 baselines
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌──────────┬──────────────────────────────────────────────────────┐
 *   │ State    │ What it pins                                          │
 *   ├──────────┼──────────────────────────────────────────────────────┤
 *   │ fab      │ the collapsed floating action button + its "would     │
 *   │          │ block" count badge                                    │
 *   │ content  │ content cards: kind chip, blocked badge, franc ✓/⚠,   │
 *   │          │ language tally, per-card sample                        │
 *   │ pickers  │ an on-site picker's language chips (active ● + blocked)│
 *   │ mode     │ page-mode verdict (dark) + its signal chain           │
 *   │ language │ page-language verdict (blocked) + its signal chain    │
 *   └──────────┴──────────────────────────────────────────────────────┘
 *
 * Axes covered:
 *   - prefers-color-scheme (light vs dark) — the panel reads the shared tokens
 *     on `:root`/`:host`, so each light cell has a dark counterpart and a
 *     dark-only regression can't hide behind a passing light baseline.
 *
 * English-only (the dev extension ships no i18n — see `language-name.ts`), so
 * there is no locale axis.
 *
 * Baseline workflow: identical to the other offline visual specs — regenerate
 * the committed Linux PNGs in the pinned Playwright container via
 * `pnpm e2e:baselines -- diagnostics.visual.spec.ts`. Don't run `:update` on a
 * macOS host (it writes a `*-darwin.png` CI doesn't use).
 */
import { expect, test } from '../fixtures/diagnostics';
import { diagnosticsFab, diagnosticsPanel, openDiagnostics } from '../fixtures/diagnostics';

/** The four panel tabs, each with its tab-button label and baseline-filename stem. */
const TABS = [
  { label: 'Content', stem: 'content' },
  { label: 'Pickers', stem: 'pickers' },
  { label: 'Page mode', stem: 'mode' },
  { label: 'Page lang', stem: 'language' },
] as const;

const SCHEMES = [
  { colorScheme: 'light', suffix: '' },
  { colorScheme: 'dark', suffix: '-dark' },
] as const;

for (const scheme of SCHEMES) {
  test.describe(`diagnostics panel — visual${scheme.suffix ? ' (dark mode)' : ''}`, () => {
    test('collapsed FAB', async ({ diagnosticsContext }) => {
      const page = await openDiagnostics(diagnosticsContext, { colorScheme: scheme.colorScheme });
      await expect(diagnosticsFab(page)).toHaveScreenshot(`diagnostics-fab${scheme.suffix}.png`);
      await page.close();
    });

    for (const tab of TABS) {
      test(`panel — ${tab.stem}`, async ({ diagnosticsContext }) => {
        const page = await openDiagnostics(diagnosticsContext, { colorScheme: scheme.colorScheme });

        // Toggle the panel open, then select the tab. The panel is the named
        // region; assert the tab is selected before snapshotting so the capture
        // can't race the click.
        await diagnosticsFab(page).click();
        const panel = diagnosticsPanel(page);
        await expect(panel).toBeVisible();
        const tabButton = page.getByRole('tab', { name: tab.label });
        await tabButton.click();
        await expect(tabButton).toHaveAttribute('aria-selected', 'true');

        await expect(panel).toHaveScreenshot(`diagnostics-panel-${tab.stem}${scheme.suffix}.png`);
        await page.close();
      });
    }
  });
}
