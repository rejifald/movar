/**
 * Vanilla-DOM tooltip primitive — content-script counterpart to the
 * `@movar/ui` Tooltip React component. Same anatomy (title + body +
 * optional action), same tokens (consumed from the host page's
 * `@movar/theme` CSS variables), same a11y
 * posture, same hover/focus/ESC behaviour. No React dependency — the
 * content-script bundle stays React-free.
 *
 * Why a parallel implementation instead of mounting React into a shadow
 * root: React-in-shadow-root adds the React + react-dom runtimes to the
 * content script (which currently ships zero React), plus a portal /
 * createRoot lifecycle per tooltip. The visual surface for our case is
 * ~40 lines of DOM and ~80 lines of CSS — abstraction would obscure
 * more than it saves.
 *
 * Architecture: each `attachTooltip(anchor, opts)` call constructs a
 * shadow-rooted host appended to `document.body`. The host is hidden by
 * default; hover/focus on the anchor opens it. Positioning is
 * recomputed on every open, on resize, and on capture-phase scroll.
 * `detach()` removes every listener and the host. Site CSS can't reach
 * inside the shadow root, so our styling is unconditional.
 *
 * Visual parity with the React component is enforced by token
 * references (`var(--surface)`, `var(--ink-strong)`, etc.) — both
 * implementations resolve to the same values via the host app's
 * `@movar/theme` tokens. No values are hardcoded; if a token shifts, both
 * surfaces flip together.
 */

import { computeTooltipPosition } from '@movar/ui/tooltip-position';
// Re-export so existing imports of `TooltipPlacement` from this module
// (the @movar/extension content-script lib) keep working.
export type { TooltipPlacement } from '@movar/ui/tooltip-position';
import type { TooltipPlacement } from '@movar/ui/tooltip-position';
import { isTouchEnvironment } from './is-touch';
import {
  applyColorSchemeToAll,
  COLOR_SCHEME_ATTR,
  detachAllBySelector,
} from '@movar/page-mode/apply';
import type { PageMode } from '@movar/page-mode/types';
import { TOOLTIP_HOST_ATTR as HOST_ATTR } from './movar-markers';

const HANDLE_KEY = '__movarTooltipHandle' as const;
/** Dwell before hover opens the tooltip. Exported so tests can reference
 *  the same constant rather than hard-coding a magic number that drifts
 *  when the UX tuning changes. */
export const HOVER_OPEN_DELAY_MS = 200;
/** Grace period after mouseleave before the tooltip dismisses — gives
 *  the cursor time to cross the gap from anchor to tooltip surface. */
export const HOVER_CLOSE_DELAY_MS = 150;

export type TooltipTone = 'neutral' | 'accent';

export interface TooltipAction {
  label: string;
  onClick: (ctx: TooltipActionContext) => void;
}

export interface TooltipActionContext {
  /** Close the tooltip without detaching the listener wiring — the
   *  tooltip stays attached to the anchor and can re-open on next hover.
   *  Use this when the action shouldn't dismiss the affordance entirely. */
  close(): void;
  /** Detach everything — remove the host, drop all listeners. Use this
   *  when the action permanently resolves the tooltip's reason for being. */
  detach(): void;
}

export interface TooltipOptions {
  title?: string;
  body?: string;
  action?: TooltipAction;
  placement?: TooltipPlacement;
  tone?: TooltipTone;
  /** Force the tooltip's color scheme to match the host page (light or
   *  dark). Same semantics as `CurtainOptions.colorScheme`: omitting it
   *  defers to `prefers-color-scheme`, explicit values override. The
   *  orchestrator threads the detected page mode through callers. */
  colorScheme?: PageMode;
}

export interface TooltipHandle {
  detach(): void;
  readonly host: HTMLElement;
}

interface HostWithHandle extends HTMLElement {
  [HANDLE_KEY]?: TooltipHandle;
}

