/**
 * Generic overlay primitive — a "curtain" that signals "Movar acted here"
 * over or in place of a target element. Two modes:
 *
 *   cover   — curtain mounted as a child of `target`, fills it via inset:0.
 *             By default also applies a CSS `filter: blur(…)` to the
 *             target's pre-existing children so the underlying content reads
 *             as obscured. The blur is parameterizable (`childFilter` /
 *             `peekFilter`) and can be disabled with an empty string for a
 *             pure overlay. Content peeks through on hover by default. A bare
 *             inline target (no box an inset:0 overlay can fill) is promoted to
 *             inline-block first so cover works on it too, not just block cards.
 *   replace — curtain inserted as a sibling BEFORE `target`, occupying its
 *             flow slot at the curtain's natural size. `target` itself is
 *             hidden via display:none.
 *
 * Two visual skins, picked via `skin`:
 *
 *   pill — the card-shaped default. Icon + title + description + actions
 *          stacked vertically inside a bordered, shadowed surface. Sized
 *          for content-card targets (~260px). Used by cover-mode curtains
 *          over YouTube cards and by any caller that wants the full
 *          explanation surface. Responsive: on a short/small cover target the
 *          pill collapses (via the `movar-cover` size container) to a single
 *          horizontal bar, shedding the description, then the secondary action,
 *          then the title, so it fits instead of overflowing (e.g. Google
 *          "People also ask" rows and inline targets).
 *   chip — a minimal inline marker: `[icon] {label}` on one line, no
 *          border, no background, currentColor text, font-size floored
 *          for icon legibility. The whole chip is a button — clicking it
 *          invokes the first action. Description copy lives in the
 *          aria-label and the host `title` attribute instead of in the
 *          DOM. Used by replace-mode curtains over picker containers,
 *          where the slot is too narrow for a pill.
 *
 * Both skins render inside an isolated shadow root, so site CSS doesn't
 * leak in.
 *
 * Why filter:blur on children instead of backdrop-filter on the overlay:
 * backdrop-filter is fragile when the target's descendants establish their
 * own composited layers / backdrop-roots (YouTube, Google), causing the
 * blur to visually miss sibling subtrees even though the overlay covers
 * them geometrically. Filtering the content directly is immune to that.
 * Trade-off: blur halos extend past each child's box, so cover mode also
 * forces `overflow: hidden` on the target while the filter is active.
 *
 * Side effects on the target are bundled into a per-curtain restore record
 * and reversed on detach(). detachAllCurtains(root?) is the fan-out sweep
 * used by "Show everything on this page" in the popup.
 *
 * A11y posture (v2): cover mode contains the concealed content from both the
 * a11y tree and the focus order. Each of the target's existing children is
 * marked `aria-hidden="true"` AND `inert` (prior state of both snapshotted into
 * the CoverRestore and restored exactly on detach), and the target itself gets
 * pointer-events:none (children inherit; our host overrides with
 * pointer-events:auto). So a keyboard or screen-reader user can no longer Tab
 * into or read blocked-language content behind the curtain until they reveal it.
 * The host (added after the side-effects, never inert) keeps the "Show" action
 * reachable. `aria-hidden` is kept alongside `inert` for engines with only
 * partial `inert` support.
 */

import { EyeOff } from 'lucide';

import {
  applyColorSchemeToAll,
  COLOR_SCHEME_ATTR,
  detachAllBySelector,
} from '@movar/page-mode/apply';
import type { PageMode } from '@movar/page-mode/types';
import { CURTAIN_HOST_ATTR as HOST_ATTR } from './movar-markers';

const ARIA_HIDDEN_ATTR = 'aria-hidden';
const INERT_ATTR = 'inert';
const PRIOR_ARIA_HIDDEN_ATTR = 'data-movar-curtain-prior-aria-hidden';
const PRIOR_INERT_ATTR = 'data-movar-curtain-prior-inert';
const HANDLE_KEY = '__movarCurtainHandle' as const;
const FILTER_VAR = '--movar-curtain-filter';
const DEFAULT_CHILD_FILTER = 'blur(16px) saturate(0.6)';
const DEFAULT_PEEK_FILTER = 'blur(4px) saturate(0.85)';

export type CurtainMode = 'cover' | 'replace';
export type CurtainSkin = 'pill' | 'chip';

export interface ActionContext {
  detach(): void;
  host: HTMLElement;
}

export interface CurtainAction {
  label: string;
  onClick: (ctx: ActionContext) => void;
  variant?: 'primary' | 'ghost';
}

