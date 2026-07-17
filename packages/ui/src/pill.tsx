import type { JSX, ReactNode } from 'react';

import { cn } from './internal/cn';

/**
 * Pill — a small rounded label used for status indicators, tags, and inline
 * chips. Two sizes cover the design today:
 *
 *   - `sm` — micro-tag look: font-mono, uppercase, micro type, pill (fully rounded).
 *     Pairs with `dot` for status indicators (popup's on/off/paused toggle).
 *   - `md` — chip look: sans, small type, rounded-md. Pairs with the priority chain
 *     and any other "label-as-data" affordance.
 *
 * Pass `onClick` and the pill renders as a `<button>` with hover styles, a
 * focus-visible ring, and `disabled` support for each tone; omit it and the
 * pill is a passive `<span>` (no hover, no focus, `disabled` ignored). This
 * mirrors how the rest of the codebase decides between interactive and
 * decorative wrappers — the prop shape is the affordance.
 *
 * Tones flip automatically with `prefers-color-scheme` because every color is
 * a token reference (`--accent`, `--ink-soft`, `--surface-2`, …).
 *
 * **Accessibility — target size.** Interactive `md` pills meet WCAG 2.5.8's
 * 24×24px target minimum on their own. Interactive `sm` pills are smaller
 * (~24px tall but the visual width can be narrow); use them only when
 * neighbours are spaced ≥24px apart (the spec's spacing exception) or for
 * secondary/non-primary touch surfaces.
 *
 * **Accessibility — toggle pattern.** When using an interactive Pill as a
 * toggle whose visible label changes with state (e.g. popup status:
 * Active/Off/Paused), pass `aria-pressed` so assistive tech announces the
 * pressed state. Without it, a screen reader-only `aria-label` shadows the
 * visible label and the current state is lost.
 */

export type PillTone = 'accent' | 'neutral' | 'muted';
export type PillSize = 'sm' | 'md';

export interface PillProps {
  tone?: PillTone;
  size?: PillSize;
  /** Leading colored dot. Only renders when set; tone drives its color. */
  dot?: boolean;
  /** Promotes the pill to a clickable button and enables hover styling. */
  onClick?: () => void;
  /** Only honored when `onClick` is set (otherwise the pill is a passive span). */
  disabled?: boolean;
  /**
   * Mark the pill as a toggle button with a pressed state. Only honored when
   * `onClick` is set. See the "toggle pattern" note in the component JSDoc.
   */
  'aria-pressed'?: boolean;
  /** Required when `onClick` is set and `children` doesn't fully describe intent. */
  'aria-label'?: string;
  className?: string;
  children: ReactNode;
}

export function Pill({
  tone = 'neutral',
  size = 'md',
  dot = false,
  onClick,
  disabled = false,
  className,
  children,
  ...rest
}: Readonly<PillProps>): JSX.Element {
  const interactive = onClick !== undefined;
  // One ternary instead of four `interactive && ...` fragments: the
  // affordance set (cursor + focus ring + disabled fade + interactive tone
  // hover) ships as a single unit anyway, so collapsing keeps the per-tone
  // hover styles co-located with the generic ones.
  const interactiveClasses = interactive
    ? `cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${INTERACTIVE_TONE_CLASSES[tone]}`
    : '';
  const classes = cn(
    'inline-flex items-center border transition-colors motion-reduce:transition-none',
    SIZE_CLASSES[size],
    TONE_CLASSES[tone],
    interactiveClasses,
    className,
  );

  const dotEl = dot ? (
    <span aria-hidden="true" className={cn('inline-block size-2 rounded-full', DOT_TONE[tone])} />
  ) : null;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={rest['aria-label']}
        aria-pressed={rest['aria-pressed']}
        className={classes}
      >
        {dotEl}
        {children}
      </button>
    );
  }

  return (
    <span aria-label={rest['aria-label']} className={classes}>
      {dotEl}
      {children}
    </span>
  );
}

const SIZE_CLASSES: Record<PillSize, string> = {
  sm: 'gap-2 rounded-full px-3 py-1 font-mono text-ui-micro font-medium tracking-label uppercase',
  // `py-1` (rather than a tighter inset) keeps the pill silhouette readable as
  // a chip rather than an underlined word, and lifts the interactive height to
  // 24px — matching WCAG 2.5.8's target-size minimum on its own. 4px is the
  // smallest step on the grid, so there is no tighter inset to reach for.
  md: 'rounded-md px-2 py-1 text-ui-sm font-medium',
};

const TONE_CLASSES: Record<PillTone, string> = {
  accent: 'border-accent/30 bg-accent-surface text-accent-deep',
  neutral: 'border-border bg-surface-2 text-ink',
  // `muted` resting text uses `text-ink-medium` — a dimmer step than `neutral`'s
  // `text-ink` that still clears AA on `surface-2` (5.6:1 light / 6.8:1 dark),
  // where `text-ink-soft` measures only ~4.4:1 (below WCAG 1.4.3 AA 4.5:1). The
  // dot differs too (`ink-faint` for muted vs. `ink-soft` for neutral).
  muted: 'border-border bg-surface-2 text-ink-medium',
};

const INTERACTIVE_TONE_CLASSES: Record<PillTone, string> = {
  accent: 'hover:border-accent/50 hover:bg-accent-soft',
  neutral: 'hover:border-border-strong hover:bg-surface-3',
  // muted's hover deliberately also bumps text — the "off" state needs to
  // signal recovery on hover, not just background contrast.
  muted: 'hover:text-ink-strong hover:border-border-strong',
};

const DOT_TONE: Record<PillTone, string> = {
  accent: 'bg-accent',
  neutral: 'bg-ink-soft',
  muted: 'bg-ink-faint',
};