const STYLES = `
:host {
  /* Inherit token variables from the host page. Fallbacks match the
     light-mode defaults so the tooltip renders sensibly on pages that
     haven't wired tokens.css. */
  --movar-surface: var(--surface, #ffffff);
  --movar-accent-surface: var(--accent-surface, #f0fdf4);
  --movar-border: var(--border, #e7e5e4);
  --movar-accent: var(--accent, #15803d);
  --movar-ink: var(--ink, #44403c);
  --movar-ink-strong: var(--ink-strong, #1c1917);
  --movar-shadow: var(--shadow-md, 0 6px 24px -10px rgba(20, 15, 5, 0.12), 0 2px 6px rgba(20, 15, 5, 0.04));
  --movar-radius: 8px;
  --movar-action-bg: var(--surface-2, #f5f5f4);
  --movar-action-hover: var(--surface-3, #edeae6);

  position: fixed;
  z-index: 2147483646;
  display: block;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease-out, transform 150ms ease-out;
  transform: translateY(2px);
  font: 400 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--movar-ink);
}
:host([data-state="open"]) {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* Dark-mode tokens — applied either by explicit page-mode attribute or by
   prefers-color-scheme fallback. Same shape as curtain.ts: the explicit
   attribute wins so a site whose own theme disagrees with the OS still
   gets a matching surface. */
:host([${COLOR_SCHEME_ATTR}="dark"]) {
  --movar-surface: var(--surface, #1c1917);
  --movar-accent-surface: var(--accent-surface, #122a1d);
  --movar-border: var(--border, #2e2a27);
  --movar-accent: var(--accent, #15803d);
  --movar-ink: var(--ink, #d6d3d1);
  --movar-ink-strong: var(--ink-strong, #fafaf9);
}
@media (prefers-color-scheme: dark) {
  :host(:not([${COLOR_SCHEME_ATTR}])) {
    --movar-surface: var(--surface, #1c1917);
    --movar-accent-surface: var(--accent-surface, #122a1d);
    --movar-border: var(--border, #2e2a27);
    --movar-accent: var(--accent, #15803d);
    --movar-ink: var(--ink, #d6d3d1);
    --movar-ink-strong: var(--ink-strong, #fafaf9);
  }
}

@media (prefers-reduced-motion: reduce) {
  :host { transition: none; transform: none; }
}

.surface {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
  max-width: 280px;
  padding: 10px 12px;
  background: var(--movar-surface);
  border: 1px solid var(--movar-border);
  border-radius: var(--movar-radius);
  box-shadow: var(--movar-shadow);
}
:host([data-tone="accent"]) .surface {
  background: var(--movar-accent-surface);
  border-color: color-mix(in srgb, var(--movar-accent) 30%, transparent);
}

.title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--movar-ink-strong);
}
.body {
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--movar-ink);
}
.actions {
  margin-top: 2px;
  display: flex;
}
.action {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--movar-ink-strong);
  background: var(--movar-action-bg);
  border: 1px solid var(--movar-border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 120ms ease;
}
.action:hover { background: var(--movar-action-hover); }
.action:focus-visible {
  outline: 2px solid var(--movar-accent);
  outline-offset: 2px;
}

/* Arrow — 8px square rotated 45°, edge-aligned to anchor centre via
   inline left. Surface + border colours track the parent so the arrow
   reads as a notch on the body, not a separate shape. */
.arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: inherit;
  border: 1px solid var(--movar-border);
  transform: rotate(45deg);
}
:host([data-placement="top"]) .arrow {
  bottom: -5px;
  border-top: 0;
  border-left: 0;
}
:host([data-placement="bottom"]) .arrow {
  top: -5px;
  border-right: 0;
  border-bottom: 0;
}
`.trim();