export interface CurtainOptions {
  mode: CurtainMode;
  /** Visual skin — `'pill'` (default, card-sized) or `'chip'` (inline marker
   *  for picker-slot territory). The chip uses the first action as its
   *  click target and drops `description` from the rendered DOM (it goes
   *  to aria-label + host `title` instead). */
  skin?: CurtainSkin;
  /** Leading mark. String is rendered as text (emoji); Node is appended verbatim. */
  icon?: string | Node;
  title: string;
  description?: string;
  actions: CurtainAction[];
  /** Override the curtain's aria-label (defaults to `title`). */
  ariaLabel?: string;
  /** Cover mode only — disable the hover-peek (default true). */
  peek?: boolean;
  /** Cover mode only — CSS filter applied inline to the target's existing
   *  children to obscure the underlying content. Default: a blur. Pass an
   *  empty string to skip filtering — the overlay's translucent background
   *  alone then carries the obscure (useful when the content shouldn't be
   *  filtered, e.g. cross-origin iframes, or when the target is a wrapping
   *  element whose own layout would break under `overflow: hidden`). When
   *  non-empty, the curtain also forces `overflow: hidden` on the target so
   *  the filter halo is clipped at the box edge. */
  childFilter?: string;
  /** Cover mode only — peek-state filter swapped in on hover/focus while
   *  `peek` is enabled. Default: a softer blur. Ignored when `childFilter`
   *  is empty or `peek` is false. */
  peekFilter?: string;
  /** Force the curtain's color scheme to match the host page (light or
   *  dark). When omitted, the curtain falls back to the OS-level
   *  `prefers-color-scheme` media query — fine for pages that follow OS
   *  preference, wrong for sites whose own theme switch disagrees (e.g.
   *  YouTube dark on a light-mode OS). The orchestrator detects the
   *  page's mode via `page-mode/` and passes it through. */
  colorScheme?: PageMode;
}

export interface CurtainHandle {
  detach(): void;
  readonly host: HTMLElement;
}

interface HostWithHandle extends HTMLElement {
  [HANDLE_KEY]?: CurtainHandle;
}

interface CoverChildFilter {
  el: HTMLElement;
  value: string;
  priority: string;
}

interface InlinePropSnapshot {
  value: string;
  priority: string;
}

interface CoverRestore {
  positionWasSet: boolean;
  pointerEventsWasSet: boolean;
  ariaHiddenChildren: HTMLElement[];
  /** Children whose inline `filter` we overrode. Empty when no childFilter
   *  was applied (caller passed an empty string). */
  blurredChildren: CoverChildFilter[];
  /** Snapshot of the target's pre-attach inline `overflow`, captured only
   *  when we forced `overflow: hidden` for halo clipping. `null` when we
   *  didn't touch overflow (no childFilter applied). */
  overflow: InlinePropSnapshot | null;
  /** Snapshot of the target's pre-attach inline `display`, captured only when we
   *  promoted a bare inline target to `inline-block` so the overlay had a box to
   *  fill and clip against. `null` when the target already established a box (the
   *  common case — every block/flex/grid/inline-block card). */
  display: InlinePropSnapshot | null;
  /** Watches `target` for children a site streams in AFTER attach, so they get
   *  the same aria-hidden + inert + blur containment as the initial children.
   *  `null` only transiently while applyCoverSideEffects builds the record;
   *  disconnected by revertCoverSideEffects on detach. */
  observer: MutationObserver | null;
}

interface ReplaceRestore {
  inlineDisplay: string;
  inlineDisplayPriority: string;
}

/** Dark-mode token bundle — applied either by explicit attribute or by
 *  prefers-color-scheme fallback. Kept in a single string so the two
 *  selectors below can't drift. */
const DARK_TOKENS = `
  --movar-bg: rgba(24, 24, 27, 0.88);
  --movar-fg: #e5e7eb;
  --movar-muted: #9ca3af;
  --movar-border: rgba(255, 255, 255, 0.10);
  --movar-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), 0 6px 16px -8px rgba(0, 0, 0, 0.45);
  --movar-backdrop: rgba(15, 23, 42, 0.45);
  --movar-action-hover: rgba(255, 255, 255, 0.06);
  --movar-action-primary-bg: rgba(255, 255, 255, 0.06);
  --movar-action-primary-hover: rgba(255, 255, 255, 0.10);
`;

