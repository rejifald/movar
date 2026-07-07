/**
 * Onboarding visual-regression suite. Loads the real WXT-built extension,
 * stamps a controlled settings state, opens the first-run onboarding page
 * as a tab, and compares pixels against a committed baseline.
 *
 * ─────────────────────────────────────────────────────────────────────
 * State matrix
 * ─────────────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────┬──────────────┬─────────────────────────┐
 *   │ Test case                   │ Visual snap? │ Why                     │
 *   ├─────────────────────────────┼──────────────┼─────────────────────────┤
 *   │ default-en                  │ yes          │ canonical (pin + access)│
 *   │ default-uk                  │ yes          │ Ukrainian translations  │
 *   │ default-en           (dark) │ yes          │ token flip, canonical   │
 *   │ default-uk           (dark) │ yes          │ token flip + UA glyphs  │
 *   └─────────────────────────────┴──────────────┴─────────────────────────┘
 *
 * Axes covered:
 *   - settings.priority (en-first vs uk-first) — the onboarding page
 *     resolves its locale from priority, not settings.uiLanguage (see
 *     `fixtures/onboarding.ts`)
 *   - prefers-color-scheme (light vs dark)
 *
 * Axes intentionally NOT exercised here (see `fixtures/onboarding.ts` for
 * why): the access-step "missing"/"requesting" permission states, and the
 * Firefox/Safari flow variants. The e2e build forces `<all_urls>` as a
 * required host permission and always resolves to the Chromium flow, so
 * only the "granted" Chromium/Firefox-shaped state is reachable here. The
 * other states are covered by the `Components/Onboarding` Storybook
 * stories, which mock `browser.permissions` directly.
 *
 * Why these are split out into their own file: same rationale as
 * `popup.visual.spec.ts` / `options.visual.spec.ts` — structural failures
 * and pixel failures are different signals in CI triage, and the visual
 * file owns its own baselines under `onboarding.visual.spec.ts-snapshots/`.
 *
 * Baseline workflow: identical to popup/options — see
 * `popup.visual.spec.ts`'s doc comment for the full recipe
 * (`pnpm --filter @movar/e2e test:update -- --update-snapshots=all --grep
 * "onboarding.*visual"` locally for darwin, `regenerate-baselines.yml` for
 * the committed linux set).
 */
import { expect, test } from '../fixtures/extension';
import { onboardingRoot, openOnboarding } from '../fixtures/onboarding';

test.describe('extension onboarding — visual', () => {
  test('default state, English UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    // Onboarding resolves its locale from settings.priority, not
    // settings.uiLanguage — see fixtures/onboarding.ts.
    await setMovarSettings({ priority: ['en', 'uk'] });
    const page = await openOnboarding(movarContext, extensionId);

    // Settle on the seeded state before snapshotting, and on the real
    // (e2e-build-forced) granted host permission — both the pin step and
    // the access step's "granted" line are the full expected render.
    await expect(page.getByRole('heading', { name: 'Pin Movar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Let Movar read page content' })).toBeVisible();
    await expect(page.getByText('Movar can read page content.')).toBeVisible();

    await expect(onboardingRoot(page)).toHaveScreenshot('onboarding-default-en.png');
    await page.close();
  });

  test('default state, Ukrainian UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ priority: ['uk', 'en'] });
    const page = await openOnboarding(movarContext, extensionId);

    await expect(page.getByRole('heading', { name: 'Закріпіть Movar' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Дозвольте Movar читати вміст сторінки' }),
    ).toBeVisible();
    await expect(page.getByText('Movar може читати вміст сторінки.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pin Movar' })).toHaveCount(0);

    await expect(onboardingRoot(page)).toHaveScreenshot('onboarding-default-uk.png');
    await page.close();
  });
});

test.describe('extension onboarding — visual (dark mode)', () => {
  // Each test below is the dark-mode counterpart of the equivalently-named
  // light test above. Setup is identical except for `colorScheme: 'dark'`
  // on `openOnboarding`, which triggers the `@media (prefers-color-scheme:
  // dark)` rules in `packages/ui/src/tokens.css`.

  test('default state, English UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ priority: ['en', 'uk'] });
    const page = await openOnboarding(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('heading', { name: 'Pin Movar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Let Movar read page content' })).toBeVisible();
    await expect(page.getByText('Movar can read page content.')).toBeVisible();

    await expect(onboardingRoot(page)).toHaveScreenshot('onboarding-default-en-dark.png');
    await page.close();
  });

  test('default state, Ukrainian UI', async ({ movarContext, extensionId, setMovarSettings }) => {
    await setMovarSettings({ priority: ['uk', 'en'] });
    const page = await openOnboarding(movarContext, extensionId, { colorScheme: 'dark' });

    await expect(page.getByRole('heading', { name: 'Закріпіть Movar' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Дозвольте Movar читати вміст сторінки' }),
    ).toBeVisible();
    await expect(page.getByText('Movar може читати вміст сторінки.')).toBeVisible();

    await expect(onboardingRoot(page)).toHaveScreenshot('onboarding-default-uk-dark.png');
    await page.close();
  });
});
