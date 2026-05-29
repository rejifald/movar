/**
 * Popup visual-regression suite. Loads the real WXT-built extension,
 * stamps a controlled storage state, opens the popup as a tab, and
 * compares pixels against a committed baseline.
 *
 * The spec is shaped around a state matrix: the popup has a small set
 * of orthogonal axes, each of which materially changes what's rendered.
 * Covering them individually keeps each baseline small (so a diff is
 * meaningful) and keeps a regression in one axis from masking another.
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
 *   │ off                         │ yes          │ pill tone + off message │
 *   │ paused-indefinite-en        │ yes          │ pill + resume button    │
 *   │ content-toggle-off-en       │ yes          │ unchecked + no panel    │
 *   │ with-corrections-en         │ yes          │ priority chain + count  │
 *   │ paused-timed-en             │ no (text)    │ date is non-determ.     │
 *   │ default-en           (dark) │ yes          │ token flip, canonical   │
 *   │ default-uk           (dark) │ yes          │ token flip + UA glyphs  │
 *   │ off                  (dark) │ yes          │ off pill in dark        │
 *   │ paused-indefinite-en (dark) │ yes          │ paused pill in dark     │
 *   │ content-toggle-off-en (dark)│ yes          │ unchecked in dark       │
 *   │ with-corrections-en  (dark) │ yes          │ hero + chain in dark    │
 *   └─────────────────────────────┴──────────────┴─────────────────────────┘
 *
 * Axes covered:
 *   - settings.enabled (active vs off)
 *   - pause state (none vs indefinite vs timed)
 *   - settings.contentModification (on vs off)
 *   - settings.uiLanguage (en vs uk)
 *   - corrections-today count (zero vs many)
 *   - prefers-color-scheme (light vs dark)
 *
 * Dark-mode coverage:
 *   - The extension's design tokens (packages/ui/src/tokens.css) flip on
 *     `@media (prefers-color-scheme: dark)`. Playwright reports the
 *     preference via `emulateMedia({ colorScheme: 'dark' })`, which the
 *     `openPopup` helper threads through. No settings flip, no class
 *     toggle — the tokens do all the work.
 *   - Every light-mode visual case has a dark-mode counterpart so a
 *     dark-only regression (e.g. accent-deep losing contrast on
 *     accent-surface) can't hide behind a passing light baseline.
 *   - The text-only `paused-timed-en` case has no dark counterpart for
 *     the same reason it has no light pixel baseline: the formatted date
 *     ticks per second and would flake either way.
 *
 * Axes intentionally NOT exercised here:
 *   - HiddenPanel — its render path requires a content script on the
 *     active tab, which `chrome-extension://` pages don't have, so the
 *     popup correctly degrades to "no panel". The panel itself is
 *     covered by Storybook + unit tests in apps/extension.
 *   - paused-timed snapshot — the formatted "Paused until <date>" string
 *     includes seconds, which tick over between runs; we assert the text
 *     pattern structurally instead, and leave pixel coverage of the same
 *     layout to `paused-indefinite-en`.
 *
 * Why these are split out from `popup.spec.ts`:
 *   - Structural failures ("popup didn't mount") and pixel failures
 *     ("the chip's border radius bumped 1px") are very different signals
 *     in CI triage. Two files = two reports, two failure categories.
 *   - The visual file owns its baselines under
 *     `popup.visual.spec.ts-snapshots/`; the structural file is
 *     baseline-free and can be edited freely without snapshot churn.
 *
 * Baseline workflow:
 *   - `pnpm --filter @movar/e2e test:popup` runs the popup specs (a
 *     `--grep popup` filter against the default config); visual failures
 *     show the actual vs expected vs diff PNGs in the HTML report at
 *     `playwright-report/`.
 *   - `pnpm --filter @movar/e2e test:update -- --grep popup` regenerates
 *     popup baselines only. Run this only when a popup change is
 *     intentional; review the diff in `git status` to confirm the
 *     regenerated PNG matches the design.
 *   - Baselines are platform-specific — Playwright stamps the OS into
 *     the filename (`*-darwin.png`, `*-linux.png`). Today the repo only
 *     commits `*-darwin.png`; CI runs Linux and regenerates the missing
 *     baselines via the `regenerate-baselines` GitHub Actions workflow
 *     (first push of a new spec lands `*-linux.png` from that workflow,
 *     subsequent runs gate against it). The macOS set is regenerated
 *     locally via `:update`.
 */
import { expect, test } from '../fixtures/extension';
import { openPopup, popupRoot, seedPause, seedTodayEvents } from '../fixtures/popup';

