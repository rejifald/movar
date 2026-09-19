/**
 * Badge geometry — the floating mark beside a `<select>` Movar cannot mark
 * inside.
 *
 * The badge is positioned from its control's rect, by hand, in viewport
 * coordinates, and it changes width while the control is hovered. Every
 * interesting failure is therefore a measurement: it is on screen, it is beside
 * the control, it stays there while the page moves. None of that is visible to
 * a DOM-shape assertion, and none of it reproduces on the sibling
 * `picker-select-ru` fixture, whose centred column leaves ~800px of free space
 * after the control. This spec uses a control flush against the RIGHT viewport
 * edge — the usual placement for a language picker — and reads real boxes out
 * of a real Chromium layout.
 *
 * Offline contract as elsewhere in this suite: the fixture is served via
 * `context.route` and the REAL content script runs against it — the picker
 * filter, the badge, and its tooltip are all the shipped code, so a stale build
 * fails here rather than passing on source that was never bundled.
 */
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { waitForMovarSettled } from '../fixtures/movar-state';

const BADGE_URL = 'https://mocked-picker-badge.example.test/';

/** The fixture is measured at this size: the control lands at x=503-592, so
 *  there are 8px after it and 503 before it. Narrow enough that the hovered
 *  badge (~98px) cannot fit on the trailing side, wide enough that it fits
 *  comfortably on the leading one. */
const VIEWPORT = { width: 600, height: 400 };

const BADGE = '[data-movar-kind="picker-badge"]';

interface Geometry {
  control: { left: number; right: number; top: number };
  badge: { left: number; right: number; top: number; width: number };
  /** The animated `.chip__label` inside the shadow root — the part that is off
   *  screen when the badge overflows, and so the part the visitor loses. */
  label: { left: number; right: number; width: number };
  viewportWidth: number;
}

/** Read both boxes in one round trip, in viewport coordinates. Deliberately
 *  `page.evaluate` and never `locator.boundingBox()`: the badge's whole job is
 *  to track the page, and a helper that scrolls the target into view first
 *  would hide the defect it is here to measure. */
async function readGeometry(page: Parameters<typeof waitForMovarSettled>[0]): Promise<Geometry> {
  return page.evaluate(() => {
    const control = document.querySelector<HTMLElement>('#lang-select')!;
    const host = document.querySelector<HTMLElement>('[data-movar-kind="picker-badge"]')!;
    const label = host.shadowRoot!.querySelector<HTMLElement>('.chip__label')!;
    const c = control.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    return {
      control: { left: c.left, right: c.right, top: c.top },
      badge: { left: b.left, right: b.right, top: b.top, width: b.width },
      label: { left: l.left, right: l.right, width: l.width },
      viewportWidth: window.innerWidth,
    };
  });
}

/** How many pixels of the control the badge covers. <= 0 means "beside it",
 *  which is the whole contract; a positive number is the defect, and its size
 *  is the first thing worth knowing about the failure. */
function overlapPx(g: Geometry): number {
  return Math.min(g.badge.right, g.control.right) - Math.max(g.badge.left, g.control.left);
}

async function openFixture(
  movarContext: Parameters<typeof mockSite>[0],
  movarPage: Parameters<typeof waitForMovarSettled>[0],
): Promise<void> {
  await movarPage.setViewportSize(VIEWPORT);
  const route = await mockSite(movarContext, `${BADGE_URL}**`, 'picker-badge-edge-ru');
  await movarPage.goto(BADGE_URL, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });
  // Guard the "URL typo → 404 → nothing hidden → passes for the wrong reason"
  // failure mode the sibling specs guard.
  expect(route.hits).toBeGreaterThanOrEqual(1);
  await expect(movarPage.locator(BADGE)).toHaveCount(1);
}

/** Hover the CONTROL — the badge is pointer-events:none and cannot feel a hover
 *  of its own — and wait for `.chip__label` to finish animating out. */
async function hoverControl(movarPage: Parameters<typeof readGeometry>[0]): Promise<Geometry> {
  await movarPage.locator('#lang-select').hover();
  await expect(movarPage.locator(BADGE)).toHaveAttribute('data-expanded', 'true');
  await expect.poll(async () => (await readGeometry(movarPage)).label.width).toBeGreaterThan(0);
  // The max-width transition is `duration.slow`; poll until the width stops
  // growing rather than guessing at it.
  let last = -1;
  await expect
    .poll(async () => {
      const width = (await readGeometry(movarPage)).badge.width;
      const settled = width === last;
      last = width;
      return settled;
    })
    .toBe(true);
  return readGeometry(movarPage);
}

test('at rest the badge stands beside the control, not on top of it', async ({
  movarContext,
  movarPage,
}) => {
  await openFixture(movarContext, movarPage);

  // Clamping the badge into the viewport put it at left=572 over a control
  // ending at 592 — 20px of cover, exactly the <select>'s dropdown arrow.
  // pointer-events:none kept that harmless, and it still read as part of the
  // control rather than as a mark Movar had added beside it.
  const g = await readGeometry(movarPage);
  expect(g.badge.width).toBeGreaterThan(0);
  expect(overlapPx(g)).toBeLessThanOrEqual(0);
});

