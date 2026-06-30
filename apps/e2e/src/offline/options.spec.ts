/**
 * Options-render e2e suite. Loads the WXT-built Chrome extension via the
 * existing `extension.ts` fixture, opens `chrome-extension://<id>/options.html`
 * directly in a tab, and asserts the options page's top-level structure
 * in the default `E2E_SETTINGS` state (priority [uk, en],
 * contentModification: true, uiLanguage: 'auto' → 'en' because the fixture
 * pins --lang=en-US).
 *
 * What this proves:
 *   - manifest's `options.html` exists and the React app mounts under `#root`
 *     without throwing (`mountApp` is silent on failure, so we assert by
 *     reading rendered content)
 *   - the visible options sections render their localised English headings
 *     (PrioritySection + PageContentSection)
 *   - the deferred blocked-language and exempt-site editors stay hidden until
 *     those features are reimplemented end to end
 *   - the footer renders the language selector combobox
 *
 * What this does NOT prove:
 *   - per-section interactions (reorder priority, toggle contentModification)
 *     — those live in options.behavior.spec.ts
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

    // ─── Visible sections render with their English headings ──────────
    // Verbatim from messagesEn.options.{priority,pageContent}.title.
    // Using getByRole('heading') because each section uses `<h3>` — keeps
    // the assertion screen-reader-correct rather than depending on text
    // appearing somewhere on the page.
    await expect(page.getByRole('heading', { name: 'Language priority' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page content' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Blocked languages' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Exempt sites' })).toHaveCount(0);

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

    // ─── Deferred editors stay hidden ─────────────────────────────────
    // Blocked-language and exempt-site editing still exists in lower-level
    // settings helpers, but the options page must not expose those controls
    // again until the features are wired end to end.
    await expect(page.getByLabel('Russian is always blocked', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unblock Russian' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Domain to exempt' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Block another' })).toHaveCount(0);
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
    // Source-code link to the public repo, opened in a new tab.
    await expect(footer.getByRole('link', { name: 'Source code' })).toBeVisible();

    await page.close();
  });
});
