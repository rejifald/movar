/**
 * Popup-render e2e suite. Loads the WXT-built Chrome extension via the
 * existing `extension.ts` fixture, opens `chrome-extension://<id>/popup.html`
 * directly in a tab, and asserts the popup's top-level landmarks render in
 * the default `E2E_SETTINGS` state (enabled, contentModification on, no
 * pause).
 *
 * What this proves:
 *   - manifest's `popup.html` exists and the React app mounts under `#root`
 *     without throwing (`mountApp` is silent on failure, so we assert by
 *     reading rendered content)
 *   - the four popup sections render their localised English copy
 *     (StatusHeader + ContentToggle + PauseControls + footer)
 *   - the version pulled from `browser.runtime.getManifest()` matches a
 *     semver shape — i.e. the popup is reading the real manifest, not the
 *     `'preview'` fallback the App.tsx catch returns when chrome.runtime
 *     is absent
 *
 * What this does NOT prove:
 *   - the action-button popup surface (an OS-level popup window opened by
 *     the toolbar icon) — Playwright can't drive that today; opening the
 *     popup.html as a tab covers the same React tree
 *   - HiddenPanel — it requires a content script on the active tab, which
 *     `chrome-extension://` pages don't have; the popup correctly degrades
 *     to "no hidden panel" via `sendToActiveTab` returning null
 *   - per-tab state (corrections count > 0, real Pause UI) — those need a
 *     prior browsing session; the live suite exercises them indirectly
 *
 * Why this lives under `src/offline/` while `sites.spec.ts` lives under
 * `src/live/`: the live suite is opt-in, slow, network-flaky, and not
 * gated on PRs. The popup suite is fast, fully offline, deterministic —
 * it belongs in CI. The default `playwright.config.ts` scopes its
 * testDir to `./src/offline`; the live `playwright.live.config.ts`
 * scopes its testDir to `./src/live` — so neither suite double-runs the
 * other.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../fixtures/extension';

// Read the extension's manifest version from the source-of-truth
// package.json at module load. A static `import … from '…/package.json'`
// would need an `import attribute of "type: json"` at runtime under
// Playwright's ESM loader; `readFileSync` sidesteps that without
// dragging in a build-time JSON loader. The assertion below still
// pins the popup's rendered version to the build's source of truth.
const EXTENSION_PKG_PATH = fileURLToPath(
  new URL('../../../extension/package.json', import.meta.url),
);
const { version } = JSON.parse(readFileSync(EXTENSION_PKG_PATH, 'utf8')) as { version: string };

test.describe('extension popup', () => {
  test('renders the default-state UI when opened in a tab', async ({
    movarContext,
    extensionId,
    // List `serviceWorker` so the seed-settings side effect runs before
    // navigation — otherwise the popup's first paint can read pre-seed
    // storage and render `defaultSettings` instead of `E2E_SETTINGS`.
    serviceWorker: _seedingDep,
  }) => {
    const page = await movarContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Mount sanity check: `#root` exists in popup.html, but it's empty
    // until React mounts. Wait for the first child to appear before
    // asserting on its contents.
    await expect(page.locator('#root > *')).toHaveCount(1);

    // ─── Header — brand mark + status pill ─────────────────────────────
    await test.step('header', async () => {
      // The header is the popup's only <header> and sits at the page root,
      // so it picks up the `banner` landmark role. Scoping queries to the
      // banner future-proofs us against a "Movar" string appearing
      // elsewhere on the surface.
      const header = page.getByRole('banner');
      // The header contains two "Movar" strings: the BrandMark SVG's accessible
      // <title> AND the visible brand <span>. Assert both — proves the icon's
      // accessible name AND the visible word label both render, the two
      // signals a screen-reader user and a sighted user rely on respectively.
      await expect(header.getByText('Movar', { exact: true })).toHaveCount(2);
      await expect(header.locator('span').filter({ hasText: /^Movar$/ })).toBeVisible();

      // E2E_SETTINGS keeps `enabled: true`, so the status pill renders as
      // "Active" with the aria-label "Turn Movar off". `aria-pressed=true`
      // mirrors the toggle state — both are part of the contract the
      // screen-reader experience depends on.
      const statusPill = header.getByRole('button', { name: 'Turn Movar off' });
      await expect(statusPill).toBeVisible();
      await expect(statusPill).toHaveAttribute('aria-pressed', 'true');
      await expect(statusPill).toHaveText(/Active/);
    });

    // ─── Active hero — corrections count + priority chain ──────────────
    await test.step('activity section', async () => {
      // Fresh storage means zero corrections logged; the hero label uses
      // the singular/plural variants from i18n. Either is acceptable —
      // what we care about is "the count is rendered and the label reads
      // English". The default priority is [uk, en], surfaced as their
      // localised display names ("Українська" first).
      await expect(page.getByText(/corrections? today/)).toBeVisible();
      await expect(page.getByText(/Preferred order/i)).toBeVisible();
    });

    // ─── ContentToggle — checkbox wired to settings.contentModification ─
    await test.step('content toggle', async () => {
      // E2E_SETTINGS turns this on, so the checkbox is checked. Asserting
      // by role + accessible name catches a regression where the Checkbox
      // primitive drops its label association (the screen-reader contract).
      const contentToggle = page.getByRole('checkbox', {
        name: 'Hide blocked-language content',
      });
      await expect(contentToggle).toBeVisible();
      await expect(contentToggle).toBeChecked();
    });

    // ─── PauseControls — heading + two duration buttons ────────────────
    await test.step('pause controls', async () => {
      // Default state is not paused, so we see the "Pause Movar" eyebrow
      // and the two PAUSE_DURATIONS buttons. If the state were paused,
      // the component swaps to a single "Resume now" button — that path
      // is covered by the extension's vitest unit tests.
      await expect(page.getByText('Pause Movar', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '1 hour' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Until I resume' })).toBeVisible();
    });

    // ─── Footer — feedback link, settings button, version, language picker
    await test.step('footer', async () => {
      const footer = page.locator('footer');
      await expect(footer.getByRole('link', { name: 'Send feedback' })).toBeVisible();
      await expect(footer.getByRole('button', { name: /Settings/ })).toBeVisible();
      // Version comes from browser.runtime.getManifest().version, which is
      // sourced from package.json and pinned at build time. We import the
      // version here to assert exact equality, so version bumps are caught
      // as a test change rather than a passing assertion on a loose regex.
      await expect(footer.getByText(`v${version}`)).toBeVisible();
      // LanguageSelector renders a native <select> with aria-label="Language".
      await expect(footer.getByRole('combobox', { name: 'Language' })).toBeVisible();
    });

    await page.close();
  });
});
