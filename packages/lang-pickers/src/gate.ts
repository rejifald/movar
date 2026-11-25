/**
 * Blocking language-gate detection.
 *
 * A *gate* is a language picker rendered inside an overlay that holds the page
 * hostage until the visitor chooses one — the «Оберіть мову / Выберите язык»
 * interstitial pattern. Structurally it is a different animal from an ordinary
 * switcher in a header or footer: it covers the viewport, it is the only thing
 * the visitor can interact with, and satisfying it usually persists a cookie so
 * it never asks again.
 *
 * This module answers exactly one question — "is this picker inside such an
 * overlay?" — and answers it conservatively, because the caller acts on a `true`
 * by clicking something on the visitor's behalf. Everything about *what to do*
 * with the answer (whether to click, which option, and the guards around that)
 * lives in `apps/extension/src/lib/language-gate.ts`, keeping this a pure DOM
 * read inside the model package's no-overlay/no-settings contract.
 */
import type { Picker } from './types';

/** The box a candidate overlay's geometry is measured against. */
export interface GateViewport {
  width: number;
  height: number;
}

/**
 * Fraction of EACH viewport axis an overlay must span before it counts as
 * page-blocking. Deliberately high, and deliberately applied to both axes: a
 * cookie strip (full width, short) and a sticky header (full width, shorter)
 * would both pass a width-only or an area-only test, and both routinely carry
 * language switchers. Failing them on height is the entire point.
 */
export const MIN_GATE_COVERAGE = 0.75;

/** Ancestors walked up from the picker container before giving up. Gate markup
 *  nests the buttons in a panel inside the backdrop, and it is the backdrop that
 *  carries the blocking geometry — a handful of levels covers the shapes seen in
 *  the wild without walking to `<html>` (where a false positive would make every
 *  picker on a full-height fixed-position page look like a gate). */
const MAX_GATE_DEPTH = 8;

function currentViewport(): GateViewport {
  return { width: globalThis.innerWidth, height: globalThis.innerHeight };
}

function isVisible(style: CSSStyleDeclaration): boolean {
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  const opacity = Number.parseFloat(style.opacity);
  // An unset opacity parses to NaN — that's "the site never touched it", i.e.
  // fully opaque, not transparent.
  return Number.isNaN(opacity) || opacity > 0;
}

/** How much of each viewport axis the element's box actually OVERLAPS —
 *  clamped to the viewport, so a box parked outside it contributes nothing.
 *  Size alone is not blocking: a closed off-canvas drawer
 *  (`position:fixed;width:100%;height:100%` + `transform:translateX(-100%)`, or
 *  `left:-100vw`) is a full-viewport-sized box that covers nothing, and mobile
 *  nav drawers routinely carry the language switcher. */
function overlap(start: number, end: number, extent: number): number {
  return Math.min(end, extent) - Math.max(start, 0);
}

function coversViewport(el: HTMLElement, viewport: GateViewport): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return false;
  const rect = el.getBoundingClientRect();
  return (
    overlap(rect.left, rect.right, viewport.width) >= viewport.width * MIN_GATE_COVERAGE &&
    overlap(rect.top, rect.bottom, viewport.height) >= viewport.height * MIN_GATE_COVERAGE
  );
}

/** True when `el` is a native modal dialog (`showModal()`). Those block the page
 *  by definition — the top layer makes everything behind them inert — so no
 *  geometry test is meaningful for them. An `open` but non-modal `<dialog>`
 *  (`show()`) is just a popover and must NOT qualify, which is why this tests
 *  `:modal` rather than the `open` property. jsdom doesn't implement `:modal`
 *  and throws on it, so unit tests only ever exercise the fixed-overlay path
 *  below; this branch is covered in the e2e suite. */
function isModalDialog(el: HTMLElement): boolean {
  if (!(el instanceof HTMLDialogElement)) return false;
  try {
    return el.matches(':modal');
  } catch {
    return false;
  }
}

