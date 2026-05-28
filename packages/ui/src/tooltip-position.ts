/**
 * Tooltip positioning math — runtime-agnostic.
 *
 * Used by both the React `Tooltip` (in this package) and the vanilla
 * `attachTooltip` primitive (in apps/extension/src/lib). They diverge in
 * how they observe layout changes (`useLayoutEffect` + `setState` vs.
 * direct `style.top/left` writes), but the position math itself is
 * identical, so it lives in one place.
 *
 * Pure function: no DOM mutation, no React, no globals beyond
 * `getBoundingClientRect` reads. Safe to import from any runtime.
 *
 * Exposed via the `./tooltip-position` sub-path export in
 * `@movar/ui/package.json` so the extension's content-script bundle can
 * import it without pulling the React index and its `react-dom` peer.
 */

export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipPosition {
  /** Viewport-relative top in `position: fixed` coordinates. */
  top: number;
  /** Viewport-relative left in `position: fixed` coordinates. */
  left: number;
  /** Horizontal offset of the arrow from the tooltip's left edge, pinning
   *  the arrow to the anchor's centre even when the tooltip shifts to
   *  stay inside the viewport. */
  arrowLeft: number;
  /** Final placement after collision-flip. Equals the preferred placement
   *  when both sides fit; flips when the preferred side is clipped. */
  placement: TooltipPlacement;
}

export interface TooltipPositionViewport {
  width: number;
  height: number;
}

export interface ComputeTooltipPositionOptions {
  /** `getBoundingClientRect()`-style rect for the anchor element. */
  anchor: DOMRectReadOnly;
  /** `getBoundingClientRect()`-style rect for the tooltip surface. The
   *  width and height drive collision math; the position is overwritten. */
  tooltip: DOMRectReadOnly;
  /** Preferred placement; auto-flips on viewport collision. */
  preferred: TooltipPlacement;
  /** Viewport size. Default reads `globalThis.innerWidth/innerHeight`;
   *  pass explicit values for SSR-friendly callers and tests. */
  viewport?: TooltipPositionViewport;
  /** Distance between anchor edge and tooltip surface. Default 8px —
   *  clears the arrow plus a touch of breathing room. */
  offset?: number;
  /** Minimum margin from viewport edges. Default 8px. */
  viewportPadding?: number;
}

const DEFAULT_OFFSET_PX = 8;
const DEFAULT_VIEWPORT_PADDING_PX = 8;

/**
 * Compute viewport-relative position for a tooltip anchored to `anchor`.
 *
 * Vertical: places the tooltip on the preferred side; if that side has
 * less than `tooltip.height + offset + viewportPadding` of room, flips to
 * the opposite side. If neither side fits, sticks with the preferred —
 * better to overflow than to violate the caller's intent silently.
 *
 * Horizontal: centres on the anchor, then clamps to keep the tooltip's
 * box inside `[viewportPadding, viewport.width - viewportPadding]`. The
 * arrow's `arrowLeft` is the anchor's horizontal centre minus the
 * tooltip's clamped left, so the arrow points at the anchor regardless
 * of how much the tooltip shifted.
 */
// Vertical flip + horizontal clamp = 8 cyclomatic. Each branch handles a
// distinct viewport-collision case; splitting wouldn't reduce the case
// count, just shuffle which function owns which branch.
// fallow-ignore-next-line complexity
export function computeTooltipPosition(opts: ComputeTooltipPositionOptions): TooltipPosition {
  const offset = opts.offset ?? DEFAULT_OFFSET_PX;
  const pad = opts.viewportPadding ?? DEFAULT_VIEWPORT_PADDING_PX;
  const vw = opts.viewport?.width ?? globalThis.innerWidth;
  const vh = opts.viewport?.height ?? globalThis.innerHeight;
  const { anchor: a, tooltip: t, preferred } = opts;

  // Vertical placement — flip when the preferred side has no room.
  const fitsTop = a.top - t.height - offset >= pad;
  const fitsBottom = a.bottom + t.height + offset <= vh - pad;
  let placement: TooltipPlacement = preferred;
  if (preferred === 'top' && !fitsTop && fitsBottom) placement = 'bottom';
  else if (preferred === 'bottom' && !fitsBottom && fitsTop) placement = 'top';

  const top = placement === 'top' ? a.top - t.height - offset : a.bottom + offset;

  // Horizontal placement — centre on anchor, then shift to stay inside
  // the viewport. Arrow stays pinned to the anchor's centre via
  // `arrowLeft`.
  const anchorCentreX = a.left + a.width / 2;
  const idealLeft = anchorCentreX - t.width / 2;
  const minLeft = pad;
  const maxLeft = vw - t.width - pad;
  const left = Math.max(minLeft, Math.min(idealLeft, maxLeft));
  const arrowLeft = anchorCentreX - left;

  return { top, left, arrowLeft, placement };
}