const STYLES = `
:host {
  /* Neutral palette — the curtain should sit on the page like a quiet note,
     not a status pill. No brand accent: actions and dividers all read in
     grayscale so the curtain doesn't compete with the underlying content
     for attention. Dark mode swaps values, not rules. */
  --movar-bg: rgba(255, 255, 255, 0.94);
  --movar-fg: #1f2937;
  --movar-muted: #6b7280;
  --movar-border: rgba(15, 23, 42, 0.08);
  --movar-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 16px -8px rgba(15, 23, 42, 0.12);
  --movar-radius: 10px;
  --movar-backdrop: rgba(248, 250, 252, 0.55);
  --movar-action-bg: transparent;
  --movar-action-hover: rgba(15, 23, 42, 0.05);
  --movar-action-primary-bg: rgba(15, 23, 42, 0.05);
  --movar-action-primary-hover: rgba(15, 23, 42, 0.09);

  font: 400 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--movar-fg);
  opacity: 0;
  transition: opacity 0.18s ease;
}
/* Explicit attribute wins over media-query fallback, so a site whose own
   theme disagrees with the OS still gets a matching overlay. The orchestrator
   detects page mode via page-mode/ and passes it through; the attribute is
   live-updated by setAllCurtainsColorScheme when the page toggles theme. */
:host([${COLOR_SCHEME_ATTR}="dark"]) {${DARK_TOKENS}}
@media (prefers-color-scheme: dark) {
  :host(:not([${COLOR_SCHEME_ATTR}])) {${DARK_TOKENS}}
}
:host([data-state="ready"]) {
  opacity: 1;
}

:host([data-mode="cover"]) {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  border-radius: inherit;
}
:host([data-mode="cover"]) .curtain {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
  /* The blur lives on the target's children (inline filter set in
     applyCoverSideEffects). This layer just adds a soft neutral wash so
     the card reads against the blur — no vignette, no centerpunch.
     Avoiding backdrop-filter sidesteps stacking-context / backdrop-root
     bugs on sites like YouTube where inner blocks live in their own
     composited layers. */
  background: var(--movar-backdrop);
  border-radius: inherit;
  transition: background 0.18s ease;
  /* Size query container for the pill. .curtain fills the target via inset:0,
     so its box IS the target's box — making it the reference the pill's
     @container rules (below) respond to, so the pill collapses to fit short or
     small targets instead of overflowing them. The name scopes those rules to
     cover curtains: the replace/chip skin establishes no such container, so a
     stray page container can't drive them either. */
  container: movar-cover / size;
}
:host([data-mode="cover"][data-peek="true"]) .curtain:hover,
:host([data-mode="cover"][data-peek="true"]) .curtain:focus-within {
  background: transparent;
}

:host([data-mode="replace"]) {
  display: inline-flex;
  vertical-align: middle;
}
:host([data-mode="replace"]) .curtain {
  display: contents;
}

.pill {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.45em;
  padding: 0.65em 0.8em;
  border-radius: var(--movar-radius);
  background: var(--movar-bg);
  border: 1px solid var(--movar-border);
  box-shadow: var(--movar-shadow);
  max-width: min(260px, 100%);
  box-sizing: border-box;
  min-width: 0;
}
.pill__header {
  display: flex;
  align-items: center;
  gap: 0.45em;
  min-width: 0;
  color: var(--movar-muted);
}
.pill__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--movar-muted);
}
.pill__icon svg,
.pill__icon img {
  width: 100%;
  height: 100%;
  display: block;
}
.pill__title {
  font-size: 0.92em;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--movar-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.pill__description {
  font-size: 0.86em;
  font-weight: 400;
  color: var(--movar-muted);
  line-height: 1.45;
  /* Cap to two lines so cards stay compact on small targets; the title
     carries the headline, the reason just elaborates. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.pill__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3em;
  margin-top: 0.1em;
}
.pill__action {
  font: inherit;
  font-size: 0.85em;
  font-weight: 500;
  color: var(--movar-fg);
  border: 1px solid var(--movar-border);
  background: var(--movar-action-bg);
  padding: 0.3em 0.7em;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.2;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.pill__action--primary {
  background: var(--movar-action-primary-bg);
  font-weight: 600;
}
.pill__action--primary:hover {
  background: var(--movar-action-primary-hover);
}
.pill__action--ghost:hover {
  background: var(--movar-action-hover);
}
.pill__action:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

/* Responsive collapse (cover mode only — keyed on the movar-cover size
   container above). The vertical card is sized for a roomy content card; on a
   target too short to seat it, it would overflow and — since short/inline
   targets don't clip an overlay reliably — pile up on its neighbours. So fold
   the pill into a single horizontal bar and drop the description; then shed the
   secondary action, and finally the title, as the target also narrows. The
   headline + primary Show survive to the smallest sizes. Motivating cases:
   Google People-also-ask rows and small inline targets. */
@container movar-cover (max-height: 104px) {
  .pill {
    flex-direction: row;
    align-items: center;
    gap: 0.5em;
    padding: 0.3em 0.5em;
    max-width: 100%;
  }
  .pill__header {
    flex: 1 1 auto;
  }
  .pill__description {
    display: none;
  }
  .pill__actions {
    margin-top: 0;
    flex: 0 0 auto;
    flex-wrap: nowrap;
  }
}
@container movar-cover (max-height: 104px) and (max-width: 340px) {
  .pill__action--ghost {
    display: none;
  }
}
@container movar-cover (max-height: 104px) and (max-width: 220px) {
  .pill__title {
    display: none;
  }
}

/* Chip skin — minimal inline marker for picker-slot territory. The whole
   chip is a button. No border, no background by default: the Movar mark
   icon carries the "this is the extension" signal, and the label inherits
   currentColor so it reads against whatever palette the host picker had.
   font-size is floored so the icon doesn't collapse below legibility in
   tiny headers. */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.2em 0.4em;
  min-width: 0;
  font: inherit;
  font-size: max(0.8em, 11px);
  line-height: 1.2;
  color: currentColor;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.chip:hover,
.chip:focus-visible {
  background: var(--movar-action-hover);
}
.chip:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
.chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  color: currentColor;
}
.chip__icon svg,
.chip__icon img {
  width: 100%;
  height: 100%;
  display: block;
}
.chip__label {
  /* Single-line truncate. The endonym lives in the host title attribute
     so the full name is recoverable on hover even when clipped. */
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  :host,
  :host([data-mode="cover"]) .curtain,
  .pill__action,
  .chip {
    transition: none;
  }
}
`.trim();

