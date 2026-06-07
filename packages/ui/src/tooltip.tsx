import { isValidElement, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './button';
import { cn } from './internal/cn';
import { enhanceAnchor, useDismissOnEscape, useTooltipDisclosure } from './internal/use-tooltip';
import { computeTooltipPosition } from './tooltip-position';
import type {
  TooltipPlacement as SharedTooltipPlacement,
  TooltipPosition,
} from './tooltip-position';

/**
 * Tooltip — contextual hover/focus surface anchored to a target element.
 *
 * Carries up to three slots: a short `title`, explanatory `body`, and an
 * optional primary `action` button. Use it for *occasional* help: an
 * explanation of why a UI changed, a recovery action ("undo this hide"),
 * or a "why is this here?" callout. For information users need *every*
 * time, render it inline — a Tooltip the user has to discover-by-hover is
 * unfit for primary copy.
 *
 * **Triggers.** Mouse hover (200ms dwell to open, 150ms to close so the
 * cursor can move from anchor → tooltip without dismissing). Keyboard
 * focus (open immediately, close on blur or ESC). Touch (tap toggles —
 * native `title` is unreachable on mobile, so this is a real upgrade).
 *
 * **Positioning.** Renders into a `document.body` portal so `overflow:
 * hidden` containers can't crop it. Calculates position from the anchor's
 * `getBoundingClientRect` on each open + on resize + on scroll. Preferred
 * `placement` flips top↔bottom on viewport collision.
 *
 * **Why no library.** Floating UI is ~12kB; our cases are top/bottom
 * placement and centre alignment. Hand-rolled positioning is ~30 LOC and
 * has no transitive surface.
 *
 * **Accessibility.** Wires `aria-describedby={tooltipId}` onto the anchor
 * via `cloneElement`, so screen readers announce the tooltip's content
 * inline with the anchor's name. ESC dismisses and returns focus to the
 * anchor. Action button gets the standard accent focus ring.
 *
 * **Controlled mode.** Pair `open` + `onOpenChange` to drive the tooltip
 * from external state (multi-step tutorials, tests). Uncontrolled mode
 * (omit both) is the common case.
 */

// Re-export the shared placement type so consumers can keep importing
// `TooltipPlacement` from `@movar/ui` without knowing about the
// `./tooltip-position` sub-path module.
export type TooltipPlacement = SharedTooltipPlacement;
export type TooltipTone = 'neutral' | 'accent';

export interface TooltipAction {
  label: string;
  onClick: () => void;
}

export interface TooltipProps {
  /** Short heading shown in semibold. Omit for body-only tooltips. */
  title?: string;
  /** Body copy. ReactNode (not just string) so callers can compose
   *  emphasis/breaks. Cap content at ~2-3 lines of small type. */
  body?: ReactNode;
  /** Optional primary action button. Single-action by design — for
   *  multi-action recovery flows, build a popover. */
  action?: TooltipAction;
  /** Preferred placement; auto-flips on viewport collision. Default 'top'. */
  placement?: TooltipPlacement;
  /** Visual tone — matches Pill's vocabulary. Default 'neutral'. */
  tone?: TooltipTone;
  /** Controlled-mode open state. Omit for uncontrolled (default). */
  open?: boolean;
  /** Fires when open state changes — pair with `open` for controlled use. */
  onOpenChange?: (open: boolean) => void;
  /** Exactly one focusable element — the anchor. Receives event listeners
   *  and `aria-describedby`. */
  children: ReactElement;
}

/** Off-screen coordinate used to pre-measure the tooltip before it has a
 *  real position; large negative value keeps it invisible during layout. */
const OFFSCREEN_PX = -9999;
/** Half the arrow square size (8px rotated square → 4px offset to centre). */
const ARROW_HALF_SIZE_PX = 4;

export function Tooltip({
  title,
  body,
  action,
  placement = 'top',
  tone = 'neutral',
  open: controlledOpen,
  onOpenChange,
  children,
}: Readonly<TooltipProps>): React.JSX.Element {
  const tooltipId = useId();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const { open, anchorRef, cancelTimers, scheduleOpen, scheduleClose, openNow, closeNow } =
    useTooltipDisclosure(controlledOpen, onOpenChange);
  useDismissOnEscape(open, closeNow, anchorRef);

  // Anchor wiring via cloneElement. The child must accept event handlers
  // and aria-describedby — anything focusable does, so this works for
  // <button>, <a>, <span tabIndex={0}>, custom forwardRef components, etc.
  if (!isValidElement(children)) {
    throw new Error('Tooltip: `children` must be a single React element (the anchor).');
  }
  const enhancedAnchor = enhanceAnchor(children as ReactElement<Record<string, unknown>>, {
    open,
    tooltipId,
    anchorRef,
    scheduleOpen,
    scheduleClose,
    openNow,
    closeNow,
  });

  return (
    <>
      {enhancedAnchor}
      {open ? (
        <TooltipPortal
          ref={tooltipRef}
          anchorRef={anchorRef}
          tooltipId={tooltipId}
          placement={placement}
          tone={tone}
          title={title}
          body={body}
          action={action}
          onMouseEnter={cancelTimers}
          onMouseLeave={scheduleClose}
        />
      ) : null}
    </>
  );
}

interface TooltipPortalProps {
  ref: React.Ref<HTMLDivElement>;
  anchorRef: React.RefObject<HTMLElement | null>;
  tooltipId: string;
  placement: TooltipPlacement;
  tone: TooltipTone;
  // `| undefined` is explicit so `exactOptionalPropertyTypes` lets the
  // outer Tooltip component pass through optional props without spreading.
  title: string | undefined;
  body: ReactNode | undefined;
  action: TooltipAction | undefined;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function useTooltipPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
  preferredPlacement: TooltipPlacement,
): TooltipPosition | null {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  // Reflow position from getBoundingClientRect. Runs synchronously after
  // paint so the tooltip lands at correct coordinates without a visible
  // flicker. ResizeObserver + scroll listener cover content reflows.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    const compute = (): void => {
      setPosition(
        computeTooltipPosition({
          anchor: anchor.getBoundingClientRect(),
          tooltip: tooltip.getBoundingClientRect(),
          preferred: preferredPlacement,
        }),
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(anchor);
    ro.observe(tooltip);
    globalThis.addEventListener('scroll', compute, { capture: true, passive: true });
    globalThis.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      globalThis.removeEventListener('scroll', compute, { capture: true });
      globalThis.removeEventListener('resize', compute);
    };
  }, [anchorRef, tooltipRef, preferredPlacement]);
  return position;
}

