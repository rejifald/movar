/**
 * Popup behavior e2e suite. Exercises the click → state → storage
 * round-trip for every popup interaction that mutates persistent state.
 *
 * What this proves (vs the structural `popup.spec.ts`):
 *   - clicking the status pill flips `settings.enabled` AND the change
 *     survives a popup reload (storage persistence, not just React state)
 *   - the "1 hour" pause button writes a future timestamp to
 *     `chrome.storage.local['movar:pausedUntil']`
 *   - "Resume now" clears both pause keys (timed AND indefinite)
 *   - the content-modification checkbox is wired to
 *     `settings.contentModification` in both directions
 *   - the footer language selector swaps the UI in-place without
 *     re-navigating (the I18nProvider re-renders reactively when
 *     settings.uiLanguage changes) AND the new locale survives a popup
 *     reopen — mount-time `getSettings()` reads the persisted value
 *
 * What this does NOT prove:
 *   - the popup's render under each state (popup.visual.spec.ts owns
 *     those baselines)
 *   - that the content script reacts to a settings change mid-session
 *     (that's tested via content-script.spec.ts + the live suite)
 *
 * Storage assertion strategy: every test reads the persisted value via
 * the `readMovarSettings` fixture (settings) or `readPauseStorage` helper
 * (pause keys) directly against `chrome.storage.*`. That's the same lens
 * the content script + popup re-mount would read with, so a value the
 * test sees here is a value the user's next page-load will see — not
 * just a passing React state assertion.
 */
import type { Worker } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { openPopup, seedPause } from '../fixtures/popup';

/** Read the pause-state storage keys from the SW context. Returns the
 *  raw chrome.storage.local values, not the derived PauseState — tests
 *  assert on the persisted shape (timestamp number, boolean flag), not
 *  the computed `paused` boolean which depends on Date.now(). */
async function readPauseStorage(
  serviceWorker: Worker,
): Promise<{ pausedUntil: unknown; pausedIndefinitely: unknown }> {
  return await serviceWorker.evaluate(async () => {
    const data = await chrome.storage.local.get(['movar:pausedUntil', 'movar:pausedIndefinitely']);
    return {
      pausedUntil: data['movar:pausedUntil'],
      pausedIndefinitely: data['movar:pausedIndefinitely'],
    };
  });
}

