/**
 * Options-render e2e suite. Loads the WXT-built Chrome extension via the
 * existing `extension.ts` fixture, opens `chrome-extension://<id>/options.html`
 * directly in a tab, and asserts the options page's top-level structure
 * in the default `E2E_SETTINGS` state (priority [uk, en], blocked [ru],
 * allowlist [], contentModification: true, uiLanguage: 'auto' → 'en'
 * because the fixture pins --lang=en-US).
 *
 * What this proves:
 *   - manifest's `options.html` exists and the React app mounts under `#root`
 *     without throwing (`mountApp` is silent on failure, so we assert by
 *     reading rendered content)
 *   - the four options sections render their localised English headings
 *     (PrioritySection + BlockedSection + AllowlistSection + PageContentSection)
 *   - the locked-Russian invariant holds: the Russian chip shows a lock
 *     indicator (an inline SVG inside a span with the `lockedHint`
 *     aria-label), and the unblock button is NOT rendered (the
 *     BlockedSection branch literally doesn't mount it for locked codes)
 *   - the footer renders the language selector combobox
 *
 * What this does NOT prove:
 *   - per-section interactions (add/remove allowlist domain, reorder
 *     priority, toggle contentModification) — those live in
 *     options.behavior.spec.ts
 *   - pixel-perfect rendering — that's options.visual.spec.ts
 *   - the chrome://extensions/?options= modal wrapping — Playwright
 *     can't drive that surface today; opening options.html as a tab
 *     covers the same React tree, which is what the contract is about
 *
 * Why this lives alongside the other offline specs: see the default
 * `playwright.config.ts` — every offline surface runs under the same
 * config in CI; narrow iteration uses `--grep` (e.g.
 * `pnpm test -- --grep options`).
 */
import { expect, test } from '../fixtures/extension';
import { openOptions } from '../fixtures/options';

test.describe('extension options', () => {
  test('renders the default-state UI when opened in a tab', async ({
    movarContext,
    extensionId,
    readMovarSettings,
    // List `serviceWorker` so the seed-settings side effect runs before
    // navigation — otherwise the options page's first paint can read
    // pre-seed storage and render `defaultSettings` instead of E2E_SETTINGS.
    serviceWorker: _seedingDep,
  }) => {
    const page = await openOptions(movarContext, extensionId);

    // Mount sanity check: `#root` is in options.html, `<main>` is the
    // App's outer container. Both present = React tree rendered past
    // I18nProvider into OptionsBody.
    await expect(page.locator('#root main')).toHaveCount(1);

    // ─── Four sections render with their English headings ─────────────
    // Verbatim from messagesEn.options.{priority,blocked,allowlist,pageContent}.title.
    // Using getByRole('heading') because each section uses `<h3>` — keeps
    // the assertion screen-reader-correct rather than depending on text
    // appearing somewhere on the page.
    await expect(page.getByRole('heading', { name: 'Language priority' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Blocked languages' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exempt sites' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page content' })).toBeVisible();

    // ─── Page-content switch — wired to settings.contentModification ─
    // E2E_SETTINGS turns it on, so the switch is checked. Asserting by role +
    // accessible name catches a regression where the shared popup/options
    // control drops its label association.
    const contentModToggle = page.getByRole('switch', {
      name: 'Filter blocked-language content',
    });
    await expect(contentModToggle).toBeVisible();
    await expect(contentModToggle).toBeChecked();
    await expect(
      page.getByRole('radiogroup', { name: 'How to hide filtered content' }),
    ).toBeVisible();

    // ─── Locked-Russian invariant ─────────────────────────────────────
    // BlockedSection.tsx: when isLockedBlocked(code) is true, the chip
    // renders an inline LockIcon SVG inside a span with
    // `aria-label=lockedHint(name)` INSTEAD of the unblock IconButton.
    // The contract is threefold:
    //   1. the lock indicator is present
    //   2. the unblock button is NOT rendered at all
    //   3. storage still records `ru` in blocked (defence against a
    //      regression that hand-removed `ru` from the seed; surfaces
    //      here rather than downstream in a content-script test)
    await expect(page.getByLabel('Russian is always blocked', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unblock Russian' })).toHaveCount(0);
    const persisted = await readMovarSettings();
    expect(persisted?.blocked).toContain('ru');

    // ─── Footer — language selector ───────────────────────────────────
    // LanguageSelector renders a native <select> with aria-label="Language".
    const footer = page.locator('footer');
    await expect(footer.getByRole('combobox', { name: 'Language' })).toBeVisible();
    // Version comes from browser.runtime.getManifest().version; matching a
    // semver shape rules out the App.tsx fallback string 'preview' that
    // would appear if chrome.runtime were unavailable.
    await expect(footer.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
    // Feedback link uses the shared FEEDBACK_URL constant. Asserting on the
    // localised text ('Send feedback') proves the i18n catalogue resolved
    // and the link is reachable by keyboard users.
    await expect(footer.getByRole('link', { name: 'Send feedback' })).toBeVisible();

    await page.close();
  });
});