// Three independent optional slots (title / body / action), each a flat guarded
// render — splitting would scatter one small layout across helpers.
// fallow-ignore-next-line complexity
function TooltipContent({
  title,
  body,
  action,
}: Readonly<{
  title: string | undefined;
  body: ReactNode | undefined;
  action: TooltipAction | undefined;
}>) {
  return (
    <>
      {title != null && title !== '' ? (
        <div className="text-ink-strong text-ui-sm leading-tight font-semibold">{title}</div>
      ) : null}
      {body == null ? null : <div className="text-ink text-ui-xs leading-snug">{body}</div>}
      {action ? (
        <div className="mt-0.5 flex">
          <Button size="sm" variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </>
  );
}

// Portal target check + ref-forwarding ternary + position-optional
// chaining + tone class branch. Each is a different runtime concern;
// flattening would just push the branches into prop default helpers.
// fallow-ignore-next-line complexity
function TooltipPortal({
  ref,
  anchorRef,
  tooltipId,
  placement: preferredPlacement,
  tone,
  title,
  body,
  action,
  onMouseEnter,
  onMouseLeave,
}: TooltipPortalProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const position = useTooltipPosition(anchorRef, localRef, preferredPlacement);
  const placement = position?.placement ?? preferredPlacement;

  // Portal target — `document.body`. Falls back to null while SSR / before
  // mount; safe because the tooltip only renders when open, which is a
  // post-interaction state on the client.
  if (typeof document === 'undefined') return null;

  const assignRef = (el: HTMLDivElement | null): void => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  return createPortal(
    <div
      ref={assignRef}
      id={tooltipId}
      role="tooltip"
      data-tone={tone}
      data-placement={placement}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: position?.top ?? OFFSCREEN_PX,
        left: position?.left ?? OFFSCREEN_PX,
        visibility: position ? 'visible' : 'hidden',
        zIndex: 50,
      }}
      className={cn(
        'pointer-events-auto max-w-[280px] min-w-[180px] rounded-lg border shadow-md',
        'flex flex-col gap-1.5 p-2.5 font-sans',
        'transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
        tone === 'accent'
          ? 'border-accent/30 bg-accent-surface text-ink'
          : 'border-border bg-surface text-ink',
      )}
    >
      <TooltipContent title={title} body={body} action={action} />
      <TooltipArrow placement={placement} arrowLeft={position?.arrowLeft ?? 0} />
    </div>,
    document.body,
  );
}

interface TooltipArrowProps {
  placement: TooltipPlacement;
  arrowLeft: number;
}

function TooltipArrow({ placement, arrowLeft }: Readonly<TooltipArrowProps>) {
  // 8px rotated square. Edge-aligned to anchor centre via `arrowLeft`. The
  // surface + border colors track the parent via `bg-inherit` + `border-inherit`
  // so the arrow looks like a notch on the tooltip body, not a separate shape.
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute size-2 rotate-45 border border-inherit bg-inherit',
        placement === 'top'
          ? '-bottom-[5px] border-t-0 border-l-0'
          : '-top-[5px] border-r-0 border-b-0',
      )}
      style={{ left: arrowLeft - ARROW_HALF_SIZE_PX }}
    />
  );
}
