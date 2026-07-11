/**
 * Popup crash-screen visual-regression suite. The crash UI can't be reached
 * from a healthy popup, so we force it: the MOVAR_E2E build (the one this suite
 * loads) carries a query-param crash probe in
 * `apps/extension/src/entrypoints/popup/main.tsx`, gated on `__MOVAR_E2E__` so it
 * tree-shakes out of every shipped build.
 *
 *   - `?__e2eCrash=card`  — renders the real `PopupCrashFallback`: a crashed
 *     StatusHeader (brand bar + a muted "unexpected error" hero + a reload
 *     button), the screen a user sees when the popup's React tree throws.
 *   - `?__e2eCrash=panel` — forces the crash card itself to throw, so
 *     PopupCrashFallback's inner ErrorBoundary drops to the minimal, width-fixed
 *     backstop panel (the ultimate fallback if even the crash card can't render).
 *   - `?__e2eLang=en|uk`  — pins the crash-copy locale. The crash reads
 *     `document.documentElement.lang` before I18nProvider mounts, so locale is
 *     browser-seeded, not settings-driven; the probe sets it from this param.
 *
 * Both surfaces get an en/uk × light/dark matrix, mirroring popup.visual.spec:
 * the design tokens flip on `prefers-color-scheme: dark` (a dark-only regression
 * can't hide behind a passing light baseline), and the two locales exercise the
 * Cyrillic glyph set and its wrapping.
 *
 * Settle signals: the crash card is a StatusHeader, which sets NO `role=alert`;
 * the minimal panel (app-shell's ErrorBoundary default) DOES. Asserting the
 * title plus the presence/absence of the alert role proves we snapshot the
 * intended surface, not whichever rendered first.
 *
 * Baselines: `pnpm e2e:baselines -- --grep "popup — crash"` regenerates this
 * suite's Linux PNGs in the pinned Playwright container (see popup.visual.spec's
 * "Baseline workflow" — don't run `:update` on a macOS host).
 */
import { expect, test } from '../fixtures/extension';
import { openPopup, popupRoot } from '../fixtures/popup';

const TITLE = { en: 'Something went wrong', uk: 'Щось пішло не так' } as const;

test.describe('extension popup — crash (visual)', () => {
  test('crash card, English UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=card&__e2eLang=en',
    });
    // The crash card is a StatusHeader — no alert role — showing the crash title.
    await expect(page.getByText(TITLE.en)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-card-en.png');
    await page.close();
  });

  test('crash card, Ukrainian UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=card&__e2eLang=uk',
    });
    await expect(page.getByText(TITLE.uk)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-card-uk.png');
    await page.close();
  });

  test('backstop panel, English UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=panel&__e2eLang=en',
    });
    // The double-fault drops to the minimal panel, which carries role=alert.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(TITLE.en)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-panel-en.png');
    await page.close();
  });

  test('backstop panel, Ukrainian UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=panel&__e2eLang=uk',
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(TITLE.uk)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-panel-uk.png');
    await page.close();
  });
});

test.describe('extension popup — crash (visual, dark mode)', () => {
  // Dark counterparts of the light cases above — identical setup except the
  // `colorScheme: 'dark'` option, which triggers the prefers-color-scheme token
  // flip. Baselines share the `*-snapshots/` dir, suffixed `-dark`.

  test('crash card, English UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=card&__e2eLang=en',
      colorScheme: 'dark',
    });
    await expect(page.getByText(TITLE.en)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-card-en-dark.png');
    await page.close();
  });

  test('crash card, Ukrainian UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=card&__e2eLang=uk',
      colorScheme: 'dark',
    });
    await expect(page.getByText(TITLE.uk)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-card-uk-dark.png');
    await page.close();
  });

  test('backstop panel, English UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=panel&__e2eLang=en',
      colorScheme: 'dark',
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(TITLE.en)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-panel-en-dark.png');
    await page.close();
  });

  test('backstop panel, Ukrainian UI', async ({ movarContext, extensionId }) => {
    const page = await openPopup(movarContext, extensionId, {
      search: '?__e2eCrash=panel&__e2eLang=uk',
      colorScheme: 'dark',
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(TITLE.uk)).toBeVisible();

    await expect(popupRoot(page)).toHaveScreenshot('popup-crash-panel-uk-dark.png');
    await page.close();
  });
});