test('hovered, the badge and its label stay inside the viewport', async ({
  movarContext,
  movarPage,
}) => {
  await openFixture(movarContext, movarPage);
  const rest = await readGeometry(movarPage);

  const g = await hoverControl(movarPage);

  // The label is the point of the expansion, so it is what has to be on
  // screen: measured before the fix it grew from 24px to 98px in place, ending
  // 71px past the viewport and the label 66px past it — "Movar: hidden"
  // rendered as "M".
  expect(g.badge.width).toBeGreaterThan(rest.badge.width);
  expect(g.badge.right).toBeLessThanOrEqual(g.viewportWidth);
  expect(g.label.right).toBeLessThanOrEqual(g.viewportWidth);
  expect(g.label.left).toBeGreaterThanOrEqual(0);
  // Growing to its label must not grow it over its control either.
  expect(overlapPx(g)).toBeLessThanOrEqual(0);
});

test('a reposition while hovered survives the collapse', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);
  const rest = await readGeometry(movarPage);

  await hoverControl(movarPage);
  // Any reposition landing while the badge is wide is enough; a resize is how
  // it was first measured. Width is unchanged so the placement inputs are the
  // same — only the badge's own width differs from the resting pass.
  await movarPage.setViewportSize({ ...VIEWPORT, height: 380 });
  await movarPage.mouse.move(0, 0);
  await expect(movarPage.locator(BADGE)).not.toHaveAttribute('data-expanded', 'true');
  await expect.poll(async () => (await readGeometry(movarPage)).badge.width).toBe(rest.badge.width);

  // Nothing repositions on collapse, so a placement computed from the expanded
  // width stays: measured at left=318 with a 24px badge, 94px to the LEFT of
  // the control's right edge and floating over its text.
  const g = await readGeometry(movarPage);
  expect(Math.round(g.badge.left)).toBe(Math.round(rest.badge.left));
  expect(overlapPx(g)).toBeLessThanOrEqual(0);
});

test('the badge follows a control that a late banner pushes down', async ({
  movarContext,
  movarPage,
}) => {
  await openFixture(movarContext, movarPage);
  const before = await readGeometry(movarPage);
  const drift = Math.round(before.badge.top - before.control.top);

  // A banner slot filling in above the control. Scroll and resize do not fire
  // for it, and a ResizeObserver on the control sees no size change — the
  // control only moves.
  await movarPage.evaluate(() => {
    document.querySelector<HTMLElement>('#promo')!.style.height = '120px';
  });

  // The premise, asserted rather than assumed: the control really did move.
  await expect
    .poll(async () => Math.round((await readGeometry(movarPage)).control.top - before.control.top))
    .toBe(120);
  // Measured before the fix: the badge stayed put, i.e. a -120 offset that
  // only healed on the visitor's next scroll.
  await expect
    .poll(
      async () => {
        const g = await readGeometry(movarPage);
        return Math.round(g.badge.top - g.control.top);
      },
      { timeout: 3_000 },
    )
    .toBe(drift);
});

test('scroll tracking still holds', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);
  const rest = await readGeometry(movarPage);
  const drift = Math.round(rest.badge.top - rest.control.top);

  // Existing, working behaviour — the capture-phase + passive + rAF path. The
  // placement rewrite must not regress it, in either direction of travel.
  for (const y of [600, 0]) {
    await movarPage.evaluate((to) => {
      window.scrollTo(0, to);
    }, y);
    await expect
      .poll(async () => {
        const g = await readGeometry(movarPage);
        return Math.round(g.badge.top - g.control.top);
      })
      .toBe(drift);
  }
});

test('an SPA re-render leaves no tooltip host behind', async ({ movarContext, movarPage }) => {
  await openFixture(movarContext, movarPage);
  await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(1);

  // The badge and its tooltip are two hosts for one surface. Evicting the dead
  // badge by removing the node — rather than through the curtain's own detach —
  // tore down half of it: measured across five re-renders, badge hosts stayed
  // at 1 while `[data-movar-tooltip]` hosts went 1 → 6.
  for (let i = 0; i < 5; i++) {
    await movarPage.evaluate((badge) => {
      // Tag the outgoing badge so the wait below is for the NEW one. Without
      // it the count is already 1 the instant the control is replaced and the
      // loop laps the content script, which then sees one batch of mutations
      // and re-renders once — five clones, one leak.
      document.querySelector(badge)?.setAttribute('data-spec-generation', 'previous');
      const control = document.querySelector<HTMLElement>('#lang-select')!;
      control.replaceWith(control.cloneNode(true));
    }, BADGE);
    await expect(movarPage.locator(`${BADGE}:not([data-spec-generation])`)).toHaveCount(1);
  }

  await expect(movarPage.locator(BADGE)).toHaveCount(1);
  await expect(movarPage.locator('[data-movar-tooltip]')).toHaveCount(1);
});
