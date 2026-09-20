/**
 * Native `<select>` picker behaviour — the surface with no pixels.
 *
 * `LAYOUT_SURFACES.native` marks a blocked `<option>` in place: it stays in the
 * list, gets `disabled`, and its label becomes the neutral mark. Nothing is
 * drawn on the page, and a `<select>`'s popup is rendered by the OS rather than
 * the page compositor, so no screenshot can contain the mark. These are DOM
 * assertions for that reason, not as a second-best — there is nothing to
 * photograph, which is the whole point of the design.
 *
 * What this replaced: a badge floating beside the control on `document.body`,
 * kept in place by a capture-phase scroll listener, a rAF coalescer, a
 * ResizeObserver on both the control and the document element, viewport
 * clamping and a leading-side flip. All of it existed only because the mark was
 * not in the control. `picker-badge.behavior.spec.ts` measured that apparatus
 * and went with it.
 *
 * Offline contract as elsewhere in this suite: the fixture is served via
 * `context.route` and the REAL content script runs against it — the picker
 * filter, the layout verdict and the conceal path are all the shipped code, so
 * a stale build fails here rather than passing on source that was never
 * bundled.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

const SELECT_URL = 'https://mocked-picker-native.example.test/';

/** The neutral mark, in the suite's default en-US UI. Deliberately not the
 *  endonym: it sits in a list OF language names, where naming the language
 *  Movar took away reads as one more to pick. */
const NEUTRAL_LABEL = 'Movar: hidden';

interface OptionState {
  value: string;
  text: string;
  disabled: boolean;
  hidden: boolean;
  movarHidden: string | null;
}

/** Read the control's options in DOM order, in one round trip. */
async function readOptions(page: Page): Promise<OptionState[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLOptionElement>('#lang-select option')].map((o) => ({
      value: o.value,
      text: o.textContent,
      disabled: o.disabled,
      hidden: o.hidden === true,
      movarHidden: o.getAttribute('data-movar-hidden'),
    })),
  );
}

async function openFixture(movarContext: BrowserContext, movarPage: Page): Promise<void> {
  const route = await mockSite(movarContext, `${SELECT_URL}**`, 'picker-select-uk');
  await movarPage.goto(SELECT_URL, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });
  // Guard the "URL typo → 404 → nothing hidden → passes for the wrong reason"
  // mode every sibling spec guards.
  expect(route.hits).toBeGreaterThanOrEqual(1);
  const state = await readMovarDomState(movarPage);
  expect(state.hiddenLinkCount).toBe(1);
}

test('the blocked option is disabled in place, not removed', async ({
  movarContext,
  movarPage,
}) => {
  await openFixture(movarContext, movarPage);

  // `disabled` rather than `hidden` is what takes the language out of reach:
  // unselectable by pointer and keyboard, and skipped by type-ahead — while
  // the option keeps its slot, so `options.length`, every `options[i]` index
  // and `selectedIndex` a site computes are all unchanged.
  expect(await readOptions(movarPage)).toEqual([
    {
      value: '/ru/',
      text: NEUTRAL_LABEL,
      disabled: true,
      hidden: false,
      movarHidden: 'not-in-priority',
    },
    { value: '/', text: 'Українська', disabled: false, hidden: false, movarHidden: null },
    { value: '/en/', text: 'English', disabled: false, hidden: false, movarHidden: null },
  ]);
});

test('Movar adds nothing to the page', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // The badge was a real element on document.body. The assertion that it is
  // gone is a count of everything Movar could have added anywhere.
  await expect(movarPage.locator('[data-movar-curtain]')).toHaveCount(0);
  await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(0);
  const state = await readMovarDomState(movarPage);
  expect(state.curtainCount).toBe(0);
  // And the control's own siblings are untouched, so `select + button` rules,
  // :last-child and nth-child keep working.
  const siblings = await movarPage.evaluate(
    () => document.querySelector('#lang-select')!.parentElement!.children.length,
  );
  expect(siblings).toBe(2); // the <label> and the <select>, nothing added
});

test('the blocked option cannot be selected', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // The contract in its most literal form. `selectOption` on a disabled option
  // cannot succeed, so the control must still be on its original value.
  await expect(
    movarPage.locator('#lang-select').selectOption('/ru/', { timeout: 2_000 }),
  ).rejects.toThrow();
  await expect(movarPage.locator('#lang-select')).toHaveValue('/');
});

test('the surviving options are still selectable', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // The other half of the contract: taking one option away must not make the
  // control itself harder to use.
  await movarPage.locator('#lang-select').selectOption('/en/');
  await expect(movarPage.locator('#lang-select')).toHaveValue('/en/');
});

test('the popup still learns which language went', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // buildHiddenSummary re-classifies every `[data-movar-hidden]` element off
  // the DOM, and that summary is now this surface's ONLY way back — the badge
  // carried an in-place restore, the option cannot. The relabel must therefore
  // not cost the popup the language name: this fixture's options carry
  // `hreflang`, so classification is attribute-driven and survives the swap.
  const classified = await movarPage.evaluate(() =>
    [...document.querySelectorAll<HTMLOptionElement>('[data-movar-hidden]')].map((o) => ({
      hreflang: o.getAttribute('hreflang'),
      reason: o.getAttribute('data-movar-hidden'),
    })),
  );
  expect(classified).toEqual([{ hreflang: 'ru', reason: 'not-in-priority' }]);
});

test('hide mode removes the option outright, with no mark', async ({
  movarContext,
  movarPage,
  setMovarSettings,
}) => {
  // The layout's other half: a mark is only owed where curtain mode is on. In
  // hide mode the option just goes, exactly as a list row does.
  await setMovarSettings({ contentModification: true, concealMode: 'hide' });
  await openFixture(movarContext, movarPage);

  const options = await readOptions(movarPage);
  expect(options[0]).toEqual({
    value: '/ru/',
    text: 'Русский',
    disabled: false,
    hidden: true,
    movarHidden: 'not-in-priority',
  });
});
