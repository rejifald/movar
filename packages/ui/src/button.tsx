import type { ReactNode } from 'react';

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
}: Readonly<ButtonProps>) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn(
        // Layout — `inline-flex` so consumers can drop icons + text in
        // without re-aligning. `gap-1.5` matches Pill/IconButton.
        'inline-flex items-center justify-center gap-1.5',
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

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // `text-ui-sm` (12px) + tighter padding — matches the popup's denser
  // pause-duration / show-all buttons.
  sm: 'px-3 py-2 text-ui-sm',
  // `text-ui-base` (13px) + roomier padding — matches the options-page Add
  // buttons and the popup's full-width Resume button.
  md: 'px-4 py-2 text-ui-base',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Solid ink-strong against the page bg gives the dominant action enough
  // contrast in both themes without needing the accent (which is reserved
  // for state-of-the-product affordances like the StatusPill).
  primary: 'bg-ink-strong text-bg hover:bg-ink',
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
