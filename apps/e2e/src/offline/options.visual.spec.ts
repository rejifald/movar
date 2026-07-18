/**
 * Options visual-regression suite. Loads the real WXT-built extension,
 * stamps a controlled settings state, opens the options page as a tab,
 * and compares pixels against a committed baseline.
 *
 * ─────────────────────────────────────────────────────────────────────
 * State matrix
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────┬──────────────┬─────────────────────────┐
 *   │ Test case                   │ Visual snap? │ Why                     │
 *   ├─────────────────────────────┼──────────────┼─────────────────────────┤
 *   │ default-en                  │ yes          │ canonical state         │
 *   │ default-uk                  │ yes          │ Ukrainian translations  │
 *   │ priority-three-langs        │ yes          │ reorder enable states   │
 *   │ default-en           (dark) │ yes          │ token flip, canonical   │
 *   │ default-uk           (dark) │ yes          │ token flip + UA glyphs  │
 *   │ priority-three-langs (dark) │ yes          │ accent surface in dark  │
 *   └─────────────────────────────┴──────────────┴─────────────────────────┘
 *
 * Axes covered:
 *   - settings.uiLanguage (en vs uk) — every translated string in the
 *     options surface
 *   - settings.priority length (2 vs 3) — moveUp/moveDown button enable
 *     state at every position (head/middle/tail)
 *   - prefers-color-scheme (light vs dark) — token flip across every
 *     surface, including the accent surface that highlights the head
 *     priority item (whose contrast is the most fragile in dark mode
 *     because both the accent and its surface flip role)
 *
 * Dark-mode coverage:
 *   - The extension's design tokens (packages/ui/src/tokens.css) flip on
 *     `@media (prefers-color-scheme: dark)`. Playwright reports the
 *     preference via `emulateMedia({ colorScheme: 'dark' })`, which the
 *     `openOptions` helper threads through. No settings flip, no class
 *     toggle — the tokens do all the work.
 *   - Every light-mode visual case has a dark-mode counterpart so a
 *     dark-only regression can't hide behind a passing light baseline.
 *
 * Axes intentionally NOT exercised here:
 *   - Deferred blocked-language / exempt-site editors — covered
 *     structurally in options.spec.ts because the assertion is "the
 *     controls do not render" rather than pixel-level
 *
 * Why these are split out from `options.spec.ts`:
 *   - Structural failures ("a section didn't render") and pixel failures
 *     ("the chip's border radius bumped 1px") are very different signals
 *     in CI triage. Two files = two reports, two failure categories.
 *   - The visual file owns its baselines under
 *     `options.visual.spec.ts-snapshots/`; the structural file is
 *     baseline-free and can be edited freely without snapshot churn.
 *
 * Baseline workflow (matches the popup workflow):
 *   - `pnpm --filter @movar/e2e test` runs every offline spec; visual
 *     failures show the actual vs expected vs diff PNGs in
 *     `playwright-report/`.
 *   - `pnpm --filter @movar/e2e test:update` regenerates ALL offline
 *     baselines (popup + options together). For options-only iteration,
 *     add `--grep "options"` to scope the run.
 */
import { expect, test } from '../fixtures/extension';
import { openOptions, optionsRoot } from '../fixtures/options';