test.describe('extension popup — behavior', () => {
  test('clicking the status pill turns Movar off and the change persists across popup reopens', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    const page = await openPopup(movarContext, extensionId);

    // Default state from E2E_SETTINGS: enabled=true → pill reads
    // "Turn Movar off" (the aria-label is the verb of the next click).
    const pill = page.getByRole('button', { name: 'Turn Movar off' });
    await expect(pill).toBeVisible();
    await pill.click();

    // The pill's accessible name flips immediately because the React
    // state update is synchronous within the handler. Wait for the
    // new label to materialise — proves the click was wired.
    await expect(page.getByRole('button', { name: 'Turn Movar on' })).toBeVisible();
    await expect(page.getByText(/Movar is off/)).toBeVisible();

    // Persistence assertion: read sync storage directly. If only React
    // state moved (`setSettings` ran but `persistSettings` didn't), the
    // stored value would still read `enabled: true`.
    const persisted = await readMovarSettings();
    expect(persisted?.enabled).toBe(false);

    // Now reopen the popup in a fresh tab. The new popup re-runs the
    // mount-time `getSettings()` from storage; if the previous click
    // really wrote through, the freshly-mounted popup must show "Turn
    // Movar on" without needing another click.
    await page.close();
    const reopened = await openPopup(movarContext, extensionId);
    await expect(reopened.getByRole('button', { name: 'Turn Movar on' })).toBeVisible();
    await reopened.close();
  });

  test('clicking "1 hour" pauses Movar and writes a future timestamp to storage', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    // Freeze the popup-page clock at a fixed epoch so the persisted
    // `pausedUntil` is an exact value, not "≥ now + 1h with a margin
    // that absorbs wall-clock drift". `clockTime` is threaded into
    // openPopup so the install happens BEFORE navigation — pause.ts
    // reads Date.now() inside the popup tab, and clock.install only
    // takes effect for code loaded after install.
    //
    // Why a FUTURE epoch (and not "any stable past epoch"): pauseFor
    // also calls `chrome.alarms.create('movar:resume', { when: until })`
    // where `until = fixedNow + 1h`. The alarms API runs in the SW
    // context, whose `Date.now()` is the real wall-clock (Playwright's
    // clock freeze is page-scoped). If `until < SW.Date.now()` Chrome
    // fires the alarm immediately, the SW's onAlarm handler calls
    // resume(), and resume() nulls `pausedUntil` — by the time this
    // test reads storage, the value would be `null`. Pinning fixedNow
    // ~23 years past today keeps `until` comfortably future for the
    // foreseeable life of this test; bump again if it ever starts
    // approaching real wall-clock.
    const fixedNow = 2_500_000_000_000; // 2049-03-22, future-relative-to-SW
    const page = await openPopup(movarContext, extensionId, { clockTime: fixedNow });

    await page.getByRole('button', { name: '1 hour' }).click();

    // PauseControls swaps to a single "Resume now" button once the pause
    // state propagates. That's the most reliable settle signal — the
    // post-click `await getPauseState()` resolves before the React tree
    // re-renders.
    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();

    // Persistence assertion: with the page clock frozen at `fixedNow`,
    // pauseFor('1h') writes exactly `fixedNow + 60*60*1000`. Strict
    // equality (not ≥) catches a regression that mis-computes the
    // duration by 30 min or 24 h.
    const persisted = await readPauseStorage(serviceWorker);
    expect(persisted.pausedUntil).toBe(fixedNow + 60 * 60 * 1000);
    expect(persisted.pausedIndefinitely).toBe(false);

    await page.close();
  });

  test('"Resume now" from an indefinite pause clears both pause keys', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    // Seed: the user previously chose "Until I resume". Pause state is
    // stored, no React state in play yet.
    await seedPause(serviceWorker, { kind: 'indefinite' });
    const page = await openPopup(movarContext, extensionId);

    // Confirm the popup booted into paused mode — Resume-now CTA visible
    // AND the activity body shows the "paused until you resume" copy.
    const resume = page.getByRole('button', { name: 'Resume now' });
    await expect(resume).toBeVisible();
    await expect(page.getByText(/Paused until you resume/)).toBeVisible();

    await resume.click();

    // PauseControls swaps back to the duration buttons; either of them
    // is a fine settle signal.
    await expect(page.getByRole('button', { name: '1 hour' })).toBeVisible();

    // Persistence assertion: both keys cleared to null/false (matches
    // `resume()` in apps/extension/src/lib/pause.ts L39-42).
    const persisted = await readPauseStorage(serviceWorker);
    expect(persisted.pausedUntil).toBeNull();
    expect(persisted.pausedIndefinitely).toBe(false);

    await page.close();
  });

  test('content-modification checkbox is wired in both directions', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    const page = await openPopup(movarContext, extensionId);

    // E2E_SETTINGS starts the toggle on; uncheck it and prove the click
    // round-trips to storage.
    const toggle = page.getByRole('checkbox', {
      name: 'Hide blocked-language content',
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    const persistedOff = await readMovarSettings();
    expect(persistedOff?.contentModification).toBe(false);

    // And back on — same click action, opposite direction. Catches the
    // case where the persist call sets contentModification: false
    // hard-coded instead of `next` (a subtle regression that would only
    // show on the toggle-back path).
    await toggle.click();
    await expect(toggle).toBeChecked();
    const persistedOn = await readMovarSettings();
    expect(persistedOn?.contentModification).toBe(true);

    await page.close();
  });

  test('changing UI language via the footer combobox re-renders the popup in Ukrainian in-place and the new locale survives a reopen', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    const page = await openPopup(movarContext, extensionId);

    // The popup boots in English (fixture pins --lang=en-US, settings
    // start with uiLanguage: 'auto'). Switching to 'uk' should re-render
    // the React tree under a new I18nProvider WITHOUT navigation — the
    // App's `setUiLanguage` flips React state in place; no popup reload.
    const selector = page.getByRole('combobox', { name: 'Language' });
    await selector.selectOption({ label: 'Українська' });

    // Two settle signals — the status pill's aria-label flips to its
    // Ukrainian form, and the corresponding English label disappears.
    // Both together prove the I18nProvider re-rendered the entire
    // subtree (not just the footer).
    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Вимкнути Movar' })).toBeVisible();

    const persisted = await readMovarSettings();
    expect(persisted?.uiLanguage).toBe('uk');

    // Mount-time persistence: reopen in a fresh tab and prove the new
    // popup boots straight into Ukrainian. Without this, a regression
    // where the in-place re-render works but `persistSettings` is a
    // no-op would still flip the storage value via the test write path
    // and pass the assertion above — only to break on the next session.
    // Same close+reopen pattern as the status-pill test in this file.
    await page.close();
    const reopened = await openPopup(movarContext, extensionId);
    await expect(reopened.getByRole('button', { name: 'Вимкнути Movar' })).toBeVisible();
    await reopened.close();
  });
});
