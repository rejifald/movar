import type { JSX, ReactNode } from 'react';

import { cn } from './internal/cn';

/**
 * Movar Button primitive.
 *
 * Two tones today — the "do this" vs. "consider this" choice that the rest
 * of the system already speaks:
 *
 *   - `primary` — solid `--ink-strong` bg, `--bg` text. Reserved for the
 *     dominant action in a row (Add, Resume).
 *   - `secondary` — bordered, `--surface-2` bg, neutral text. The "and also"
 *     siblings of a primary, or stand-alone actions where commitment is low
 *     (Pause for 1h, Show all hidden).
 *
 * Two sizes — `md` (default, form-row scale) and `sm` (popup-dense scale).
 *
 * `fullWidth` exists because two current call sites (PauseControls Resume,
 * HiddenPanel Show all) want a single button to span its container; doing
 * it via `className="w-full"` would still work, but a named prop reads better
 * at the call site and survives future styling refactors.
 *
 * **No `ghost` variant.** Footer link-style buttons (`Settings` in the popup)
 * are one-offs that compose better as inline JSX next to `<a>` siblings —
 * extracting a third variant for a single consumer would just create a
 * pattern nobody else uses. Revisit if a second ghost button appears.
 *
 * **No `danger` variant yet.** The danger family is wired in tokens, but no
 * current call site asks for a destructive button. Add when one appears,
 * not before.
 */

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch the button to fill its container. */
  fullWidth?: boolean;
  /** Native `<button type>`. Defaults to `'button'` — set `'submit'` for form CTAs. */
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** Required when `children` doesn't fully describe intent (e.g. icon-only). */
  'aria-label'?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  onClick,
  disabled = false,
  className,
  children,
  ...rest
}: Readonly<ButtonProps>): JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn(
        // Layout — `inline-flex` so consumers can drop icons + text in
        // without re-aligning. `gap-2` matches Pill/IconButton.
        'inline-flex items-center justify-center gap-2',
        'rounded-lg font-medium transition-colors motion-reduce:transition-none',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        // Focus ring matches every other interactive primitive (Checkbox,
        // IconButton, Pill, Select) so keyboard users see one affordance
        // vocabulary across the package.
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        // Disabled mirrors the rest of the package: dim the whole control,
        // suppress hover so dim buttons don't flash.
        'disabled:cursor-not-allowed disabled:opacity-50',
        DISABLED_HOVER_OVERRIDES[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  );
}

/*
 * Control heights are EXPLICIT, not padding-derived, so every control in a row
 * (Button · Select · Input) is exactly the same height. Deriving height from
 * `py-*` + line-height used to make `primary` render 2px SHORTER than
 * `secondary` / Select / Input beside it: those carry a 1px border and this
 * doesn't, and on an auto-height box the border always adds. An explicit height
 * + `border-box` puts the border inside the box, so bordered and borderless
 * variants land on the same number.
 *
 * `--control-h` lets a surface pick the height its input model needs while
 * keeping every control on that surface consistent: the touch-first Safari host
 * raises it to a 44px-floored `max(2.75rem, 44px)`; the desktop popup/options
 * take the 2.5rem (40px) default. Both are on the 4px grid.
 *
 * `py-1` is only breathing room for the degenerate wrapped-label case — the
 * height floor, not the padding, sets the resting size.
 */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  // Dense popup scale (pause-duration / show-all buttons).
  sm: 'min-h-[var(--control-h-sm,2rem)] px-3 py-1 text-ui-sm',
  // Form-row scale — the options/host Add buttons, the popup's Resume button.
  md: 'min-h-[var(--control-h,2.5rem)] px-4 py-1 text-ui-base',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Solid ink-strong against the page bg gives the dominant action enough
  // contrast in both themes without needing the accent (which is reserved
  // for state-of-the-product affordances like the StatusPill).
  // The transparent border is load-bearing, not decoration: it gives primary
  // the same box math as bordered `secondary` / Select / Input, so the two
  // never disagree by the border's 2px even when a label wraps past the
  // height floor.
  primary: 'border border-transparent bg-ink-strong text-bg hover:bg-ink',
  // Bordered + surface-2 — a "and also" sibling that doesn't compete with
  // primary. Hover lifts to surface-3 and bumps text to ink-strong so the
  // motion under the cursor says "this is clickable".
  secondary: 'border border-border bg-surface-2 text-ink hover:bg-surface-3 hover:text-ink-strong',
};

const DISABLED_HOVER_OVERRIDES: Record<ButtonVariant, string> = {
  // Without this, the hover bg darkens before the user realises the control
  // is disabled — a wrong affordance signal. Pin the bg + text so the
  // disabled state is visually stable across hover.
  primary: 'disabled:hover:bg-ink-strong disabled:hover:text-bg',
  secondary: 'disabled:hover:bg-surface-2 disabled:hover:text-ink',
};
