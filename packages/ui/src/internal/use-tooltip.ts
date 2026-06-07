import { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent, ReactElement } from 'react';

import { isTouchEnvironment } from './is-touch';

/**
 * Internal lifecycle helpers for the `Tooltip` component. Split out so the
 * component itself stays a thin assembly of (1) the disclosure state machine,
 * (2) the anchor wiring, and (3) the render — each a separate runtime concern.
 *
 * Package-private — not re-exported from `src/index.ts`. Consumers reach for
 * `<Tooltip>`, never these helpers.
 */

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 150;

/** Open/close handlers + resolved state surfaced by `useTooltipDisclosure`. */
export interface TooltipDisclosure {
  /** Current open state (controlled value when controlled, else internal). */
  open: boolean;
  /** Ref to attach to the anchor — ESC returns focus here. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Clear any pending open/close timers (e.g. cursor entered the surface). */
  cancelTimers: () => void;
  /** Open after the hover dwell delay. */
  scheduleOpen: () => void;
  /** Close after the hover grace delay (lets the cursor hop anchor → surface). */
  scheduleClose: () => void;
  /** Open immediately (focus / touch tap). */
  openNow: () => void;
  /** Close immediately (ESC / touch tap). */
  closeNow: () => void;
}

/** A single-slot timeout: `defer` schedules a callback, cancelling any pending
 *  one first; `cancel` clears it. One pending hover timer at a time is all the
 *  tooltip needs — open-dwell and close-grace never overlap (each transition
 *  supersedes the last). Auto-cancels on unmount. Hoisted out of
 *  `useTooltipDisclosure` to keep that hook's body under fallow's size budget,
 *  the same move `resolveAriaId` makes for `useToggleFieldA11y`. */
function useHoverTimer(): { defer: (fn: () => void, delayMs: number) => void; cancel: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const defer = useCallback(
    (fn: () => void, delayMs: number): void => {
      cancel();
      timer.current = setTimeout(fn, delayMs);
    },
    [cancel],
  );
  useEffect(() => cancel, [cancel]);
  return { defer, cancel };
}

/**
 * The tooltip's open/close lifecycle as a self-contained state machine:
 * controlled/uncontrolled resolution, the hover dwell/grace transitions (via
 * `useHoverTimer`), and the immediate open/close transitions. ESC dismissal is
 * a separate concern — see `useDismissOnEscape`, wired by the component.
 *
 * Mirrors the file's existing `useTooltipPosition` hook — positioning and
 * disclosure are the two stateful concerns, each isolated behind a hook so the
 * component body reads as wiring rather than mechanism.
 */
export function useTooltipDisclosure(
  controlledOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): TooltipDisclosure {
  const anchorRef = useRef<HTMLElement | null>(null);
  const { defer, cancel: cancelTimers } = useHoverTimer();

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean): void => {
      cancelTimers();
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [cancelTimers, isControlled, onOpenChange],
  );

  const scheduleOpen = useCallback(() => {
    defer(() => {
      setOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  }, [defer, setOpen]);
  const scheduleClose = useCallback(() => {
    defer(() => {
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [defer, setOpen]);
  const openNow = useCallback(() => {
    setOpen(true);
  }, [setOpen]);
  const closeNow = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return { open, anchorRef, cancelTimers, scheduleOpen, scheduleClose, openNow, closeNow };
}

/**
 * Dismiss on Escape while `open`, then return focus to `focusOnDismiss`. A
 * global `keydown` listener (only attached while open) so the key works no
 * matter where focus sits — anchor, the tooltip's action button, or elsewhere.
 * Stops propagation so a tooltip ESC doesn't also close an enclosing dialog.
 */
export function useDismissOnEscape(
  open: boolean,
  onDismiss: () => void,
  focusOnDismiss: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onDismiss();
      focusOnDismiss.current?.focus();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [open, onDismiss, focusOnDismiss]);
}

/** The disclosure handlers the anchor needs, plus the open state and the id to
 *  wire via `aria-describedby`. */
export interface AnchorWiring {
  open: boolean;
  tooltipId: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  scheduleOpen: () => void;
  scheduleClose: () => void;
  openNow: () => void;
  closeNow: () => void;
}

function mergeIds(existing: string | undefined, added: string): string {
  if (existing == null || existing === '') return added;
  return existing.includes(added) ? existing : `${existing} ${added}`;
}

/** Compose the consumer's own handler (if any) with the tooltip's, in that
 *  order — the consumer always sees the event first, then the tooltip reacts. */
function merge<E>(prior: ((e: E) => void) | undefined, own: (e: E) => void): (e: E) => void {
  return (e: E) => {
    prior?.(e);
    own(e);
  };
}

/**
 * Clone the anchor element and attach the tooltip's listeners, each merged with
 * any handler the consumer already passed (so wiring a tooltip never clobbers an
 * existing `onFocus`/`onClick`). Works for anything focusable — `<button>`,
 * `<a>`, `<span tabIndex={0}>`, custom forwardRef components — since all it needs
 * is that the child accepts event handlers and `aria-describedby`.
 */
export function enhanceAnchor(
  childEl: ReactElement<Record<string, unknown>>,
  wiring: AnchorWiring,
): ReactElement {
  const { open, tooltipId, anchorRef, scheduleOpen, scheduleClose, openNow, closeNow } = wiring;
  // Bracket access throughout — the props are typed as Record<string, unknown>
  // so the `noPropertyAccessFromIndexSignature` rule fires on dot-access.
  type Handler<E> = ((e: E) => void) | undefined;
  const p = childEl.props;
  const priorAria = p['aria-describedby'] as string | undefined;
  return cloneElement<Record<string, unknown>>(childEl, {
    ref: anchorRef,
    'aria-describedby': open ? mergeIds(priorAria, tooltipId) : priorAria,
    onMouseEnter: merge(p['onMouseEnter'] as Handler<MouseEvent<HTMLElement>>, scheduleOpen),
    // Defer the close so focus can move to the tooltip's action button without
    // closing the tooltip mid-hop.
    onMouseLeave: merge(p['onMouseLeave'] as Handler<MouseEvent<HTMLElement>>, scheduleClose),
    onFocus: merge(p['onFocus'] as Handler<FocusEvent<HTMLElement>>, openNow),
    onBlur: merge(p['onBlur'] as Handler<FocusEvent<HTMLElement>>, scheduleClose),
    onKeyDown: merge(p['onKeyDown'] as Handler<KeyboardEvent<HTMLElement>>, (e) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        closeNow();
      }
    }),
    // Touch tap reaches here without a preceding mouseenter. Mouse already opened
    // the tooltip via mouseenter, so the toggle is a no-op for mouse —
    // `isTouchEnvironment()` guards against double-firing on devices that report
    // `(hover: hover)`. On touch: first tap opens, second closes; tap-outside is
    // handled by the next anchor's focus event landing elsewhere.
    onClick: merge(p['onClick'] as Handler<MouseEvent<HTMLElement>>, () => {
      if (!isTouchEnvironment()) return;
      if (open) closeNow();
      else openNow();
    }),
  });
}
