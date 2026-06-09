/**
 * Options behavior e2e suite. Exercises the click → state → storage
 * round-trip for every options-page interaction that mutates persistent
 * state.
 *
 * What this proves (vs the structural `options.spec.ts`):
 *   - the priority-reorder Remove / Move-down / Move-up buttons mutate
 *     priority in the right direction AND the persisted order matches
 *     what the UI shows
 *
 * Storage assertion strategy mirrors popup.behavior.spec.ts: every
 * test reads the persisted value via the `readMovarSettings` fixture
 * directly against `chrome.storage.sync.settings`. A value the test
 * sees there is what the content script will read on the user's next
 * page-load.
 *
 * Deferred editors: blocked-language and exempt-site editing is structurally
 * asserted as absent in options.spec.ts. Not duplicated here — this file is
 * for visible behavior (click → state → storage).
 */
import { expect, test } from '../fixtures/extension';
import { openOptions } from '../fixtures/options';

test.describe('extension options — behavior', () => {
  test('removing a priority language updates both the UI and storage', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    readMovarSettings,
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
    // the move-up / move-down tests below catch the regenerate-vs-mutate
    // distinction with a non-canonical reorder.
    const persisted = await readMovarSettings();
    expect(persisted?.priority).toEqual(['uk', 'en']);

    await page.close();
  });

  test('Move-down on the head item swaps the first two priorities', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    readMovarSettings,
  }) => {
    // Seed three so position-0 ("uk") has a move-down target AND we can
    // assert the tail ("pl") stayed at index 2 — i.e. the click swaps
    // adjacent items, not reorders the whole array.
    await setMovarSettings({ priority: ['uk', 'en', 'pl'] });
    const page = await openOptions(movarContext, extensionId);

    // Pre-click: Move-Ukrainian-up is disabled (head); the test of
    // "head item can move down" is exactly this affordance flipping
    // ['uk', 'en', 'pl'] → ['en', 'uk', 'pl'].
    await expect(page.getByRole('button', { name: 'Move Ukrainian up' })).toBeDisabled();
    await page.getByRole('button', { name: 'Move Ukrainian down' }).click();

    // Post-click: 'en' is now the head, so its Move-up is disabled (was
    // enabled), and 'uk' is mid-list so its Move-up is enabled (was
    // disabled). Both flips together prove the order changed — and the
    // persisted-vs-regenerated distinction lands because the ordering
    // is non-canonical now: ['en', 'uk', 'pl'] is not what any
    // defaultSettings reset would produce.
    await expect(page.getByRole('button', { name: 'Move English up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move Ukrainian up' })).toBeEnabled();

    const persisted = await readMovarSettings();
    expect(persisted?.priority).toEqual(['en', 'uk', 'pl']);

    await page.close();
  });

  test('Move-up on the tail item swaps the last two priorities', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    readMovarSettings,
  }) => {
    // Mirror of the move-down test on the tail position. Tail's Move-down
    // is disabled (it's already last); Move-up is enabled. Click flips
    // ['uk', 'en', 'pl'] → ['uk', 'pl', 'en']. The resulting order is
    // non-canonical so a regression that hand-reset to defaults would
    // not match it.
    await setMovarSettings({ priority: ['uk', 'en', 'pl'] });
    const page = await openOptions(movarContext, extensionId);

    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeDisabled();
    await page.getByRole('button', { name: 'Move Polish up' }).click();

    // Post-click: 'pl' moved to index 1, 'en' is now the tail so its
    // Move-down is disabled.
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Move English down' })).toBeDisabled();

    const persisted = await readMovarSettings();
    expect(persisted?.priority).toEqual(['uk', 'pl', 'en']);

    await page.close();
  });

  // Item 1: AddLanguagePicker adds a priority language not currently in the list.
  test('AddLanguagePicker adds a new priority language and persists it', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    // E2E_SETTINGS seeds `priority: ['uk', 'en']`. Polish ('pl') is in
    // SUPPORTED_LANGUAGES and not locked-blocked, so it will be offered in
    // the AddLanguagePicker Select — no seeding needed.
    const page = await openOptions(movarContext, extensionId);

    // The AddLanguagePicker for PrioritySection renders a combobox (Select)
    // with aria-label matching `t.options.priority.addLabel`. Select the
    // Polish option then click its Add button (aria-label is the same label
    // text per shared.tsx:73).
    const priorityPicker = page.getByRole('combobox', { name: 'Add language' });
    await priorityPicker.selectOption({ label: 'Polish (pl)' });
    await page.getByRole('button', { name: 'Add language' }).click();

    // The new entry materialises as a PriorityItem with its Remove button.
    await expect(page.getByRole('button', { name: 'Remove Polish' })).toBeVisible();

    // Persistence: priority grew from 2 to 3 and 'pl' is at the tail.
    const persisted = await readMovarSettings();
    expect(persisted?.priority).toEqual(['uk', 'en', 'pl']);

    await page.close();
  });

  // Item 2: last-priority-item guard — Remove button is disabled when only one item remains.
  test('Remove button is disabled when only one priority language remains', async ({
    movarContext,
    extensionId,
  }) => {
    // E2E_SETTINGS seeds `priority: ['uk', 'en']`. Remove 'en' via UI to reach
    // the single-item state, then assert the remaining Remove button is disabled.
    // PrioritySection.tsx:55 sets `canRemove={settings.priority.length > 1}`.
    const page = await openOptions(movarContext, extensionId);

    // Remove English to leave only Ukrainian.
    await page.getByRole('button', { name: 'Remove English' }).click();
    await expect(page.getByRole('button', { name: 'Remove English' })).toHaveCount(0);

    // The sole remaining Remove button must now be disabled.
    await expect(page.getByRole('button', { name: 'Remove Ukrainian' })).toBeDisabled();

    await page.close();
  });
});