interface AttachState {
  host: HostWithHandle;
  shadow: ShadowRoot;
  surface: HTMLDivElement;
  arrow: HTMLSpanElement;
  /** The anchor this tooltip explains — held so the shared ESC handler can
   *  return focus to it after closing. */
  anchor: HTMLElement;
  /** Preferred placement, re-passed to {@link reposition} on relayout. */
  placement: TooltipPlacement;
  actionBtn: HTMLButtonElement | null;
  isOpen: boolean;
  openTimer: ReturnType<typeof setTimeout> | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
  /** Set true when we're about to programmatically re-focus the anchor
   *  after ESC-closing the tooltip. Consumed by the next open() so the
   *  programmatic focus doesn't reopen what the user just dismissed. */
  suppressNextOpen: boolean;
}

/**
 * Open tooltips share three page-global listeners instead of registering their
 * own. `attachTooltip` adds each state here; `detach()` removes it. The globals
 * (`document` keydown, `window` scroll/resize) are installed lazily when the
 * registry becomes non-empty and torn down when it empties — so a page with N
 * survivor links holds O(1) globals, not 3×N, and relayout cost is proportional
 * to the number of *open* tooltips, not attached ones.
 */
const tooltipRegistry = new Set<AttachState>();
let globalsInstalled = false;

// ESC dispatches to the tooltip the user is actually on — focus inside the
// tooltip surface, or on its anchor. A tooltip merely open by hover elsewhere
// is left alone (it dismisses on mouseleave). When focus was inside the
// tooltip, returning it to the anchor would re-fire onFocus and reopen what we
// just closed, so `suppressNextOpen` silences exactly one upcoming open().
const sharedOnKey = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape') return;
  for (const state of tooltipRegistry) {
    if (!state.isOpen) continue;
    const focusInTooltip = state.host.contains(document.activeElement);
    const focusOnAnchor =
      state.anchor === document.activeElement || state.anchor.contains(document.activeElement);
    if (!focusInTooltip && !focusOnAnchor) continue;
    closeState(state);
    if (focusInTooltip) {
      state.suppressNextOpen = true;
      state.anchor.focus();
    }
  }
};

// Reposition only the tooltips that are actually open; closed ones cost nothing.
const sharedOnRelayout = (): void => {
  for (const state of tooltipRegistry) {
    if (state.isOpen) reposition(state, state.anchor, state.placement);
  }
};

/** Close `state`'s tooltip, leaving it attached and re-openable. Shared by the
 *  per-attach `close` closure and the registry's ESC handler so both go through
 *  one place. */
function closeState(state: AttachState): void {
  cancelTimers(state);
  if (!state.isOpen) return;
  state.isOpen = false;
  // removeAttribute (not `delete host.dataset.state`) — the dataset proxy in
  // some DOM impls keeps a stale attribute around after the `delete`, which
  // surfaces as the tooltip looking open under tests.
  state.host.removeAttribute('data-state');
}

function installGlobals(): void {
  if (globalsInstalled) return;
  globalsInstalled = true;
  // `keydown` at the document level so focus anywhere (host page or our shadow
  // root, which bubbles to the document) catches ESC. The `as EventListener`
  // cast is the standard bridge between TS's DOM lib and our typed handler.
  document.addEventListener('keydown', sharedOnKey as EventListener);
  globalThis.addEventListener('scroll', sharedOnRelayout, { capture: true, passive: true });
  globalThis.addEventListener('resize', sharedOnRelayout);
}

function teardownGlobals(): void {
  if (!globalsInstalled) return;
  globalsInstalled = false;
  document.removeEventListener('keydown', sharedOnKey as EventListener);
  globalThis.removeEventListener('scroll', sharedOnRelayout, { capture: true });
  globalThis.removeEventListener('resize', sharedOnRelayout);
}

function registerTooltip(state: AttachState): void {
  tooltipRegistry.add(state);
  installGlobals();
}

function unregisterTooltip(state: AttachState): void {
  tooltipRegistry.delete(state);
  if (tooltipRegistry.size === 0) teardownGlobals();
}