/**
 * Neutral "content hidden" mark — a slashed eye. Returned as a fresh SVG
 * node each call so callers can mount it as an `icon`. Stroke uses
 * currentColor so it inherits the muted header color in the CSS.
 */
export function defaultHiddenIcon(): SVGElement {
  // lucide `eye-off`, built from the icon's node data (no innerHTML, so the
  // content script stays CSP-safe). stroke-width 1.75 keeps the muted,
  // slightly thinner look the curtain header uses; colour rides currentColor.
  const NS = 'http://www.w3.org/2000/svg' as const;
  const svg = document.createElementNS(NS, 'svg');
  const svgAttrs: Record<string, string> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [name, value] of Object.entries(svgAttrs)) svg.setAttribute(name, value);
  for (const [tag, attrs] of EyeOff) {
    const child = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) child.setAttribute(name, String(value));
    svg.appendChild(child);
  }
  return svg;
}

function buildPill(opts: CurtainOptions, ctx: ActionContext): HTMLElement {
  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-label', opts.ariaLabel ?? opts.title);

  // Header row: icon + title. Lives in its own row so the description and
  // actions stack below in the vertical card layout. Icon is optional —
  // callers that want the default mark pass `icon: defaultHiddenIcon()`.
  const header = document.createElement('div');
  header.className = 'pill__header';

  if (opts.icon !== undefined) {
    const iconEl = document.createElement('span');
    iconEl.className = 'pill__icon';
    iconEl.setAttribute(ARIA_HIDDEN_ATTR, 'true');
    if (typeof opts.icon === 'string') {
      iconEl.textContent = opts.icon;
    } else {
      iconEl.append(opts.icon);
    }
    header.append(iconEl);
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'pill__title';
  titleEl.textContent = opts.title;
  header.append(titleEl);
  pill.append(header);

  if (opts.description != null && opts.description !== '') {
    const descEl = document.createElement('div');
    descEl.className = 'pill__description';
    descEl.textContent = opts.description;
    pill.append(descEl);
  }

  if (opts.actions.length > 0) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'pill__actions';
    for (const action of opts.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pill__action pill__action--${action.variant ?? 'ghost'}`;
      btn.textContent = action.label;
      btn.addEventListener('click', (e) => {
        // Stop the click from bubbling into the underlying target (cover mode)
        // or the curtain's parent (replace mode). Sites often have delegated
        // click handlers on container elements that we don't want to trigger.
        e.stopPropagation();
        e.preventDefault();
        action.onClick(ctx);
      });
      actionsEl.append(btn);
    }
    pill.append(actionsEl);
  }

  return pill;
}

function buildChip(opts: CurtainOptions, ctx: ActionContext): HTMLElement {
  // The chip IS a button — clicking the whole surface invokes the first
  // action (typically "restore"). Replace-mode picker curtains only ship
  // one action, so this is the natural mapping; if a caller passes zero
  // actions, the chip degrades to a non-interactive `<span>` marker.
  const primary = opts.actions[0];
  const tag = primary ? 'button' : 'span';
  const chip = document.createElement(tag);
  chip.className = 'chip';
  if (primary) {
    (chip as HTMLButtonElement).type = 'button';
    chip.addEventListener('click', (e) => {
      // Sites often have delegated click handlers on header containers; the
      // chip sits sibling-before the picker, but the parent wrapper still
      // hears bubbled clicks. Same defence as the pill action.
      e.stopPropagation();
      e.preventDefault();
      primary.onClick(ctx);
    });
  }
  // aria-label carries the explanation copy for screen readers; sighted
  // hover gets the same via the host `title` attribute (set in
  // attachCurtain so the tooltip lives on the host node visible to the
  // browser, not buried inside the shadow root).
  chip.setAttribute('aria-label', opts.ariaLabel ?? opts.description ?? opts.title);

  if (opts.icon !== undefined) {
    const iconEl = document.createElement('span');
    iconEl.className = 'chip__icon';
    iconEl.setAttribute(ARIA_HIDDEN_ATTR, 'true');
    if (typeof opts.icon === 'string') {
      iconEl.textContent = opts.icon;
    } else {
      iconEl.append(opts.icon);
    }
    chip.append(iconEl);
  }

  // Empty title means "sigil-only": icon alone, no label. The aria-label
  // still carries the explanation. Skip the label node entirely so the
  // chip collapses to just the icon's natural width.
  if (opts.title) {
    const labelEl = document.createElement('span');
    labelEl.className = 'chip__label';
    labelEl.textContent = opts.title;
    chip.append(labelEl);
  }

  return chip;
}

/** Mark one direct child aria-hidden AND inert, snapshotting the prior state of
 *  both so detach restores exactly. `inert` removes the subtree from the a11y
 *  tree and the focus order; the explicit `aria-hidden` is kept alongside it for
 *  engines with only partial `inert` support. See "A11y posture" in the header. */
function markChildContained(child: HTMLElement, ariaHiddenChildren: HTMLElement[]): void {
  const prior = child.getAttribute(ARIA_HIDDEN_ATTR);
  child.setAttribute(PRIOR_ARIA_HIDDEN_ATTR, prior ?? '');
  child.setAttribute(ARIA_HIDDEN_ATTR, 'true');
  child.setAttribute(PRIOR_INERT_ATTR, child.hasAttribute(INERT_ATTR) ? 'true' : '');
  child.setAttribute(INERT_ATTR, '');
  ariaHiddenChildren.push(child);
}

/** Override one child's inline `filter` with the curtain blur, snapshotting the
 *  prior value. Applied via var(--movar-curtain-filter, <default>) so the
 *  hover-peek handler in mountCoverCurtain can swap the var on the target and
 *  re-filter every child in one write — no re-walking the subtree per mouse move. */
function blurChild(
  child: HTMLElement,
  childFilter: string,
  blurredChildren: CoverChildFilter[],
): void {
  const value = child.style.getPropertyValue('filter');
  const priority = child.style.getPropertyPriority('filter');
  blurredChildren.push({ el: child, value, priority });
  child.style.setProperty('filter', `var(${FILTER_VAR}, ${childFilter})`, 'important');
}

/** Contain one direct child of a cover target — the unit of work shared by the
 *  initial snapshot pass and the MutationObserver that catches children a site
 *  streams in AFTER attach. (Google's AI Overview is the motivating case: it
 *  declares its block early, then fills in the header, "show more" and the ⋮
 *  overflow menu once the answer has generated. Without this those late nodes
 *  escape the blur + inert and sit crisp and clickable ON TOP of the overlay,
 *  and the site's own controls occlude the curtain's "Show" button.) Idempotent
 *  via the prior-state marker, so a repeat observer callback can't clobber the
 *  snapshot. The curtain's own host is never passed here (see containAddedNode),
 *  so the "Show" action stays reachable. */
function containCoverChild(child: HTMLElement, childFilter: string, restore: CoverRestore): void {
  if (child.hasAttribute(PRIOR_ARIA_HIDDEN_ATTR)) return;
  markChildContained(child, restore.ariaHiddenChildren);
  if (childFilter) blurChild(child, childFilter, restore.blurredChildren);
}

/** Contain a node the observer reported as added to the target: skip non-element
 *  nodes (whitespace text between children) and the curtain's own host, which
 *  must stay interactive and unblurred. */
function containAddedNode(node: Node, childFilter: string, restore: CoverRestore): void {
  if (!(node instanceof HTMLElement)) return;
  if (node.hasAttribute(HOST_ATTR)) return;
  containCoverChild(node, childFilter, restore);
}

/** Watch `target` for children added after the curtain attached and contain each
 *  the same way the initial pass did — the guard against streamed-in content
 *  (see containCoverChild) escaping concealment. Direct children only: `inert`
 *  and the blur both inherit down the subtree, so a deep insert under an
 *  already-contained child needs no action, and re-filtering it would compound
 *  the blur. Disconnected by revertCoverSideEffects on detach. */
function observeCoverChildren(
  target: HTMLElement,
  childFilter: string,
  restore: CoverRestore,
): MutationObserver {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) containAddedNode(node, childFilter, restore);
    }
  });
  observer.observe(target, { childList: true });
  return observer;
}

/** Promote a bare inline target to `inline-block` so the cover overlay has a real
 *  box to fill and clip against, snapshotting the prior inline `display` for exact
 *  revert. An inline element gives an absolutely-positioned child a degenerate
 *  (0-width) containing block AND ignores `overflow`, so an inset:0 overlay can
 *  neither fill nor clip it — the pill escapes its target and overlaps its
 *  neighbours. inline-block gives the element a box sized to its own content while
 *  keeping it inline in the surrounding flow. No-op for anything that already
 *  establishes a box (block/flex/grid/inline-block/…). `!important` defeats a
 *  site rule pinning `display: inline`. */
function promoteInlineTarget(target: HTMLElement, restore: CoverRestore): void {
  if (getComputedStyle(target).display !== 'inline') return;
  restore.display = {
    value: target.style.getPropertyValue('display'),
    priority: target.style.getPropertyPriority('display'),
  };
  target.style.setProperty('display', 'inline-block', 'important');
}

function applyCoverSideEffects(target: HTMLElement, childFilter: string): CoverRestore {
  const restore: CoverRestore = {
    positionWasSet: false,
    pointerEventsWasSet: false,
    ariaHiddenChildren: [],
    blurredChildren: [],
    overflow: null,
    display: null,
    observer: null,
  };

  // Ensure the target is a box the overlay can fill (see promoteInlineTarget)
  // before we read/adjust position below — inline-block is still position:static,
  // so the relative-promotion that follows is unaffected by the order.
  promoteInlineTarget(target, restore);

  if (getComputedStyle(target).position === 'static') {
    target.style.setProperty('position', 'relative');
    restore.positionWasSet = true;
  }

  if (!target.style.getPropertyValue('pointer-events')) {
    target.style.setProperty('pointer-events', 'none');
    restore.pointerEventsWasSet = true;
  }

  // Obscure pass: only force overflow:hidden when a filter is active. `blur(16px)`
  // throws a ~16px halo past each filtered child's box; without clipping, that
  // halo bleeds into neighboring page elements. !important so a site's own
  // `overflow: visible` (e.g. for tooltips) can't override us.
  if (childFilter) {
    restore.overflow = {
      value: target.style.getPropertyValue('overflow'),
      priority: target.style.getPropertyPriority('overflow'),
    };
    target.style.setProperty('overflow', 'hidden', 'important');
  }

  // Contain every existing child (aria-hidden + inert, plus the blur when a
  // filter is active). The host (appended after this) and later-streamed
  // children are handled separately: the host is intentionally left interactive,
  // and children the site adds after attach are caught by the observer below.
  for (const child of target.children) {
    if (child instanceof HTMLElement) containCoverChild(child, childFilter, restore);
  }

  restore.observer = observeCoverChildren(target, childFilter, restore);
  return restore;
}

/** Restore one curtained child's a11y containment (aria-hidden + inert) to
 *  exactly its pre-curtain state, from the snapshot attributes
 *  applyCoverSideEffects stamped. Pulled out of {@link revertCoverSideEffects} so
 *  that function stays under the complexity bar after inert joined aria-hidden. */
function restoreChildContainment(child: HTMLElement): void {
  const priorAria = child.getAttribute(PRIOR_ARIA_HIDDEN_ATTR);
  child.removeAttribute(PRIOR_ARIA_HIDDEN_ATTR);
  if (priorAria === null || priorAria === '') {
    child.removeAttribute(ARIA_HIDDEN_ATTR);
  } else {
    child.setAttribute(ARIA_HIDDEN_ATTR, priorAria);
  }
  // Only drop inert if the child wasn't already inert before we curtained it.
  const priorInert = child.getAttribute(PRIOR_INERT_ATTR);
  child.removeAttribute(PRIOR_INERT_ATTR);
  if (priorInert === 'true') {
    child.setAttribute(INERT_ATTR, '');
  } else {
    child.removeAttribute(INERT_ATTR);
  }
}

// Mirror of applyCoverSideEffects — each guard pairs with one set in the
// apply pass, restoring exactly what we touched. Splitting would untether
// the apply/revert symmetry that's load-bearing for the restore contract.
// fallow-ignore-next-line complexity
function revertCoverSideEffects(target: HTMLElement, restore: CoverRestore): void {
  // Stop watching for streamed-in children first — pairs with observeCoverChildren
  // in the apply pass. Children it already contained are reverted by the loops below.
  restore.observer?.disconnect();
  if (restore.positionWasSet) {
    target.style.removeProperty('position');
  }
  if (restore.pointerEventsWasSet) {
    target.style.removeProperty('pointer-events');
  }
  for (const child of restore.ariaHiddenChildren) {
    restoreChildContainment(child);
  }
  for (const { el, value, priority } of restore.blurredChildren) {
    if (value) {
      el.style.setProperty('filter', value, priority);
    } else {
      el.style.removeProperty('filter');
    }
  }
  if (restore.overflow !== null) {
    if (restore.overflow.value) {
      target.style.setProperty('overflow', restore.overflow.value, restore.overflow.priority);
    } else {
      target.style.removeProperty('overflow');
    }
  }
  if (restore.display !== null) {
    if (restore.display.value) {
      target.style.setProperty('display', restore.display.value, restore.display.priority);
    } else {
      target.style.removeProperty('display');
    }
  }
  // Clean up the hover variable in case detach fires while hovered. Safe to
  // call even when no childFilter was applied — removeProperty is a no-op.
  target.style.removeProperty(FILTER_VAR);
}

function applyReplaceSideEffects(target: HTMLElement): ReplaceRestore {
  const inlineDisplay = target.style.getPropertyValue('display');
  const inlineDisplayPriority = target.style.getPropertyPriority('display');
  // Use !important to defeat site stylesheets that set display on the picker
  // container — same approach as picker.ts hideElement.
  target.style.setProperty('display', 'none', 'important');
  return { inlineDisplay, inlineDisplayPriority };
}

function revertReplaceSideEffects(target: HTMLElement, restore: ReplaceRestore): void {
  if (restore.inlineDisplay) {
    target.style.setProperty('display', restore.inlineDisplay, restore.inlineDisplayPriority);
  } else {
    target.style.removeProperty('display');
  }
}

/** Build the curtain's shadow host element (no side effects on the target).
 *  Sets the data-attributes the STYLES key off, threads the explicit color
 *  scheme, and — for the chip skin — mirrors the description into the native
 *  `title` so the browser tooltip surfaces it (a title on inner shadow elements
 *  wouldn't be seen by the browser's tooltip handling). Pure DOM construction:
 *  attaching to the page and snapshotting side-effects stay in attachCurtain so
 *  the detach lifecycle owns them. */
function buildCurtainHost(opts: CurtainOptions, skin: CurtainSkin): HostWithHandle {
  const host = document.createElement('div') as HostWithHandle;
  host.setAttribute(HOST_ATTR, '');
  host.dataset['mode'] = opts.mode;
  host.dataset['skin'] = skin;
  if (opts.mode === 'cover') {
    host.dataset['peek'] = String(opts.peek ?? true);
  }
  // Explicit color scheme overrides the prefers-color-scheme fallback in
  // STYLES. Absent → CSS media query controls (today's behaviour, preserved
  // for callers that don't pass colorScheme — including the entire test
  // suite, which doesn't need to thread a mode argument through).
  if (opts.colorScheme) {
    host.setAttribute(COLOR_SCHEME_ATTR, opts.colorScheme);
  }
  // The native `title` attribute on the host gives sighted users the
  // explanation on hover — instant for the chip skin (which has no
  // visible description), and harmless for the pill (the description is
  // already rendered, the tooltip just mirrors it). The shadow root would
  // hide a title set on inner elements from browser tooltip handling.
  if (skin === 'chip') {
    host.title = opts.description ?? opts.title;
  }
  return host;
}

/** Mount a cover-mode curtain: snapshot + apply the target's side effects,
 *  append the host inside the target, and wire the hover-peek. Returns the
 *  CoverRestore so attachCurtain's detach closure owns the revert. The peek
 *  listeners need no explicit teardown — revertCoverSideEffects clears the CSS
 *  variable and host.remove() drops the listeners with the node — so this is a
 *  one-directional setup, not a symmetric add/remove pairing. */
function mountCoverCurtain(
  host: HostWithHandle,
  target: HTMLElement,
  opts: CurtainOptions,
): CoverRestore {
  const childFilter = opts.childFilter ?? DEFAULT_CHILD_FILTER;
  const peekFilter = opts.peekFilter ?? DEFAULT_PEEK_FILTER;
  const coverRestore = applyCoverSideEffects(target, childFilter);
  target.append(host);

  // Hover-peek: relax the filter on the target's children when the user
  // mouses over or tabs into the curtain. One write to the CSS variable
  // fans out to every filtered child via var(…); no per-child walk.
  // Skipped when there's no filter active (childFilter === '') since there's
  // nothing to peek under.
  if (childFilter && (opts.peek ?? true)) {
    const peekOn = (): void => {
      target.style.setProperty(FILTER_VAR, peekFilter);
    };
    const peekOff = (): void => {
      target.style.removeProperty(FILTER_VAR);
    };
    host.addEventListener('mouseenter', peekOn);
    host.addEventListener('mouseleave', peekOff);
    host.addEventListener('focusin', peekOn);
    host.addEventListener('focusout', peekOff);
  }

  return coverRestore;
}

// Owns the host construction + shadow/content build + the detach lifecycle that
// reverts whichever mode's side effects were applied. The cover/replace mount
// steps are delegated, but the snapshot records flow back here so detach stays
// the single owner of teardown.
// fallow-ignore-next-line complexity
export function attachCurtain(target: HTMLElement, opts: CurtainOptions): CurtainHandle {
  if (opts.mode === 'replace' && !target.parentNode) {
    throw new Error('attachCurtain: replace mode requires target to have a parent node');
  }

  const skin: CurtainSkin = opts.skin ?? 'pill';
  const host = buildCurtainHost(opts, skin);
  const shadow = host.attachShadow({ mode: 'open' });

  let detached = false;
  let coverRestore: CoverRestore | null = null;
  let replaceRestore: ReplaceRestore | null = null;

  function detach(): void {
    if (detached) return;
    detached = true;
    if (coverRestore) revertCoverSideEffects(target, coverRestore);
    if (replaceRestore) revertReplaceSideEffects(target, replaceRestore);
    host.remove();
  }

  const handle: CurtainHandle = { detach, host };
  host[HANDLE_KEY] = handle;

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const curtain = document.createElement('div');
  curtain.className = 'curtain';
  const ctx: ActionContext = { detach, host };
  curtain.append(skin === 'chip' ? buildChip(opts, ctx) : buildPill(opts, ctx));
  shadow.append(curtain);

  if (opts.mode === 'cover') {
    coverRestore = mountCoverCurtain(host, target, opts);
  } else {
    replaceRestore = applyReplaceSideEffects(target);
    const parent = target.parentNode;
    if (!parent) throw new Error('attachCurtain: target must be connected to the DOM');
    target.before(host);
  }

  // Force a reflow so the opacity transition fires from 0 → 1 instead of
  // skipping. Reading offsetWidth is the canonical synchronous-reflow trick,
  // and `void` is the precise way to discard a value accessed purely for its
  // layout side effect (signals intent + sidesteps no-unused-expressions).
  // eslint-disable-next-line sonarjs/void-use -- deliberate `void` to discard a property read taken only for its reflow side effect; the access itself forces layout
  void host.offsetWidth;
  host.dataset['state'] = 'ready';

  return handle;
}

export function detachAllCurtains(root: ParentNode = document): void {
  detachAllBySelector(root, `[${HOST_ATTR}]`, HANDLE_KEY);
}

/**
 * Re-skin every curtain in `root` to match `colorScheme`. Called by the
 * page-mode watcher when the host page flips theme (or the OS does, for
 * pages that follow OS preference). The CSS in the shadow root keys off
 * the attribute, so a single write per host flips the rendering — no
 * shadow-DOM rebuild, no listener churn.
 */
export function setAllCurtainsColorScheme(
  colorScheme: PageMode,
  root: ParentNode = document,
): void {
  applyColorSchemeToAll(root, `[${HOST_ATTR}]`, colorScheme);
}