test.describe('extension options — visual', () => {
  test('default state, English UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    // E2E_SETTINGS already covers the default shape; pin uiLanguage to
    // 'en' so the page's "Auto" resolution (which depends on the
    // browser UI lang — locked to en-US in the fixture but still
    // routed through `browser.i18n.getUILanguage()`) doesn't introduce
    // a second source of variability for this baseline.
    await setMovarSettings({ uiLanguage: 'en' });
    const page = await openOptions(movarContext, extensionId);

    // Settle on the seeded state before snapshotting. The options page
    // starts with `defaultSettings` in useState and reads real values
    // in useEffect — a snapshot taken too early captures the wrong frame.
    // The "Language priority" heading is rendered the same in the default
    // English state regardless of seeding; assert two signals (heading +
    // switch label) so we get a positive signal on both i18n resolution
    // AND the contentModification: true seeded state.
    await expect(page.getByRole('heading', { name: 'Language priority' })).toBeVisible();
    await expect(
      page.getByRole('switch', {
        name: 'Filter blocked-language content',
      }),
    ).toBeChecked();

    await expect(optionsRoot(page)).toHaveScreenshot('options-default-en.png');
    await page.close();
  });

  test('default state, Ukrainian UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'uk' });
    const page = await openOptions(movarContext, extensionId);

    // Settle signals — every visible section heading reads in Ukrainian.
    // We pin the literals (cheap, surfaces drift early). The English
    // heading must NOT appear (toHaveCount(0) catches a regression
    // where the I18nProvider failed to switch).
    await expect(page.getByRole('heading', { name: 'Language priority' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Пріоритет мов' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Вміст сторінки' })).toBeVisible();
    // The blocked-language editor stays hidden (#89); the exempt-site editor is
    // now mounted (#90), so its heading is a visible settle signal.
    await expect(page.getByRole('heading', { name: 'Заблоковані мови' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Виключені сайти' })).toBeVisible();

    // Settle the seeded contentModification: true state, exactly as the
    // English case does. The page mounts with `defaultSettings` (where
    // contentModification is FALSE) and reads the real value in a
    // useEffect, so the headings above are present a frame before the
    // switch flips on. Without this wait the snapshot can catch the
    // pre-settle frame — switch off, conceal-mode preview absent — which
    // is exactly how this baseline flaked. The switch's accessible name is
    // its Ukrainian label.
    await expect(
      page.getByRole('switch', {
        name: 'Фільтрувати вміст заблокованими мовами',
      }),
    ).toBeChecked();

    await expect(optionsRoot(page)).toHaveScreenshot('options-default-uk.png');
    await page.close();
  });

  test('priority list with three languages (reorder controls in every position)', async ({
    movarContext,
    extensionId,
    setMovarSettings,
  }) => {
    // Three languages = three positions = three enable-state combinations:
    //   - position 0 (uk): Up disabled, Down enabled, Remove enabled
    //   - position 1 (en): Up enabled,  Down enabled, Remove enabled
    //   - position 2 (pl): Up enabled,  Down disabled, Remove enabled
    // This baseline pins the disabled-state styling at head + tail, plus
    // the active styling for the primary item (index 0 has the accent
    // border + surface). 'pl' is in SUPPORTED_LANGUAGES (see
    // apps/extension/src/entrypoints/options/shared.tsx L10) so it
    // renders with its real display name ("Polish").
    await setMovarSettings({
      uiLanguage: 'en',
      priority: ['uk', 'en', 'pl'],
    });
    const page = await openOptions(movarContext, extensionId);

    // Settle: all three move-down buttons exist (one per language).
    // Asserting on the tail item's "Move Polish down" specifically
    // catches the case where only the seeded uk+en rendered and the pl
    // entry was dropped silently.
    await expect(page.getByRole('button', { name: 'Move Ukrainian down' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move English down' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeVisible();
    // The tail item's Move-Down is disabled; assert state pre-snapshot so a
    // future regression that re-enables it surfaces in the structural
    // diff before the pixel diff.
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeDisabled();

    await expect(optionsRoot(page)).toHaveScreenshot('options-priority-three-langs-en.png');
    await page.close();
  });
});

test.describe('extension options — visual (dark mode)', () => {
  // Each test below is the dark-mode counterpart of the equivalently-
  // named light test above. The setup is identical except for the
  // `colorScheme: 'dark'` option on `openOptions`, which triggers the
  // `@media (prefers-color-scheme: dark)` rules in
  // packages/ui/src/tokens.css. Settle signals are role- and text-based
  // so they fire identically in either scheme — only the baseline
  // filename and the rendered pixels change.

  test('default state, English UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'en' });
    const page = await openOptions(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('heading', { name: 'Language priority' })).toBeVisible();
    await expect(
      page.getByRole('switch', {
        name: 'Filter blocked-language content',
      }),
    ).toBeChecked();

    await expect(optionsRoot(page)).toHaveScreenshot('options-default-en-dark.png');
    await page.close();
  });

  test('default state, Ukrainian UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'uk' });
    const page = await openOptions(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('heading', { name: 'Language priority' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Пріоритет мов' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Вміст сторінки' })).toBeVisible();
    // The blocked-language editor stays hidden (#89); the exempt-site editor is
    // now mounted (#90), so its heading is a visible settle signal.
    await expect(page.getByRole('heading', { name: 'Заблоковані мови' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Виключені сайти' })).toBeVisible();

    // Same settle guard as the light UK case — wait for the seeded
    // contentModification: true to flip the switch on before snapshotting,
    // so the conceal-mode preview is present. (This dark case shares the
    // race; it happened to snapshot the settled frame, but the guard makes
    // that deterministic rather than lucky.)
    await expect(
      page.getByRole('switch', {
        name: 'Фільтрувати вміст заблокованими мовами',
      }),
    ).toBeChecked();

    await expect(optionsRoot(page)).toHaveScreenshot('options-default-uk-dark.png');
    await page.close();
  });

  test('priority list with three languages (reorder controls in every position)', async ({
    movarContext,
    extensionId,
    setMovarSettings,
  }) => {
    await setMovarSettings({
      uiLanguage: 'en',
      priority: ['uk', 'en', 'pl'],
    });
    const page = await openOptions(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('button', { name: 'Move Ukrainian down' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move English down' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeDisabled();

    await expect(optionsRoot(page)).toHaveScreenshot('options-priority-three-langs-en-dark.png');
    await page.close();
  });
});