test.describe('extension popup — visual', () => {
  test('default state, English UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    // E2E_SETTINGS already has enabled+contentMod on; pin uiLanguage to
    // 'en' so the popup's "Auto" resolution (which depends on the
    // browser UI lang — locked to en-US in the fixture but still
    // routed through `browser.i18n.getUILanguage()`) doesn't introduce
    // a second source of variability for this baseline.
    await setMovarSettings({ uiLanguage: 'en' });
    const page = await openPopup(movarContext, extensionId);

    // Settle on the seeded state before snapshotting. The popup starts
    // with `defaultSettings` in useState and reads real values in
    // useEffect — a snapshot taken too early captures the wrong frame.
    //
    // Discrimination: `defaultSettings.contentModification` is `false`
    // (packages/shared/src/index.ts:56), while E2E_SETTINGS overrides
    // it to `true`. The content-toggle checkbox's checked state is the
    // ONLY observable axis that flips between the React initial-state
    // frame and the post-useEffect frame for this otherwise-canonical
    // case — `enabled`, `uiLanguage`-resolved-to-en, `priority`, and
    // `blocked` all match between defaults and seed. Asserting
    // `toBeChecked()` here is what makes the settle real: a broken
    // `getSettings()` leaves the checkbox unchecked and this fails.
    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Hide blocked-language content' }),
    ).toBeChecked();

    await expect(popupRoot(page)).toHaveScreenshot('popup-default-en.png');
    await page.close();
  });

  test('default state, Ukrainian UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'uk' });
    const page = await openPopup(movarContext, extensionId);

    // Two settle signals — the pill's aria-label flips to its Ukrainian
    // form, and the contentToggle description appears in Ukrainian. We
    // pin the literals (cheap, surfaces drift early) but stay tolerant
    // on whitespace by using `{ exact: false }` substring matches.
    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Вимкнути Movar' })).toBeVisible();
    await expect(
      page.getByText('У перемикачах мов і стрічках вмісту', { exact: false }),
    ).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-default-uk.png');
    await page.close();
  });

  test('off state', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'en', enabled: false });
    const page = await openPopup(movarContext, extensionId);

    // Off-state contract: pill flips to "Turn Movar on" and the
    // ActivityBody swaps the hero for the off message. Either signal
    // alone would be enough to settle; both together also prove we
    // haven't regressed to showing the priority chain in off state.
    await expect(page.getByRole('button', { name: 'Turn Movar on' })).toBeVisible();
    await expect(page.getByText(/Movar is off/)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-off-en.png');
    await page.close();
  });

  test('paused indefinitely', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    serviceWorker,
  }) => {
    await setMovarSettings({ uiLanguage: 'en' });
    await seedPause(serviceWorker, { kind: 'indefinite' });
    const page = await openPopup(movarContext, extensionId);

    // Paused-state contract: PauseControls swaps to a single "Resume
    // now" button, StatusHeader shows the "Paused" pill, ActivityBody
    // shows the "Paused until you resume" message.
    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();
    await expect(page.getByText(/Paused until you resume/)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-paused-indefinite-en.png');
    await page.close();
  });

  test('content-modification toggle off', async ({
    movarContext,
    extensionId,
    setMovarSettings,
  }) => {
    await setMovarSettings({ uiLanguage: 'en', contentModification: false });
    const page = await openPopup(movarContext, extensionId);

    // Settle limitation, called out honestly: seeded `contentModification:
    // false` matches `defaultSettings.contentModification` (the React
    // initial state). Every other axis matches too, so the popup's
    // pre-useEffect frame and post-useEffect frame are pixel-identical.
    // The settle below is a TIMING guard (wait for the toggle to be
    // attached + assert its checked state), NOT a getSettings-was-called
    // proof — that proof lives in `default state, English UI` above,
    // where E2E_SETTINGS flips the same axis from defaults. The
    // snapshot itself remains the assertion of intent here.
    const toggle = page.getByRole('checkbox', {
      name: 'Hide blocked-language content',
    });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    await expect(popupRoot(page)).toHaveScreenshot('popup-content-toggle-off-en.png');
    await page.close();
  });

  test('with corrections today (47 events)', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    serviceWorker,
  }) => {
    // 47 is the same count the marketplace storyboard uses (see
    // `popup-on-news.stories.tsx`). Sharing the number means the visual
    // baseline and the marketing material drift in lockstep — if the
    // hero typography changes, we see it in both signals.
    await setMovarSettings({ uiLanguage: 'en' });
    await seedTodayEvents(serviceWorker, 47);
    const page = await openPopup(movarContext, extensionId);

    // The popup hero shows the bare count plus a localised suffix; we
    // assert on the count alone (the suffix is exercised by default-en).
    await expect(page.getByText('47', { exact: true })).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-with-corrections-en.png');
    await page.close();
  });

  test('paused with a future timestamp shows a formatted date (text-only)', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    serviceWorker,
  }) => {
    // Pixel-snapshotting this state is brittle: `Date.toLocaleString()`
    // includes seconds in the default format, so the rendered string
    // changes from one run to the next. We assert the text *shape*
    // ("Paused until …" + some non-empty suffix that looks date-like)
    // and rely on `paused-indefinite-en`'s baseline to cover the layout
    // around it — the only difference between the two states is the
    // body string, which this test pins structurally.
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    await setMovarSettings({ uiLanguage: 'en' });
    await seedPause(serviceWorker, { kind: 'timed', untilMs: oneHourFromNow });
    const page = await openPopup(movarContext, extensionId);

    // Settle: Resume-now button is the most reliable signal that the
    // pause state has propagated (indefinite + timed both show it).
    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();
    // "Paused until " followed by SOMETHING that contains a digit. The
    // digit requirement rejects "Paused until undefined" / "Paused until
    // null" — failure modes the previous `/^Paused until \S/` regex
    // matched. We still don't pin the date format (it varies with the
    // browser's ICU bundle); "a non-empty suffix that contains at least
    // one digit" is the structural property the production code is
    // contracted to produce here.
    await expect(page.getByText(/^Paused until \S.*\d/)).toBeVisible();

    await page.close();
  });
});

