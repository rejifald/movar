/**
 * Russian-browser-language e2e suite. Boots Chromium with `--lang=ru-RU`
 * (`browserUiLanguage` test option, declared in `fixtures/extension.ts`)
 * to exercise the "user runs Movar in a Russian-language Chrome" path:
 * a contingent of our actual users have system Chrome in RU because
 * they're long-time Ru-speakers we're helping migrate away from.
 *
 * The product premise is "Movar helps Ukrainians dodge Russian content
 * regardless of how their browser is configured". A Russian-localised
 * Chrome would, absent Movar, send `Accept-Language: ru-RU,ru;q=0.9`
 * to every site and render the popup/options surfaces in whatever the
 * extension defaults to for unsupported locales. Both of those are
 * exactly what users picked Movar to NOT happen — so this spec proves
 * the four independent invariants that keep Russian out:
 *
 *   - the installed DNR Accept-Language rule has NO `ru` in its value;
 *     it stays driven by `settings.priority` (the locked-blocked policy
 *     in `enforceLockedLanguages` keeps `ru` out of `priority` at the
 *     storage layer, so the DNR builder never sees it)
 *   - the persisted `settings.priority` reflects that invariant —
 *     defense in depth at the storage shape level
 *   - the options page still renders the locked-Russian DOM signals
 *     (lock indicator present, "Unblock Russian" button absent) — proves
 *     the BlockedSection's locked branch doesn't accidentally mount the
 *     unblock affordance because the browser's UI language changed
 *   - the popup falls back to English copy (not Ukrainian, not Russian)
 *     because Russian is not a supported UI locale — `resolveLocale`
 *     returns 'en' for any non-'uk' browser language. Asserting both
 *     the English present + Ukrainian absent guards against a regression
 *     that mis-resolved 'ru' → 'uk' (which would be the worst outcome
 *     here, since a Russian browser silently snapping to a Ukrainian
 *     UI would be confusing).
 *
 * Lives in the offline suite — the assertions are all about Movar's
 * internal state + DOM signals, no network needed. Sister specs cover
 * the same invariants under `--lang=en-US`; this one's job is to prove
 * they hold under the deliberately adversarial browser-locale case.
 */
import type { Worker } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { openOptions } from '../fixtures/options';
import { openPopup } from '../fixtures/popup';

/** Opt the whole file into the Russian-browser launch. Worker-scoped
 *  option, so every test in this file shares the same `--lang=ru-RU`
 *  Chromium without paying per-test launch overhead beyond what the
 *  base fixture already costs. Other specs in the suite stay on the
 *  default `'en-US'` — this knob is opt-in, not a project-wide flip. */
test.use({ browserUiLanguage: 'ru-RU' });

/** Stable id mirrors `apps/extension/src/lib/dnr.ts:6`. Duplicated here
 *  intentionally — the e2e package doesn't depend on `@movar/extension`
 *  (it consumes the built `.output/chrome-mv3` directly), and wiring it
 *  in just to read one numeric constant would be more coupling than the
 *  constant itself. The number is part of the persisted DNR contract,
 *  so a rename has to be deliberate anyway. */
const ACCEPT_LANGUAGE_RULE_ID = 1;

/** Read the `Accept-Language` header value from Movar's installed DNR
 *  rule, evaluated inside the MV3 service worker so we read the actual
 *  Chrome `declarativeNetRequest` state — not a mocked or shimmed copy.
 *  Returns `null` if the rule isn't installed yet OR has no
 *  `Accept-Language` requestHeader (which would be a bug — the
 *  syncAcceptLanguageRule path always writes one when active). */
async function readAcceptLanguageHeader(serviceWorker: Worker): Promise<string | null> {
  return await serviceWorker.evaluate(async (ruleId) => {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const rule = rules.find((r) => r.id === ruleId);
    const action = rule?.action as
      | {
          requestHeaders?: { header: string; operation: string; value: string }[];
        }
      | undefined;
    const header = action?.requestHeaders?.find((h) => h.header === 'Accept-Language');
    return header?.value ?? null;
  }, ACCEPT_LANGUAGE_RULE_ID);
}

