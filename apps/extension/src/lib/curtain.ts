/**
 * Generic overlay primitive — a "curtain" that signals "Movar acted here"
 * over or in place of a target element. Two modes:
 *
 *   cover   — curtain mounted as a child of `target`, fills it via inset:0.
 *             By default also applies a CSS `filter: blur(…)` to the
 *             target's pre-existing children so the underlying content reads
 *             as obscured. The blur is parameterizable (`childFilter` /
 *             `peekFilter`) and can be disabled with an empty string for a
 *             pure overlay. Content peeks through on hover by default.
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
 *          explanation surface.
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
 * A11y posture (v1): cover mode marks the target's existing children
 * aria-hidden and sets pointer-events:none on the target itself (children
 * inherit; our host overrides with pointer-events:auto). Keyboard focus
 * can still land on focusable descendants — tightening that (tabindex=-1
 * sweep, or sibling-mount with real `inert`) is deferred.
 */

import type { PageMode } from './page-mode/types';

const HOST_ATTR = 'data-movar-curtain';
const COLOR_SCHEME_ATTR = 'data-movar-color-scheme';
const PRIOR_ARIA_HIDDEN_ATTR = 'data-movar-curtain-prior-aria-hidden';
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
  const tpl = document.createElement('template');
  tpl.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"' +
    ' stroke="currentColor" stroke-width="1.75" stroke-linecap="round"' +
    ' stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>' +
    '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16' +
    ' 0 0 1-1.67 2.68"/>' +
    '<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0' +
    ' 5.39-1.61"/>' +
    '<line x1="2" y1="2" x2="22" y2="22"/>' +
    '</svg>';
  return tpl.content.firstElementChild as SVGElement;
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
    iconEl.setAttribute('aria-hidden', 'true');
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

  if (opts.description) {
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
  const chip = document.createElement(tag) as HTMLElement;
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
    iconEl.setAttribute('aria-hidden', 'true');
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

function applyCoverSideEffects(target: HTMLElement, childFilter: string): CoverRestore {
  let positionWasSet = false;
  if (getComputedStyle(target).position === 'static') {
    target.style.setProperty('position', 'relative');
    positionWasSet = true;
  }

  let pointerEventsWasSet = false;
  if (!target.style.getPropertyValue('pointer-events')) {
    target.style.setProperty('pointer-events', 'none');
    pointerEventsWasSet = true;
  }

  // Mark existing children aria-hidden — independent of any filter effect,
  // so screen readers skip them even in pure-overlay mode. The host (added
  // after this) and any later-added child are intentionally not touched.
  const ariaHiddenChildren: HTMLElement[] = [];
  for (const child of target.children) {
    if (!(child instanceof HTMLElement)) continue;
    const prior = child.getAttribute('aria-hidden');
    child.setAttribute(PRIOR_ARIA_HIDDEN_ATTR, prior ?? '');
    child.setAttribute('aria-hidden', 'true');
    ariaHiddenChildren.push(child);
  }

  // Obscure pass: only run when the caller asked for a filter. Otherwise
  // the overlay's translucent background carries the obscure on its own
  // and we leave the target's layout untouched.
  let overflow: InlinePropSnapshot | null = null;
  const blurredChildren: CoverChildFilter[] = [];
  if (childFilter) {
    // Clip the filter halo at the target's box. `blur(16px)` extends a
    // ~16px halo past each filtered child's box; without clipping, that
    // halo bleeds into neighboring elements on the page. !important so a
    // site's own `overflow: visible` (e.g. for tooltips) can't override us.
    overflow = {
      value: target.style.getPropertyValue('overflow'),
      priority: target.style.getPropertyPriority('overflow'),
    };
    target.style.setProperty('overflow', 'hidden', 'important');

    // Apply the filter inline via var(--movar-curtain-filter, <default>) so
    // the hover-peek handler in attachCurtain can swap the var on the
    // target and re-filter every child in one write — no re-walking the
    // subtree on every mouse move.
    for (const child of ariaHiddenChildren) {
      const value = child.style.getPropertyValue('filter');
      const priority = child.style.getPropertyPriority('filter');
      blurredChildren.push({ el: child, value, priority });
      child.style.setProperty('filter', `var(${FILTER_VAR}, ${childFilter})`, 'important');
    }
  }

  return { positionWasSet, pointerEventsWasSet, ariaHiddenChildren, blurredChildren, overflow };
}

// Mirror of applyCoverSideEffects — each guard pairs with one set in the
// apply pass, restoring exactly what we touched. Splitting would untether
// the apply/revert symmetry that's load-bearing for the restore contract.
// fallow-ignore-next-line complexity
function revertCoverSideEffects(target: HTMLElement, restore: CoverRestore): void {
  if (restore.positionWasSet) {
    target.style.removeProperty('position');
  }
  if (restore.pointerEventsWasSet) {
    target.style.removeProperty('pointer-events');
  }
  for (const child of restore.ariaHiddenChildren) {
    const prior = child.getAttribute(PRIOR_ARIA_HIDDEN_ATTR);
    child.removeAttribute(PRIOR_ARIA_HIDDEN_ATTR);
    if (prior === null || prior === '') {
      child.removeAttribute('aria-hidden');
    } else {
      child.setAttribute('aria-hidden', prior);
    }
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

// Branches across mode (cover|replace), skin (pill|chip), and per-cover
// peek wiring — each branch handles a distinct attach-shape concern and
// the function owns the end-to-end host construction so the side-effect
// snapshotting and detach lifecycle stay coupled.
// fallow-ignore-next-line complexity
export function attachCurtain(target: HTMLElement, opts: CurtainOptions): CurtainHandle {
  if (opts.mode === 'replace' && !target.parentNode) {
    throw new Error('attachCurtain: replace mode requires target to have a parent node');
  }

  const skin: CurtainSkin = opts.skin ?? 'pill';
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
    const childFilter = opts.childFilter ?? DEFAULT_CHILD_FILTER;
    const peekFilter = opts.peekFilter ?? DEFAULT_PEEK_FILTER;
    coverRestore = applyCoverSideEffects(target, childFilter);
    target.append(host);

    // Hover-peek: relax the filter on the target's children when the user
    // mouses over or tabs into the curtain. One write to the CSS variable
    // fans out to every filtered child via var(…); no per-child walk.
    // revertCoverSideEffects clears the variable on detach, so we don't
    // need to undo this explicitly. Skipped when there's no filter active
    // (childFilter === '') since there's nothing to peek under.
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
  } else {
    replaceRestore = applyReplaceSideEffects(target);
    const parent = target.parentNode;
    if (!parent) throw new Error('attachCurtain: target must be connected to the DOM');
    target.before(host);
  }

  // Force a reflow so the opacity transition fires from 0 → 1 instead of
  // skipping. Reading offsetWidth is the canonical synchronous-reflow trick.
  void host.offsetWidth;
  host.dataset['state'] = 'ready';

  return handle;
}

export function detachAllCurtains(root: ParentNode = document): void {
  const hosts = [...root.querySelectorAll<HTMLElement>(`[${HOST_ATTR}]`)];
  for (const host of hosts) {
    const handle = (host as HostWithHandle)[HANDLE_KEY];
    if (handle) handle.detach();
  }
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
  for (const host of root.querySelectorAll<HTMLElement>(`[${HOST_ATTR}]`)) {
    host.setAttribute(COLOR_SCHEME_ATTR, colorScheme);
  }
}
