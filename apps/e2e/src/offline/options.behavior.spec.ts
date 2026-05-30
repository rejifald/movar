/**
 * Options behavior e2e suite. Exercises the click → state → storage
 * round-trip for every options-page interaction that mutates persistent
 * state.
 *
 * What this proves (vs the structural `options.spec.ts`):
 *   - typing into the allowlist input + clicking Add → the domain
 *     appears as a chip AND lands in `settings.allowlist`
 *   - pressing Enter (not just clicking Add) submits the allowlist form
 *     — the keyboard path is part of the accessibility contract
 *   - invalid input surfaces the documented validation error AND no
 *     domain is added to storage
 *   - duplicate input surfaces the documented duplicate error
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
 * Locked-Russian invariant: structurally asserted in options.spec.ts.
 * Not duplicated here — this file is for behavior (click → state →
 * storage), and locked-Russian has no click path.
 */
import { expect, test } from '../fixtures/extension';
import { openOptions } from '../fixtures/options';

test.describe('extension options — behavior', () => {
  test('adding a domain via the allowlist input + Add button persists it', async ({
    movarContext,
    extensionId,
    readMovarSettings,
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
    const persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['example.com']);

    await page.close();
  });

  test('normaliseDomain handles mixed case, URLs, trailing slashes, and www. prefix', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    const page = await openOptions(movarContext, extensionId);
    const input = page.getByRole('textbox', { name: 'Domain to exempt' });
    const addButton = page.locator('form').getByRole('button', { name: 'Add', exact: true });

    // Test case 1: mixed case (Example.COM) normalises to lowercase (example.com)
    await input.fill('Example.COM');
    await addButton.click();
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    let persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['example.com']);

    // Clear for next test
    await page.getByRole('button', { name: 'Remove example.com' }).click();
    await expect(page.getByText('No sites are exempt.')).toBeVisible();

    // Test case 2: full URL (https://example.com/) strips protocol and trailing slash
    await input.fill('https://example.com/');
    await addButton.click();
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['example.com']);

    // Clear for next test
    await page.getByRole('button', { name: 'Remove example.com' }).click();
    await expect(page.getByText('No sites are exempt.')).toBeVisible();

    // Test case 3: trailing slash (example.com/) is removed
    await input.fill('example.com/');
    await addButton.click();
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['example.com']);

    // Clear for next test
    await page.getByRole('button', { name: 'Remove example.com' }).click();
    await expect(page.getByText('No sites are exempt.')).toBeVisible();

    // Test case 4: www. prefix is stripped (shared.tsx:36 `normaliseDomain`
    // runs `.replace(/^www\./, '')` after lowercasing and protocol-strip).
    // www.example.com must be stored as example.com — not www.example.com —
    // so the allowlist matches bare hostnames in the DNR rule's
    // `excludedRequestDomains`, which never includes `www.`.
    await input.fill('www.example.com');
    await addButton.click();
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['example.com']);

    await page.close();
  });

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

  test('pressing Enter in the allowlist input submits the form (keyboard path)', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    // The Add-button click path is covered above; this test exists
    // because AllowlistSection wraps its input + button in a real
    // `<form>` whose onSubmit handler is what runs the add. A regression
    // that wired the handler only to the button's onClick would break
    // the keyboard path even though the form structurally exists. This
    // is the only keyboard-only path the user can take across the whole
    // options page; without this assertion, a regression that removes
    // Enter-to-submit ships silently.
    const page = await openOptions(movarContext, extensionId);

    const input = page.getByRole('textbox', { name: 'Domain to exempt' });
    await input.fill('keyboard-only.example');
    await input.press('Enter');

    await expect(page.getByRole('button', { name: 'Remove keyboard-only.example' })).toBeVisible();
    const persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['keyboard-only.example']);

    await page.close();
  });

  test('an invalid domain surfaces the bad-domain error and writes nothing to storage', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    // `not a domain` fails `DOMAIN_PATTERN` (shared.tsx:40), which the
    // submit handler maps to `t.options.allowlist.errorBadDomain`.
    // Asserting BOTH the visible error AND that storage stayed empty
    // proves the validation actually short-circuits the write — a
    // regression that surfaces the error but ALSO writes the invalid
    // value would only show on the second half.
    const page = await openOptions(movarContext, extensionId);

    const input = page.getByRole('textbox', { name: 'Domain to exempt' });
    await input.fill('not a domain');
    await page.locator('form').getByRole('button', { name: 'Add', exact: true }).click();

    // Asserts on the literal English copy from `messages-en.ts:232`
    // (`errorBadDomain`). Hard-coded here rather than imported from the
    // extension package — the e2e suite reads the built extension, not
    // its source, and the copy IS part of the behavioural contract
    // (changing it changes what the test is proving).
    await expect(page.getByText('Enter a domain like example.com')).toBeVisible();
    const persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual([]);

    // Error-clears-on-edit path (AllowlistSection.tsx:74 `setError(null)` in
    // the input's onChange handler). Typing into the field after an error
    // must dismiss the error immediately — leaving it visible while the user
    // corrects their input is a UX regression.
    await input.fill('fixing-it.com');
    await expect(page.getByText('Enter a domain like example.com')).toHaveCount(0);

    await page.close();
  });

  test('a duplicate domain surfaces the duplicate error and does not double-write', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    // Add a domain via UI first, then attempt to re-add it. This exercises
    // the `settings.allowlist.includes(domain)` branch in AllowlistSection.submit
    // without relying on setMovarSettings.
    const page = await openOptions(movarContext, extensionId);

    // Add the initial entry via the form.
    const addButton = page.locator('form').getByRole('button', { name: 'Add', exact: true });
    const input = page.getByRole('textbox', { name: 'Domain to exempt' });
    await input.fill('example.com');
    await addButton.click();
    await expect(page.getByRole('button', { name: 'Remove example.com' })).toBeVisible();
    await input.fill('example.com');
    await page.locator('form').getByRole('button', { name: 'Add', exact: true }).click();

    // Literal English copy from `messages-en.ts:233` (`errorDuplicate`).
    await expect(page.getByText('Already on the list')).toBeVisible();
    // Persistence assertion: allowlist length stays at 1 — the duplicate
    // didn't sneak in via a second push.
    const persisted = await readMovarSettings();
    expect(persisted?.allowlist).toEqual(['example.com']);

    // Error-clears-on-edit path: same `setError(null)` in onChange fires for
    // the duplicate error too. Typing any character must dismiss the error.
    await input.fill('other.com');
    await expect(page.getByText('Already on the list')).toHaveCount(0);

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

  // Item 3: add + remove a blocked language outside the locked-Russian set.
  test('BlockedSection add/remove for a non-locked language leaves Russian intact', async ({
    movarContext,
    extensionId,
    readMovarSettings,
  }) => {
    // Start from the default E2E_SETTINGS: blocked = ['ru'] (locked).
    const page = await openOptions(movarContext, extensionId);

    // Add German ('de') to the blocked list. The AddLanguagePicker for
    // BlockedSection uses `t.options.blocked.addLabel` → "Block another" as
    // the Select placeholder and button aria-label (shared.tsx:73, messages-en.ts:224).
    const blockedPicker = page.getByRole('combobox', { name: 'Block another' });
    await blockedPicker.selectOption({ label: 'German (de)' });
    await page.getByRole('button', { name: 'Block another' }).click();

    // 'de' chip appears as a removable entry (not locked — BlockedSection
    // renders an IconButton with label `t.options.blocked.unblock(name)`).
    await expect(page.getByRole('button', { name: 'Unblock German' })).toBeVisible();
    let persisted = await readMovarSettings();
    // Locked Russian is still there; German was appended.
    expect(persisted?.blocked).toContain('ru');
    expect(persisted?.blocked).toContain('de');

    // Remove German: click the Unblock button.
    await page.getByRole('button', { name: 'Unblock German' }).click();
    await expect(page.getByRole('button', { name: 'Unblock German' })).toHaveCount(0);

    persisted = await readMovarSettings();
    // Locked Russian is still present after the German removal.
    expect(persisted?.blocked).toContain('ru');
    expect(persisted?.blocked).not.toContain('de');

    await page.close();
  });
});