test.describe('extension with Russian browser UI language', () => {
  test('Accept-Language DNR rule reflects settings.priority — no `ru` leaks from the browser locale', async ({
    serviceWorker,
  }) => {
    // The seed step in the `serviceWorker` fixture writes E2E_SETTINGS,
    // which fires `chrome.storage.onChanged`, which the background's
    // `onSettingsChange` listener routes into `resync()` →
    // `syncAcceptLanguageRule()`. That chain is async — the SW evaluate
    // returns before the listener finishes — so poll until the rule
    // settles. `toPass` retries the inner expects on the same SW eval
    // until they hold or the timeout fires.
    await expect(async () => {
      const value = await readAcceptLanguageHeader(serviceWorker);
      // Positive shape: priority is the default `[uk, en]` (E2E_SETTINGS
      // doesn't override it). The header builder steps q down by 0.1
      // per position, so `[uk, en]` → "uk,en;q=0.9". This is the exact
      // string we'd see on a fresh install in an English-language Chrome
      // too — `--lang=ru-RU` must NOT change it.
      expect(value).toBe('uk,en;q=0.9');
    }).toPass({ timeout: 5_000 });

    // Negative shape, asserted separately so a regression reads cleanly
    // in the report: a future change that started threading
    // `navigator.languages` into the header builder would land here
    // with a value like `ru,uk,en;q=0.8` and the contains-check would
    // flag exactly the violation.
    const value = await readAcceptLanguageHeader(serviceWorker);
    expect(value).not.toContain('ru');
  });

  test('settings.priority excludes Russian; settings.blocked still contains it', async ({
    readMovarSettings,
  }) => {
    // Storage-shape invariant: `enforceLockedLanguages` (in
    // `@movar/shared`) strips locked codes from `priority` and ensures
    // they're present in `blocked`, at every storage read/write
    // boundary. The Russian-browser case can't reach this code path
    // any differently than English-browser — but the assertion guards
    // against a regression that introduced a navigator-language-driven
    // priority seed somewhere downstream of `enforceLockedLanguages`.
    const persisted = await readMovarSettings();
    expect(persisted?.priority ?? []).not.toContain('ru');
    expect(persisted?.blocked ?? []).toContain('ru');
  });

  test('options page still renders the locked-Russian DOM signals', async ({
    movarContext,
    extensionId,
  }) => {
    const page = await openOptions(movarContext, extensionId);

    // Same DOM contract as `options.behavior.spec.ts` and `options.spec.ts`'s
    // locked-Russian assertions — proves the BlockedSection's locked
    // branch (which renders the LockIcon span instead of the unblock
    // IconButton) is keyed on `isLockedBlocked(code)`, not on any
    // browser-locale signal. Strings are in English here because the
    // popup/options surfaces resolve `uiLanguage: 'auto'` against
    // `browser.i18n.getUILanguage()` and fall back to English for any
    // non-'uk' primary subtag — `'ru'` included. See `resolveLocale`
    // in `apps/extension/src/lib/i18n/resolve.ts`.
    await expect(page.getByLabel('Russian is always blocked', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unblock Russian' })).toHaveCount(0);

    await page.close();
  });

  test('popup UI falls back to English (Russian is not a supported UI locale)', async ({
    movarContext,
    extensionId,
  }) => {
    const page = await openPopup(movarContext, extensionId);

    // English copy IS visible — the status pill's aria-label resolves
    // through `messagesEn.status.turnOff`. If `resolveLocale` had a bug
    // that snapped 'ru' to 'uk' (the worst regression here, since a
    // Russian browser silently rendering a Ukrainian popup is the
    // confusing outcome users picked Movar to avoid), this would fail.
    await expect(page.getByRole('button', { name: 'Turn Movar off' })).toBeVisible();

    // Ukrainian copy is NOT present. Same surface, opposite catalogue —
    // asserts both halves of the resolver branch are right, not just
    // that one of them happened to render.
    await expect(page.getByRole('button', { name: 'Вимкнути Movar' })).toHaveCount(0);

    // Belt + braces: the LanguageSelector's "Auto" option label is
    // `Auto (<resolved locale name>)`. With `--lang=ru-RU` → resolver
    // returns 'en' → the rendered option text is "Auto (English)".
    // Catches a regression where resolveLocale started returning 'uk'
    // for cyrillic-script browser languages — "Auto (Українська)"
    // would land here in that case.
    const selector = page.getByRole('combobox', { name: 'Language' });
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue('auto');
    // Read the visible option text via the DOM rather than asserting on
    // the combobox value (which is the UiLanguage code `'auto'`, not the
    // user-facing label). The selected option's text contains the
    // resolved-locale name in parentheses.
    const selectedOptionText = await selector
      .locator('option:checked')
      .evaluate((el) => (el as HTMLOptionElement).textContent ?? '');
    expect(selectedOptionText).toContain('English');
    expect(selectedOptionText).not.toContain('Українська');

    await page.close();
  });
});
