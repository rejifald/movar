/**
 * List-shaped picker behaviour — the bigfive-test.com report.
 *
 * The survivor tooltip attaches to EVERY surviving classified entry. On a
 * header strip that is two or three hover targets and nobody notices. On
 * bigfive-test.com's language `<Select>` — 42 `role="option"` rows in a
 * dropdown, nine of them languages Movar classifies — it was eight hover
 * popups scattered down the list the visitor was reading, each opening over
 * its neighbours at a z-index above the site's own popover. Choosing any other
 * language meant dodging them.
 *
 * These are DOM-behaviour assertions, not pixel baselines: what matters is
 * which surfaces exist and where, and that holds on any platform, so the spec
 * runs outside the pinned-container baseline workflow.
 *
 * Offline contract as elsewhere in this suite: the fixture is served via
 * `context.route` and the REAL content script runs against it — the picker
 * filter, the layout verdict, and the curtain are all the shipped code.
 */
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

const PICKER_URL = 'https://mocked-picker-listbox.example.test/';

/** Rows whose language Movar classifies: de, en, fr, pl, ru, es, uk. Thai and
 *  Albanian are outside its roster and stay untouched. */
const CLASSIFIED_ROWS = 7;

async function openFixture(
  movarContext: Parameters<typeof mockSite>[0],
  movarPage: Parameters<typeof waitForMovarSettled>[0],
): Promise<void> {
  await movarPage.setViewportSize({ width: 460, height: 420 });
  const route = await mockSite(movarContext, `${PICKER_URL}**`, 'picker-listbox-ru');
  await movarPage.goto(PICKER_URL, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });
  // Guard the "URL typo → 404 → nothing hidden → passes for the wrong reason"
  // failure mode the sibling specs guard.
  expect(route.hits).toBeGreaterThanOrEqual(1);
}

test('a list picker gets no survivor tooltips at all', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  const state = await readMovarDomState(movarPage);
  expect(state.hiddenLinkCount).toBe(1);
  // The regression this spec exists for: six survivors used to mean six
  // tooltips seeded through the open list.
  await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(0);
});

test('the hidden row carries a chip in its own slot', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  const state = await readMovarDomState(movarPage);
  expect(state.pickerEntryCurtainCount).toBe(1);
  expect(state.pickerContainerCurtainCount).toBe(0);

  // The chip stands exactly where the Russian row was — its immediately
  // preceding sibling — rather than floating anywhere over the list.
  const placement = await movarPage.evaluate(() => {
    const row = document.querySelector<HTMLElement>('li[value="ru"]')!;
    const host = row.previousElementSibling as HTMLElement | null;
    return {
      rowHidden: getComputedStyle(row).display,
      hostKind: host?.dataset['movarKind'] ?? null,
      hostInsideList: host?.closest('ul#language-listbox') !== null,
    };
  });
  expect(placement).toEqual({
    rowHidden: 'none',
    hostKind: 'picker-entry',
    hostInsideList: true,
  });
});

test('the chip reads as Movar, not as one more language to pick', async ({
  movarContext,
  movarPage,
}) => {
  await openFixture(movarContext, movarPage);

  const host = movarPage.locator('[data-movar-kind="picker-entry"]');
  // Visible row text names Movar and the state. Naming the language here — in a
  // list OF language names — reads as a selectable option, and clicking it
  // restores the entry rather than switching to it.
  await expect(host.locator('.chip__label')).toHaveText('Movar: hidden');
  // Which language it stands for is still one hover (or one screen reader)
  // away, on the host's own title and the chip's aria-label.
  await expect(host).toHaveAttribute('title', /русск/i);
  await expect(host.locator('button.chip')).toHaveAttribute('aria-label', /русск/i);
});

test('the curtain keeps the row at its original size', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // Replace mode takes the hidden row's box away with it, so without a measured
  // floor the curtain falls back to its own content height and the row collapses
  // to roughly half its neighbours, breaking the list's rhythm.
  const sizes = await movarPage.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('li[role="option"]')].filter(
      (r) => getComputedStyle(r).display !== 'none',
    );
    const host = document.querySelector<HTMLElement>('[data-movar-kind="picker-entry"]')!;
    return {
      rowHeights: [...new Set(rows.map((r) => r.offsetHeight))],
      curtainHeight: host.offsetHeight,
      // Full width of the slot, not a short mark with the rest left blank.
      rowWidth: rows[0]!.offsetWidth,
      curtainWidth: host.offsetWidth,
    };
  });
  // The fixture's rows are uniform, so there is one height to match.
  expect(sizes.rowHeights).toHaveLength(1);
  expect(sizes.curtainHeight).toBe(sizes.rowHeights[0]);
  expect(sizes.curtainWidth).toBe(sizes.rowWidth);
});

test('every other row stays visible and hit-testable', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // The user's complaint in its most literal form: can you still reach the
  // other languages? Hit-test each surviving row's centre and confirm the row
  // itself is what the pointer would land on — not an overlay sitting on top.
  const reachable = await movarPage.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('li[role="option"]')].filter(
      (li) => li.getAttribute('value') !== 'ru',
    );
    return rows.map((row) => {
      const box = row.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { value: row.getAttribute('value'), reached: row.contains(hit) };
    });
  });
  expect(reachable).toHaveLength(CLASSIFIED_ROWS + 1);
  expect(reachable.filter((r) => !r.reached)).toEqual([]);
});

test('hide mode removes the row outright, with no chip', async ({
  movarContext,
  movarPage,
  setMovarSettings,
}) => {
  // The list shape's other half: a curtain is only owed where curtain mode is
  // on. In hide mode the row just goes, and the curtain UI chunk never loads.
  await setMovarSettings({ contentModification: true, concealMode: 'hide' });
  await openFixture(movarContext, movarPage);

  const state = await readMovarDomState(movarPage);
  expect(state.hiddenLinkCount).toBe(1);
  expect(state.pickerEntryCurtainCount).toBe(0);
  await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(0);
  await expect(movarPage.locator('li[value="ru"]')).toBeHidden();
});

test('clicking the chip puts the hidden row back', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);

  // The chip IS the button (chip skin), inside its shadow root.
  await movarPage.locator('[data-movar-kind="picker-entry"]').locator('button.chip').click();

  await expect(movarPage.locator('[data-movar-kind="picker-entry"]')).toHaveCount(0);
  const restored = await movarPage.evaluate(() => {
    const row = document.querySelector<HTMLElement>('li[value="ru"]')!;
    return {
      display: getComputedStyle(row).display,
      stillMarked: row.hasAttribute('data-movar-hidden'),
    };
  });
  expect(restored.stillMarked).toBe(false);
  expect(restored.display).not.toBe('none');
});