/**
 * Attach a tooltip to `anchor`. Returns a handle whose `.detach()` cleans
 * up listeners and removes the host. The host is also reachable via
 * `handle.host` for callers that need to query it (tests, content-script
 * cleanup sweeps).
 *
 * Touch environments (`isTouchEnvironment` heuristic — `matchMedia('(hover: none)')`):
 * a single tap on the anchor opens; tap outside or on the action closes.
 * Mouse: 200ms hover dwell to open, 150ms to close (lets the cursor
 * cross from anchor to tooltip without dismissing).
 */
// Length is the cost of wiring an entire shadow-DOM + event-listener
// lifecycle inline. Splitting into helpers would hide the symmetric
// pairing of addEventListener / removeEventListener that's load-bearing
// for the detach() correctness contract.
// fallow-ignore-next-line complexity
export function attachTooltip(anchor: HTMLElement, opts: TooltipOptions): TooltipHandle {
  if (!anchor.isConnected) {
    throw new Error('attachTooltip: anchor must be connected to the DOM');
  }
  const placement: TooltipPlacement = opts.placement ?? 'top';
  const tone: TooltipTone = opts.tone ?? 'neutral';

  const host = document.createElement('div') as HostWithHandle;
  host.setAttribute(HOST_ATTR, '');
  host.dataset['placement'] = placement;
  host.dataset['tone'] = tone;
  // Same semantics as the curtain: explicit colorScheme wins, absence
  // defers to the prefers-color-scheme media query in STYLES.
  if (opts.colorScheme) {
    host.setAttribute(COLOR_SCHEME_ATTR, opts.colorScheme);
  }
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const surface = document.createElement('div');
  surface.className = 'surface';
  surface.setAttribute('role', 'tooltip');
  if (opts.title != null && opts.title !== '') {
    const titleEl = document.createElement('div');
    titleEl.className = 'title';
    titleEl.textContent = opts.title;
    surface.append(titleEl);
  }
  if (opts.body != null && opts.body !== '') {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'body';
    bodyEl.textContent = opts.body;
    surface.append(bodyEl);
  }

  let actionBtn: HTMLButtonElement | null = null;
  if (opts.action) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'actions';
    actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'action';
    actionBtn.textContent = opts.action.label;
    actionsEl.append(actionBtn);
    surface.append(actionsEl);
  }

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.setAttribute('aria-hidden', 'true');
  surface.append(arrow);
  shadow.append(surface);

  document.body.append(host);

  const state: AttachState = {
    host,
    shadow,
    surface,
    arrow,
    anchor,
    placement,
    actionBtn,
    isOpen: false,
    openTimer: null,
    closeTimer: null,
    suppressNextOpen: false,
  };

  const open = (): void => {
    cancelTimers(state);
    if (state.suppressNextOpen) {
      state.suppressNextOpen = false;
      return;
    }
    if (state.isOpen) return;
    state.isOpen = true;
    reposition(state, anchor, placement);
    host.setAttribute('data-state', 'open');
  };

  const close = (): void => {
    closeState(state);
  };

  const scheduleOpen = (): void => {
    cancelTimers(state);
    state.openTimer = setTimeout(open, HOVER_OPEN_DELAY_MS);
  };
  const scheduleClose = (): void => {
    cancelTimers(state);
    state.closeTimer = setTimeout(close, HOVER_CLOSE_DELAY_MS);
  };

  // The shared registry handlers drive close/reposition through the standalone
  // `closeState` / `reposition` helpers (they read `state.anchor`/`placement`),
  // so no per-attach closures need storing. The shared ESC handler closes the
  // focused tooltip and returns focus to its anchor when focus was inside the
  // surface — `host.contains(document.activeElement)` detects that because focus
  // inside an open shadow root surfaces as the host in `document.activeElement`.

  // Anchor listeners. Hover + focus open; mouseleave/blur close (with delay
  // so the cursor can reach the tooltip itself without dismissing).
  const onMouseEnter = (): void => {
    scheduleOpen();
  };
  const onMouseLeave = (): void => {
    scheduleClose();
  };
  const onFocus = (): void => {
    open();
  };
  const onBlur = (): void => {
    scheduleClose();
  };
  const onTouchClick = (): void => {
    if (!isTouchEnvironment()) return;
    if (state.isOpen) {
      close();
    } else {
      open();
    }
  };

  anchor.addEventListener('mouseenter', onMouseEnter);
  anchor.addEventListener('mouseleave', onMouseLeave);
  anchor.addEventListener('focus', onFocus);
  anchor.addEventListener('blur', onBlur);
  anchor.addEventListener('click', onTouchClick);

  // Tooltip listeners — keep open while pointer is over the tooltip
  // surface; dismiss when it leaves.
  host.addEventListener('mouseenter', () => {
    cancelTimers(state);
  });
  host.addEventListener('mouseleave', scheduleClose);

  // Join the shared registry — installs the three page-global listeners on the
  // first attach, no-ops thereafter.
  registerTooltip(state);

  // Action button — its onClick gets a context with close/detach so
  // callers choose the right post-action behaviour.
  const handle: TooltipHandle = {
    detach() {
      cancelTimers(state);
      anchor.removeEventListener('mouseenter', onMouseEnter);
      anchor.removeEventListener('mouseleave', onMouseLeave);
      anchor.removeEventListener('focus', onFocus);
      anchor.removeEventListener('blur', onBlur);
      anchor.removeEventListener('click', onTouchClick);
      // Leaving the registry tears the globals down once the last tooltip goes.
      unregisterTooltip(state);
      host.remove();
    },
    host,
  };
  host[HANDLE_KEY] = handle;
  if (actionBtn && opts.action) {
    const action = opts.action;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      action.onClick({
        close,
        detach: () => {
          handle.detach();
        },
      });
    });
  }

  return handle;
}