test.describe('extension popup — visual (dark mode)', () => {
  // Each test below is the dark-mode counterpart of the equivalently-
  // named light test above. The setup is identical except for the
  // `colorScheme: 'dark'` option on `openPopup`, which triggers the
  // `@media (prefers-color-scheme: dark)` rules in
  // packages/ui/src/tokens.css. The settle signals are language- and
  // role-based, so they fire identically in either scheme — only the
  // baseline filename and the rendered pixels change.
  //
  // Convention: dark baselines live under the same `*-snapshots/`
  // directory as light baselines, suffixed with `-dark`. This keeps
  // related diffs adjacent in `git status` and means the
  // `test:update` workflow regenerates both schemes in one pass.

  test('default state, English UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'en' });
    const page = await openPopup(movarContext, extensionId, { colorScheme: 'dark' });

    // See the light-mode `default state, English UI` test for the
    // discrimination story — the content-toggle checked state is the
    // only axis that flips between defaultSettings and E2E_SETTINGS,
    // so asserting it makes the settle real (not theatre).
    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Hide blocked-language content' }),
    ).toBeChecked();

    await expect(popupRoot(page)).toHaveScreenshot('popup-default-en-dark.png');
    await page.close();
  });

  test('default state, Ukrainian UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'uk' });
    const page = await openPopup(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Вимкнути Movar' })).toBeVisible();
    await expect(
      page.getByText('У перемикачах мов і стрічках вмісту', { exact: false }),
    ).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-default-uk-dark.png');
    await page.close();
  });

  test('off state', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ uiLanguage: 'en', enabled: false });
    const page = await openPopup(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('button', { name: 'Turn Movar on' })).toBeVisible();
    await expect(page.getByText(/Movar is off/)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-off-en-dark.png');
    await page.close();
  });

  test('paused indefinitely', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    serviceWorker,
  }) => {
    await setMovarSettings({ uiLanguage: 'en' });
    await seedPause(serviceWorker, { kind: 'indefinite' });
    const page = await openPopup(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();
    await expect(page.getByText(/Paused until you resume/)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-paused-indefinite-en-dark.png');
    await page.close();
  });

  test('content-modification toggle off', async ({
    movarContext,
    extensionId,
    setMovarSettings,
  }) => {
    await setMovarSettings({ uiLanguage: 'en', contentModification: false });
    const page = await openPopup(movarContext, extensionId, { colorScheme: 'dark' });

    // Same settle-limitation note as the light-mode counterpart —
    // seeded value matches the React default, so the settle is a
    // timing guard, not a discriminator.
    const toggle = page.getByRole('checkbox', {
      name: 'Hide blocked-language content',
    });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    await expect(popupRoot(page)).toHaveScreenshot('popup-content-toggle-off-en-dark.png');
    await page.close();
  });

  test('with corrections today (47 events)', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    serviceWorker,
  }) => {
    await setMovarSettings({ uiLanguage: 'en' });
    await seedTodayEvents(serviceWorker, 47);
    const page = await openPopup(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByText('47', { exact: true })).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-with-corrections-en-dark.png');
    await page.close();
  });
});
