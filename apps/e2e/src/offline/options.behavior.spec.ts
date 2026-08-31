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
 * Exempt-site editing (AllowlistSection) is now mounted (#90); its add + remove
 * round-trips are covered below. There is no blocked-language editor — #89 made
 * `blocked` derived from `priority`, so the re-derivation is driven through the
 * priority controls instead (see the derived-block-list test at the end); its
 * absence is structurally asserted in options.spec.ts.
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

    // Confirm the seeded three-language state mounted before touching
    // anything — the sibling tests above and below gate on the same
    // signal. Without it this test is blind to a lost seed: EVERY
    // assertion below also holds for a two-language ['uk', 'en'] mount,
    // so it would click, swap, persist ['en', 'uk'], and only fail at
    // the very last line with a missing tail rather than a wrong order.
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeDisabled();

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
    await priorityPicker.selectOption({ label: 'Polish' });
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

  test('adds an exempt domain from the editor, persisting the canonical value', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    readMovarSettings,
  }) => {
    await setMovarSettings({ allowlist: [] });
    const page = await openOptions(movarContext, extensionId);

    // Empty-state copy proves the editor mounted with no entries.
    await expect(page.getByText('Movar skips no sites yet.')).toBeVisible();

    // A pasted URL (scheme + www + path) is reduced to the bare domain by the
    // form AND again at the settings boundary — one canonical entry persists.
    // Submit via Enter to avoid colliding with the priority "Add" control.
    const input = page.getByRole('textbox', { name: 'Site to skip' });
    await input.fill('https://www.Example.com/path');
    await input.press('Enter');

    // The chip's Remove control is the stable render hook; storage holds the
    // canonical form the content script + DNR will match against.
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    await expect.poll(async () => (await readMovarSettings())?.allowlist).toEqual(['example.com']);

    await page.close();
  });

  // #89: `blocked` is derived from `priority` (`deriveBlocked`) at the settings
  // boundary rather than user-edited. Note what this can and cannot show today:
  // every IMPOSED_OVER key that survives code coercion (`uk`, `be`) imposes `ru`,
  // and `ru` is locked regardless — so with the current language roster the
  // derived list is invariantly `['ru']` for ANY priority. The observable
  // behaviour is therefore convergence: a stored list that no priority could
  // derive is replaced on the next write. The divergent-priority case is pinned
  // at the unit level (`packages/settings/src/derive-blocked.test.ts`), where
  // `deriveBlocked` can be called with roster-independent inputs.
  test('a priority edit re-derives the block list, converging a stale stored value', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    readMovarSettings,
  }) => {
    // The shape a build that still shipped the block-list editor would have
    // written — or a hand-edited storage entry roaming in over `storage.sync`.
    // Both `de` and `pl` survive `coerceLanguageList`, so only the derivation
    // can remove them; that keeps this test non-vacuous.
    await setMovarSettings({ priority: ['uk', 'en', 'pl'], blocked: ['ru', 'de', 'pl'] });

    // Reads deliberately do not write back (settings.ts), so the stale value is
    // still in storage at this point. Asserting it proves the seed landed and
    // that the convergence below is real work, not a no-op.
    expect((await readMovarSettings())?.blocked).toEqual(['ru', 'de', 'pl']);

    const page = await openOptions(movarContext, extensionId);
    await expect(page.getByRole('button', { name: 'Move Polish down' })).toBeVisible();

    // Any write goes through `enforceInvariants`; a priority edit is the user's
    // only remaining lever on the block list.
    await page.getByRole('button', { name: 'Remove Polish' }).click();
    await expect(page.getByRole('button', { name: 'Remove Polish' })).toHaveCount(0);

    await expect.poll(async () => (await readMovarSettings())?.blocked).toEqual(['ru']);
    expect((await readMovarSettings())?.priority).toEqual(['uk', 'en']);

    // …and it applies on reload: the page re-reads storage and the derived list
    // is what the content script will act on, with no editor to contradict it.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Language priority' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Blocked languages' })).toHaveCount(0);
    expect((await readMovarSettings())?.blocked).toEqual(['ru']);

    await page.close();
  });

  test('removes an exempt domain from the editor, updating the UI and storage', async ({
    movarContext,
    extensionId,
    setMovarSettings,
    readMovarSettings,
  }) => {
    await setMovarSettings({ allowlist: ['example.com', 'keep.org'] });
    const page = await openOptions(movarContext, extensionId);

    await page.getByRole('button', { name: 'Remove example.com' }).click();

    // The chip is gone and storage reflects it — the next load on example.com
    // would run Movar again; the untouched entry stays.
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove keep.org' })).toBeVisible();
    await expect.poll(async () => (await readMovarSettings())?.allowlist).toEqual(['keep.org']);

    await page.close();
  });
});
