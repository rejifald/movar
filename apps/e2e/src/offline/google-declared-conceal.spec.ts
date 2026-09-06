/**
 * Google declared-language conceal — the roster scope of a declaration.
 *
 * Google injects "Перекласти цю сторінку" into every result whose language
 * differs from the INTERFACE language, and @movar/page-content reads that
 * link's `sl` param as `ContentNode.declaredLang`. On an `hl=uk` SERP that
 * hands the content filter a declaration for every non-Ukrainian card on the
 * page — English and Polish included, not just Russian.
 *
 * That is only safe because a conceal decision is roster-scoped. The declared
 * fusion returns an out-of-roster code VERBATIM (a {uk, ru} roster fed
 * `declared: 'en'` answers `en` at 0.752), so a gate that asked merely "is this
 * language enabled?" would curtain every English, Polish, German, French,
 * Spanish, Italian, Belarusian and Bulgarian result on Google's say-so —
 * languages the user never blocked. `decideFused` requires the language to be
 * IN the roster; this is the end-to-end pin on that, in a real Chromium with
 * the real built extension, the real MV3 worker and the real Google extractor.
 *
 * Priority is narrowed to `['uk']` on purpose. The shipped default is
 * `['uk', 'en']`, which KEEPS English by the enabled check alone and would let
 * this pass without the roster clause ever being exercised — the same vacuity
 * that let the defect ship. With `['uk']` the roster is {uk, ru} and English is
 * genuinely outside it, which is the case that has to hold.
 *
 * Deliberately offline: the SERP is fulfilled from a fixture, so there is no
 * DNS, no anti-bot, and no dependence on what Google happens to serve today.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { waitForMovarSettled } from '../fixtures/movar-state';

/** Already a fixed point for `priority: ['uk']` — `hl=uk` and `lr=lang_uk` are
 *  exactly what the searchParams rewrite would write, so the enforce rule has
 *  nothing to change and never navigates. Keeps the test about concealment. */
const SERP_URL =
  'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5+%D0%BD%D0%B0%D0%BF%D1%80%D1%83%D0%B3%D0%B8&hl=uk&lr=lang_uk';

/** A card is concealed when Movar curtained it (default mode) or hard-hid it. */
async function isConcealed(page: Page, id: string): Promise<boolean> {
  return page.evaluate((fixtureId) => {
    const el = document.querySelector<HTMLElement>(`[data-fixture-id="${fixtureId}"]`);
    if (el === null) throw new Error(`card ${fixtureId} missing from the SERP fixture`);
    return (
      el.hasAttribute('data-movar-curtain') ||
      el.querySelector('[data-movar-curtain]') !== null ||
      el.hasAttribute('data-movar-hidden') ||
      el.style.display === 'none'
    );
  }, id);
}

test.describe('Google SERP — a declaration only conceals inside the roster', () => {
  test('keeps en/pl declared by a translate link, still hides the ru one', async ({
    movarPage,
    movarContext,
    setMovarSettings,
  }) => {
    // Narrow priority to Ukrainian alone: roster becomes {uk, ru}, so the
    // English and Polish declarations are genuinely out of scope.
    await setMovarSettings({ contentModification: true, priority: ['uk'], blocked: ['ru'] });

    const route = await mockSite(
      movarContext,
      'https://www.google.com/search*',
      'google-serp-declared-mix',
    );
    await movarPage.goto(SERP_URL, { waitUntil: 'domcontentloaded' });
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

    // Guard the "URL typo -> 404 -> nothing to hide -> passes" failure mode.
    expect(route.hits).toBeGreaterThanOrEqual(1);

    // The mechanism must still WORK — otherwise "nothing was hidden" would
    // pass for the wrong reason on a page where concealment simply never ran.
    expect(await isConcealed(movarPage, 'ru-declared')).toBe(true);

    // …and must not reach past the roster.
    expect(await isConcealed(movarPage, 'en-declared')).toBe(false);
    expect(await isConcealed(movarPage, 'pl-declared')).toBe(false);
    expect(await isConcealed(movarPage, 'uk-plain')).toBe(false);
  });
});
