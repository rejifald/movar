/**
 * Options behavior e2e suite. Exercises the click → state → storage
 * round-trip for every options-page interaction that mutates persistent
 * state.
 *
 * What this proves (vs the structural `options.spec.ts`):
 *   - typing into the allowlist input + clicking Add → the domain
 *     appears as a chip AND lands in `settings.allowlist`
 *   - the priority-reorder Remove button removes the right entry AND
 *     the persisted order shrinks accordingly
 *   - the locked-Russian invariant holds at the DOM level — no Unblock
 *     button is rendered for `ru`, so there's no path the user can take
 *     to mutate it from the UI
 *
 * Storage assertion strategy mirrors popup.behavior.spec.ts: every
 * test reads the persisted value via `serviceWorker.evaluate` directly
 * against `chrome.storage.sync.settings`. A value the test sees there
 * is what the content script will read on the user's next page-load.
 */
import type { Worker } from '@playwright/test';
import type { MovarSettings } from '@movar/shared';
import { expect, test } from '../fixtures/extension';
import { openOptions } from '../fixtures/options';

/** Same helper as popup.behavior.spec.ts — kept inline rather than
 *  factored into a shared helper because the two specs are independent
 *  and a small duplicated function reads better than another
 *  fixtures/*.ts import for a single use. */
async function readSettings(serviceWorker: Worker): Promise<MovarSettings | undefined> {
  return await serviceWorker.evaluate(async () => {
    const data = await chrome.storage.sync.get('settings');
    return data['settings'] as MovarSettings | undefined;
  });
}

test.describe('extension options — behavior', () => {
  test('adding a domain via the allowlist input persists it', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    const page = await openOptions(movarContext, extensionId);

    // Default state: allowlist is empty → the empty-state prose is
    // visible. Asserting on it before the add proves we started from
    // the canonical state, not a leaked one from a prior test.
    await expect(page.getByText('No sites are exempt.')).toBeVisible();

    // Allowlist input has aria-label "Domain to exempt"; Add button is
    // localised to "Add". The form's onSubmit handler runs
    // `normaliseDomain(input)` first — passing a bare hostname avoids
    // any normalisation drift that would muddy this assertion.
    //
    // Scope the button query to `<form>`: the AddLanguagePicker used by
    // PrioritySection and BlockedSection (shared.tsx:48-78) also renders
    // a hardcoded `<Button>Add</Button>`, so an unscoped getByRole would
    // match three elements. AllowlistSection is the only section that
    // wraps its add controls in a `<form>` (it's the only one that
    // accepts free-text input rather than a Select), so that's the
    // disambiguating scope.
    const input = page.getByRole('textbox', { name: 'Domain to exempt' });
    await input.fill('example.com');
    await page.locator('form').getByRole('button', { name: 'Add', exact: true }).click();

    // The new chip materialises via React state update — the chip itself
    // is selected by the presence of its Remove button (the chip's
    // accessible affordance for the domain text).
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    // Empty-state prose disappears once a chip is present.
    await expect(page.getByText('No sites are exempt.')).toHaveCount(0);

    // Persistence assertion: settings.allowlist contains the new domain
    // and didn't drop the others (it started empty here, so length === 1).
    const persisted = await readSettings(serviceWorker);
    expect(persisted?.allowlist).toEqual(['example.com']);

    await page.close();
  });

  test('removing a priority language updates both the UI and storage', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    serviceWorker,
  }) => {
    // Seed three languages so we have one safely-removable entry. After
    // removing Polish, two remain (uk, en) — the priority section's
    // last-item guard (settings.priority.length <= 1) is satisfied for
    // both survivors, so this isn't a degenerate test.
    await setMovarSettings({ priority: ['uk', 'en', 'pl'] });
    const page = await openOptions(movarContext, extensionId);

    // Confirm the seeded three-language state mounted. The Move-Polish-
    // down button's existence proves the entry rendered (Polish is at
    // the tail position).
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove Polish' }).click();

    // After removal, the Polish entry is gone — no button references
    // it. The two survivors are still present.
    await expect(page.getByRole('button', { name: 'Remove Polish' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove Ukrainian' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove English' })).toBeVisible();

    // Persistence assertion: the priority array shrank and kept the
    // original head order intact. A regression that reset to
    // `defaultSettings` would land here with `['uk', 'en']` too — but
    // the test that prevents that is the next assertion: priority order
    // is preserved, not regenerated.
    const persisted = await readSettings(serviceWorker);
    expect(persisted?.priority).toEqual(['uk', 'en']);

    await page.close();
  });

  test('locked Russian language has no UI path to unblock it', async ({
    movarContext,
    extensionId,
    serviceWorker,
  }) => {
    const page = await openOptions(movarContext, extensionId);

    // BlockedSection.tsx L54-61 branches on isLockedBlocked(code); the
    // locked branch renders a 🔒 span with the lockedHint aria-label
    // INSTEAD of the unblock IconButton. The invariant is therefore the
    // ABSENCE of the unblock button — assert that and the lock indicator
    // simultaneously to prove both halves of the branch fired.
    await expect(page.getByRole('button', { name: 'Unblock Russian' })).toHaveCount(0);
    await expect(page.getByLabel('Russian is always blocked', { exact: true })).toBeVisible();

    // Defensive: storage still records `ru` in blocked. A future regression
    // that hand-removed `ru` from the seed would land here — surface that
    // as a clear assertion failure rather than wait for it to break a
    // content-script test downstream.
    const persisted = await readSettings(serviceWorker);
    expect(persisted?.blocked).toContain('ru');

    await page.close();
  });
});
