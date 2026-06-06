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
 *   - the popup UI language follows the preferred-language order
 *     (settings.priority) — there is no separate UI-language picker; the
 *     uk-first/en-first → Ukrainian/English mapping is asserted directly
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
import { mockSite } from '../fixtures/content-mock';
import { waitForMovarSettled } from '../fixtures/movar-state';
import { openPopup, seedPause } from '../fixtures/popup';

/** Read the pause-state storage keys from the SW context. Returns the
 *  raw chrome.storage.local values, not the derived PauseState — tests
 *  assert on the persisted shape (timestamp number, boolean flag), not
 *  the computed `paused` boolean which depends on Date.now(). */
async function readPauseStorage(
  serviceWorker: Worker,
): Promise<{ pausedUntil: unknown; pausedIndefinitely: unknown }> {
  return serviceWorker.evaluate(async () => {
    const data = await chrome.storage.local.get(['movar:pausedUntil', 'movar:pausedIndefinitely']);
    return {
      pausedUntil: data['movar:pausedUntil'],
      pausedIndefinitely: data['movar:pausedIndefinitely'],
    };
  });
}

test.describe('extension popup — behavior', () => {
  // The popup's UI language now follows settings.priority (no separate
  // picker). Pin priority en-first so these behaviour tests render in
  // English and their role-name locators stay deterministic; the
  // priority→language mapping itself is covered by the two tests at the
  // end of this file.
  test.beforeEach(async ({ setMovarSettings }) => {
    await setMovarSettings({ priority: ['en', 'uk'] });
  });

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
    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    await pill.click();

    // The pill's accessible name flips immediately because the React
    // state update is synchronous within the handler. Re-query with
    // the new name — `pill` was captured by the OLD name and won't
    // resolve after the toggle (StatusHeader.tsx:58 ties the aria-label
    // to settings.enabled, so the role-by-name locator no longer matches).
    const pillOff = page.getByRole('button', { name: 'Turn Movar on' });
    await expect(pillOff).toBeVisible();
    await expect(page.getByText(/Movar is off/)).toBeVisible();
    await expect(pillOff).toHaveAttribute('aria-pressed', 'false');

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

    // Post-reopen storage assertion: re-read settings after the fresh
    // popup mount to catch a "write-on-mount" regression where the popup
    // re-writes `defaultSettings` (which has `enabled: true`) into storage
    // on every open, undoing the user's click. If that regression existed,
    // the button above would still show "Turn Movar on" (the React initial
    // state is `enabled: false` from the seeded storage) but the persisted
    // value would have been silently clobbered back to `true`.
    const afterReopen = await readMovarSettings();
    expect(afterReopen?.enabled).toBe(false);

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
    // ~978 years past today keeps `until` comfortably future for the
    // foreseeable life of this test; bump again if it ever starts
    // approaching real wall-clock.
    //
    // Year 3000 (~978 years from now) — chosen to stay comfortably ahead of
    // the SW's real wall-clock for the foreseeable lifetime of this test.
    // The previous 2049 value would approach real wall-clock within ~23 years
    // and would then cause the SW alarm to fire immediately (clearing the
    // paused state before the assertion runs). Bump again if this test
    // somehow survives to the 29th century.
    const fixedNow = 32_500_000_000_000; // ~year 3000, safely future-relative-to-SW
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

  test('clicking "1 hour" with real clock: pausedUntil is in the future (production-clock arithmetic)', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    // Sibling of the frozen-clock test that does NOT freeze the clock.
    // Exercises the real production Date.now() path — catches a regression
    // where the frozen-clock variant passes (using a stub) but the live
    // arithmetic is broken (e.g. `Date.now()` is called before the import
    // resolves, returning 0). The assertion uses a tolerance check rather
    // than exact equality because wall-clock drift between the popup's
    // `Date.now()` call and this read is unavoidable.
    const beforeClick = Date.now();
    const page = await openPopup(movarContext, extensionId);

    await page.getByRole('button', { name: '1 hour' }).click();
    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();

    const after = await readPauseStorage(serviceWorker);
    // pausedUntil must be greater than the time we recorded before clicking
    // (i.e., it is in the future relative to right now), which is the property
    // that makes getPauseState() report paused: true.
    expect(typeof after.pausedUntil).toBe('number');
    expect(after.pausedUntil as number).toBeGreaterThan(Date.now());
    // Sanity cap: can't be more than 2 hours away (1h + some generous margin).
    expect(after.pausedUntil as number).toBeLessThan(beforeClick + 2 * 60 * 60 * 1000);

    await page.close();
  });

  test('clicking "Until I resume" writes the indefinite flag to storage', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    // Mirror of the "1 hour" test but for the indefinite-pause path.
    // `pauseFor('indefinite')` sets `pausedIndefinitely: true` and
    // `pausedUntil: null` — no alarm is created because there's no
    // end-time to schedule. Strict equality on both keys catches a
    // regression where the two storage keys are swapped or the
    // indefinite flag is stored as a truthy non-boolean.
    const page = await openPopup(movarContext, extensionId);

    await page.getByRole('button', { name: 'Until I resume' }).click();

    // PauseControls swaps to a single "Resume now" button once the
    // pause state propagates — same settle signal as the "1 hour" test.
    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();

    const persisted = await readPauseStorage(serviceWorker);
    expect(persisted.pausedIndefinitely).toBe(true);
    expect(persisted.pausedUntil).toBeNull();

    await page.close();
  });

  test('"Resume now" from a timed pause clears the alarm', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    // Seed a timed pause (1 hour from now) so the popup opens into the
    // paused state. The SW created a `movar:resume` alarm when the user
    // originally clicked "1 hour"; clicking "Resume now" should call
    // `chrome.alarms.clear('movar:resume')` so the auto-resume alarm
    // doesn't fire stale. We assert via `chrome.alarms.getAll()` because
    // Playwright has no hook into whether `alarms.clear` was invoked —
    // an empty alarm registry after resume is the observable consequence.
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    await seedPause(serviceWorker, { kind: 'timed', untilMs: oneHourFromNow });
    // Seed the alarm that pause.ts would have created alongside the storage
    // entry so the test proves the alarm is actually cleared (not just
    // absent because it was never created in the first place).
    await serviceWorker.evaluate(async (untilMs: number) => {
      await chrome.alarms.create('movar:resume', { when: untilMs });
    }, oneHourFromNow);

    const page = await openPopup(movarContext, extensionId);

    await expect(page.getByRole('button', { name: 'Resume now' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume now' }).click();

    await expect(page.getByRole('button', { name: '1 hour' })).toBeVisible();

    // Persistence + alarm assertion: both storage keys cleared AND the
    // `movar:resume` alarm is gone from the registry.
    const persisted = await readPauseStorage(serviceWorker);
    expect(persisted.pausedUntil).toBeNull();
    expect(persisted.pausedIndefinitely).toBe(false);

    const alarms = await serviceWorker.evaluate(async () => {
      return chrome.alarms.getAll();
    });
    const resumeAlarm = alarms.find((a) => a.name === 'movar:resume');
    expect(resumeAlarm).toBeUndefined();

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

  test('HiddenPanel shows hidden-links count and "Show everything" restores them', async ({
    movarContext,
    extensionId,
    movarPage,
  }) => {
    // This test proves the HiddenPanel → onRestore round-trip:
    //   1. Navigate a real tab to a mocked RU fixture so the content
    //      script runs and hides RU-language links.
    //   2. Open the popup while that tab is still active — `sendToActiveTab`
    //      in App.tsx queries `chrome.tabs.query({ active: true, currentWindow: true })`
    //      which returns the content-script tab, not the popup's own tab.
    //   3. Assert the HiddenPanel renders with a hidden count > 0.
    //   4. Click "Show everything" and assert the panel transitions to the
    //      restored/empty state (the content script calls `restoreAll()` and
    //      returns the new summary).
    //
    // Navigation strategy: `movarPage` is the content-script tab that stays
    // active. `openPopup` creates a *second* tab. We then call
    // `movarPage.bringToFront()` to restore focus to the CS tab before the
    // popup's useEffect fires its `sendToActiveTab` call.
    const url = 'https://mocked-cs-cart-hidden.example.test/';
    await mockSite(movarContext, `${url}**`, 'cs-cart-ru');
    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for the content script to hide at least one element — this is the
    // signal that the CS is active and `getHiddenSummary()` will return
    // a non-empty languages array.
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });
    const hiddenCount = await movarPage.evaluate(
      () => document.querySelectorAll('[data-movar-hidden]').length,
    );
    // Guard: if the fixture didn't produce any hidden elements the rest of
    // the test would trivially pass for the wrong reason.
    expect(hiddenCount).toBeGreaterThan(0);

    // Open popup: create the tab first, bring the CS tab back to the
    // foreground (making it "active"), THEN navigate the popup tab.
    // `sendToActiveTab` in App.tsx fires in useEffect after mount;
    // `tabs.query({ active: true, currentWindow: true })` runs after
    // navigation settles. By switching back to movarPage before the
    // popup tab navigates, we ensure the CS tab is the active one when
    // the query fires.
    const popupPage = await movarContext.newPage();
    await movarPage.bringToFront();
    await popupPage.setViewportSize({ width: 420, height: 720 });
    await popupPage.emulateMedia({ reducedMotion: 'reduce' });
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForSelector('#root > *', { state: 'attached' });
    await popupPage.evaluate(() => document.fonts.ready);

    // Settle: wait for the HiddenPanel section heading to appear. The panel
    // renders only when `hidden !== null && settings.contentModification`.
    // `sendToActiveTab` runs in the popup's useEffect — once movarPage is
    // active the result arrives and React re-renders. The heading text is
    // "On this page" (t.hidden.title in messages-en.ts).
    const panelHeading = popupPage.getByRole('heading', { name: 'On this page' });
    await expect(panelHeading).toBeVisible({ timeout: 8_000 });

    // The restore CTA is the Button inside HiddenList.
    const restoreBtn = popupPage.getByRole('button', { name: /show everything/i });
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    // After restore the content script sets `userOverride = true` and
    // returns a summary with empty languages + zero containers. The panel
    // should now show the "nothing hidden" / "restored" message, not the list.
    await expect(restoreBtn).not.toBeVisible({ timeout: 5_000 });

    await popupPage.close();
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

  test('preferred-language order drives the popup locale — uk-first renders Ukrainian', async ({
    movarContext,
    extensionId,
    setMovarSettings,
  }) => {
    // There is no separate UI-language picker any more: the popup speaks
    // the first catalogued language in settings.priority. uk-first → uk.
    // This overrides the en-first pin from the describe's beforeEach.
    await setMovarSettings({ priority: ['uk', 'en'] });
    const page = await openPopup(movarContext, extensionId);

    // Status pill renders its Ukrainian aria-label, and the English form
    // is absent — proof the whole subtree resolved under the uk catalogue.
    await expect(page.getByRole('button', { name: 'Вимкнути Movar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toHaveCount(0);

    await page.close();
  });

  test('preferred-language order drives the popup locale — en-first renders English', async ({
    movarContext,
    extensionId,
    setMovarSettings,
  }) => {
    // Mirror of the uk-first case. en-first → en. (The beforeEach already
    // seeds this, but set it explicitly so the test stands on its own.)
    await setMovarSettings({ priority: ['en', 'uk'] });
    const page = await openPopup(movarContext, extensionId);

    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Вимкнути Movar' })).toHaveCount(0);

    await page.close();
  });
});