function isBlockingOverlay(el: HTMLElement, viewport: GateViewport): boolean {
  const style = getComputedStyle(el);
  if (!isVisible(style)) return false;
  if (isModalDialog(el)) return true;
  // `fixed` only — an `absolute` box that happens to cover the viewport is far
  // more often a page-layout root than a modal, and a false positive here costs
  // a click the visitor never asked for.
  if (style.position !== 'fixed') return false;
  return coversViewport(el, viewport);
}

/** The blocking overlay among the container and its nearest ancestors. */
function findEnclosingOverlay(container: HTMLElement, viewport: GateViewport): HTMLElement | null {
  let el: HTMLElement | null = container;
  for (let depth = 0; el !== null && depth <= MAX_GATE_DEPTH; depth++) {
    if (isBlockingOverlay(el, viewport)) return el;
    el = el.parentElement;
  }
  return null;
}

/** True when `backdrop` and `container` meet below `<body>`, within the same
 *  ancestor budget as the enclosing walk — i.e. the backdrop is part of the
 *  picker's own modal markup, not some unrelated body-level overlay that a
 *  high-z header happens to paint above. */
function sharesGateRoot(backdrop: HTMLElement, container: HTMLElement): boolean {
  const { body, documentElement } = container.ownerDocument;
  let el: HTMLElement | null = container.parentElement;
  for (let depth = 0; el !== null && depth <= MAX_GATE_DEPTH; depth++) {
    if (el === body || el === documentElement) return false;
    if (el.contains(backdrop)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * A covering backdrop painted BENEATH the picker that is not one of its
 * ancestors — the "dim layer as the panel's sibling" modal shape
 * (solar-tech.com.ua: a 505px fixed column holding both the panel and a
 * full-viewport `.overlay`). The ancestor walk can't see it: no ancestor covers
 * the viewport.
 *
 * One hit-test at the picker's centre settles both facts that make it a gate:
 * the picker is the topmost thing there (nothing covers it), and further down
 * the same stack sits a visible fixed box covering the viewport. Requiring the
 * two to share a root below `<body>` keeps a sticky header's switcher from
 * reading as a gate when it merely paints above some other modal's backdrop.
 * No hit-testing (jsdom, detached documents) means no answer — fail closed.
 */
function findBackdropBeneath(container: HTMLElement, viewport: GateViewport): HTMLElement | null {
  const stack = hitStackAtCentre(container);
  const [topmost] = stack;
  if (topmost === undefined || !container.contains(topmost)) return null;
  const backdrop = stack.find((el): el is HTMLElement => isForeignOverlay(el, container, viewport));
  return backdrop !== undefined && sharesGateRoot(backdrop, container) ? backdrop : null;
}

/** Paint-order stack (topmost first) at `el`'s centre; empty when the document
 *  can't hit-test or `el` has no box. */
function hitStackAtCentre(el: HTMLElement): Element[] {
  const doc = el.ownerDocument;
  if (typeof doc.elementsFromPoint !== 'function') return [];
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return [];
  return doc.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/** A blocking overlay that is not one of `container`'s own ancestors (those the
 *  enclosing walk already judged). */
function isForeignOverlay(el: Element, container: HTMLElement, viewport: GateViewport): boolean {
  return el instanceof HTMLElement && !el.contains(container) && isBlockingOverlay(el, viewport);
}

/**
 * The overlay element gating the page behind `picker`, or null when the picker
 * is an ordinary in-page switcher. Two shapes qualify: the picker sits INSIDE a
 * blocking overlay (the classified links sit in a panel inside the backdrop, and
 * it is the backdrop that blocks), or the picker paints ABOVE a covering
 * backdrop that belongs to the same modal markup (see `findBackdropBeneath`).
 */
export function findGateOverlay(
  picker: Picker,
  viewport: GateViewport = currentViewport(),
): HTMLElement | null {
  return (
    findEnclosingOverlay(picker.container, viewport) ??
    findBackdropBeneath(picker.container, viewport)
  );
}
