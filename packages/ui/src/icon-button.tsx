import type { JSX, ReactNode, Ref } from 'react';

import { cn } from './internal/cn';

/**
 * Compact square button for inline icon glyphs (×, ↑, ↓, etc).
 *
 * `label` is required and feeds aria-label — the visual glyph is a presentational
 * `currentColor` Unicode/SVG element that screen readers skip. Sized at 32×32
 * (`size-8` = 2rem) — on the 4px grid, and a more comfortable target than the
 * former 28×28, without dominating a row of list items.
 *
 * Tone follows the same ink → ink-strong path as text links, so a row of icon
 * buttons reads as quiet affordances until hovered.
 *
 * **Accessibility — target size.** 32×32 passes WCAG 2.5.8 AA (24×24
 * minimum). For destructive actions (delete, etc.) consider bumping the
 * caller to a 44×44 wrapper so the control satisfies WCAG 2.5.5 AAA — the
 * larger target reduces accidental destructive activations.
 */
export interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  /**
   * Forwarded to the underlying `<button>` (React 19 ref-as-prop — no
   * `forwardRef` wrapper needed, matching `TooltipPortal`'s convention).
   * Optional and additive: existing call sites that don't pass a ref are
   * unaffected. Lets callers that manage focus themselves (e.g.
   * PrioritySection restoring keyboard focus after a reorder/removal) reach
   * the DOM node without a wrapper element.
   */
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  onClick,
  disabled = false,
  className,
  children,
  ref,
}: Readonly<IconButtonProps>): JSX.Element {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'text-ink-soft hover:text-ink-strong hover:bg-surface-3',
        'text-ui-md flex size-8 items-center justify-center rounded-md font-mono transition-colors motion-reduce:transition-none',
        // Focus ring mirrors Checkbox so keyboard users see the same affordance
        // across every primitive in the package.
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        // Disabled: dim the whole control rather than only the text color so
        // the dim treatment matches Checkbox/Pill/Select. `hover:bg-transparent`
        // suppresses the hover surface that would otherwise flash on dim controls.
        'disabled:hover:text-ink-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  );
}