function cancelTimers(state: AttachState): void {
  if (state.openTimer !== null) {
    clearTimeout(state.openTimer);
    state.openTimer = null;
  }
  if (state.closeTimer !== null) {
    clearTimeout(state.closeTimer);
    state.closeTimer = null;
  }
}

/** Half the arrow's square side (8px), used to offset the arrow so its
 *  visual centre aligns with the computed anchor midpoint. */
const ARROW_HALF_SIZE = 4;

/** Recompute tooltip position from the anchor's bounding rect. Math
 *  lives in `@movar/ui/tooltip-position`; this function reads the
 *  geometry from the shadow-DOM surface and applies the computed
 *  coordinates to host + arrow inline styles. */
function reposition(state: AttachState, anchor: HTMLElement, preferred: TooltipPlacement): void {
  // Read tooltip size from the rendered surface (in shadow root). The
  // host itself is position:fixed at unknown coordinates — querying its
  // rect would be misleading.
  const position = computeTooltipPosition({
    anchor: anchor.getBoundingClientRect(),
    tooltip: state.surface.getBoundingClientRect(),
    preferred,
  });
  state.host.dataset['placement'] = position.placement;
  state.host.style.top = `${position.top}px`;
  state.host.style.left = `${position.left}px`;
  state.arrow.style.left = `${position.arrowLeft - ARROW_HALF_SIZE}px`;
}

/** Detach every tooltip under `root` (default: document). Used by the
 *  content script's "Show everything on this page" sweep so tooltips
 *  don't survive after the picker links they explain have been restored. */
export function detachAllTooltips(root: ParentNode = document): void {
  detachAllBySelector(root, `[${HOST_ATTR}]`, HANDLE_KEY);
}

/**
 * Re-skin every tooltip in `root` to match `colorScheme`. Mirrors
 * `setAllCurtainsColorScheme` — the page-mode watcher calls both when
 * the page (or OS) flips theme. The CSS in each shadow root keys off
 * the attribute, so one write per host flips the rendering with no
 * shadow-DOM rebuild.
 */
export function setAllTooltipsColorScheme(
  colorScheme: PageMode,
  root: ParentNode = document,
): void {
  applyColorSchemeToAll(root, `[${HOST_ATTR}]`, colorScheme);
}
