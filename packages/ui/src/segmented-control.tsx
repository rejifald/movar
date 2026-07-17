import { useId } from 'react';
import type { JSX, ReactNode } from 'react';

import { cn } from './internal/cn';

/**
 * Movar SegmentedControl — a single-choice selector rendered as a row (or
 * column) of selectable segments. Use it when the options are few (2–4),
 * mutually exclusive, and worth showing all at once — the curtain-vs-hide
 * conceal-mode choice, a density toggle, a view switcher. For a longer or
 * space-constrained list, reach for {@link Select} instead.
 *
 * Built on native `<input type="radio">` (one visually-hidden input per
 * segment, all sharing a `name`) for the same reason as Checkbox and Switch:
 * the browser gives us a real radiogroup for free — arrow keys move the
 * selection, only the checked segment is a tab stop, Space selects, and screen
 * readers announce "radio, <label>, N of M". The visible segments are styled
 * siblings driven entirely by `peer-checked:` / `peer-focus-visible:` /
 * `peer-disabled:`, so React never touches the visual wiring. The container
 * carries `role="radiogroup"` so the group is named and announced as a unit.
 *
 * Each option may carry a one-line `description` (wired to its radio via
 * `aria-describedby`) and a leading `icon`. Descriptions stack under the label;
 * a label-only control collapses to a compact segment.
 *
 * **Accessibility — naming.** Provide one group name: a visible `legend`
 * (rendered above the segments and linked via `aria-labelledby`), or
 * `aria-label` / `aria-labelledby` when the name lives elsewhere. A dev-only
 * `console.warn` fires when none is present — an unnamed radiogroup announces
 * as a bare "group" (WCAG 3.3.2). Selection is never conveyed by color alone:
 * the checked segment also gains a filled surface and a heavier label.
 */

export interface SegmentedOption<T extends string = string> {
  value: T;
  /** Primary label — the segment's headline. */
  label: ReactNode;
  /** Optional one-line elaboration, stacked under the label and linked to the
   *  radio via `aria-describedby`. */
  description?: ReactNode;
  /** Optional illustrative preview rendered above the icon+label — a small
   *  visual of what choosing this option does. Decorative (`aria-hidden`); the
   *  label + description carry the meaning for assistive tech. */
  preview?: ReactNode;
  /** Optional leading mark, rendered before the label. Size it on the icon. */
  icon?: ReactNode;
  disabled?: boolean;
}

export type SegmentedControlSize = 'sm' | 'md';
export type SegmentedControlOrientation = 'horizontal' | 'vertical';

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Visible group label, rendered above the segments and used as the
   *  radiogroup's accessible name. Omit when naming via `aria-label*`. */
  legend?: ReactNode;
  /** Radio group `name`. Defaults to a generated id — only set this when the
   *  control participates in a native `<form>` whose field name matters. */
  name?: string;
  size?: SegmentedControlSize;
  /** Lay the segments in a row (default) or a column. Descriptions read best
   *  vertical; label-only switches sit well horizontal. */
  orientation?: SegmentedControlOrientation;
  /** Disable the whole group. Per-option `disabled` disables a single segment. */
  disabled?: boolean;
  /**
   * Mark the control invalid. Swaps the selected segment's border/fill and the
   * focus ring to the `--danger` family and sets `aria-invalid` on the group.
   * Rarely needed — a segmented control always has a selection — but supported
   * for parity with the other form primitives.
   */
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function SegmentedControl<T extends string = string>(
  props: Readonly<SegmentedControlProps<T>>,
): JSX.Element {
  const {
    value,
    onChange,
    options,
    legend,
    name,
    size = 'md',
    orientation = 'horizontal',
    disabled = false,
    invalid = false,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
  } = props;

  const groupName = useId();
  const legendId = useId();
  const descBaseId = useId();
  const hasLegend = legend !== undefined;
  devWarnIfUnnamed(hasLegend || ariaLabel !== undefined || ariaLabelledBy !== undefined);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {hasLegend && (
        <span id={legendId} className="text-ink-soft text-ui-sm font-medium">
          {legend}
        </span>
      )}
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? (hasLegend ? legendId : undefined)}
        aria-invalid={invalid || undefined}
        className={cn('flex gap-2', orientation === 'vertical' ? 'flex-col' : 'flex-row')}
      >
        {options.map((option, i) => (
          <Segment
            key={option.value}
            option={option}
            checked={option.value === value}
            name={name ?? groupName}
            descriptionId={`${descBaseId}-${String(i)}`}
            size={size}
            orientation={orientation}
            groupDisabled={disabled}
            invalid={invalid}
            onSelect={() => {
              onChange(option.value);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface SegmentProps<T extends string> {
  option: SegmentedOption<T>;
  checked: boolean;
  name: string;
  descriptionId: string;
  size: SegmentedControlSize;
  orientation: SegmentedControlOrientation;
  groupDisabled: boolean;
  invalid: boolean;
  onSelect: () => void;
}

/** One segment: a visually-hidden native radio plus the styled card sibling it
 *  drives via `peer-*`. The whole card is the label, so a click or Space
 *  anywhere on it selects — and arrow keys move between segments natively.
 *
 *  Selection-reactive styles (fill, border, the heavier label weight) live on
 *  the card `<span>` — the radio's *immediate* sibling — because `peer-*` is a
 *  sibling combinator and wouldn't reach a nested node. The label inherits the
 *  card's font-weight (medium → semibold when checked); the description opts
 *  back out with `font-normal` so only the headline thickens. */
function Segment<T extends string>({
  option,
  checked,
  name,
  descriptionId,
  size,
  orientation,
  groupDisabled,
  invalid,
  onSelect,
}: Readonly<SegmentProps<T>>): JSX.Element {
  const { value, label, description, preview, icon, disabled } = option;
  const isDisabled = groupDisabled || disabled === true;
  const hasDescription = description !== undefined;
  // Name the radio from the label alone (via aria-labelledby) and attach the
  // description separately (aria-describedby). Without this, the wrapping
  // `<label>` would fold the description into the accessible *name*, so a
  // screen reader would speak it twice. Mirrors the Checkbox/Switch a11y split.
  const labelId = `${descriptionId}-label`;

  return (
    <label
      className={cn(
        'relative isolate min-w-0',
        orientation === 'horizontal' && 'flex-1',
        isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={isDisabled}
        aria-labelledby={labelId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span className={segmentCardClasses({ size, invalid })}>
        <SegmentPreview preview={preview} />
        <SegmentLabel id={labelId} icon={icon} size={size}>
          {label}
        </SegmentLabel>
        <SegmentDescription id={descriptionId} size={size} description={description} />
      </span>
    </label>
  );
}

function segmentCardClasses({
  size,
  invalid,
}: {
  size: SegmentedControlSize;
  invalid: boolean;
}): string {
  return cn(
    'flex h-full flex-col rounded-lg border font-medium transition-colors motion-reduce:transition-none',
    'border-border bg-surface',
    segmentPaddingBySize[size],
    // Hover lifts the border, but only on an interactive, not-yet-selected
    // segment — otherwise it would out-specify the checked accent border.
    'peer-[:enabled:not(:checked)]:hover:border-ink-soft',
    // Selected — fill + border + heavier label (the weight is the
    // non-color cue, so the state survives a grayscale render).
    invalid ? selectedDangerClasses : selectedAccentClasses,
    'peer-checked:font-semibold',
    // Keyboard focus ring rides the card since the real radio is hidden.
    'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
    invalid ? 'peer-focus-visible:outline-danger' : 'peer-focus-visible:outline-accent',
    'peer-disabled:opacity-50',
  );
}

// Each segment is a whole CARD (preview + label + description), not a chip, so
// its padding compounds with everything stacked inside it — `md` at px-4/py-3
// read as bulky next to the previews it wraps. Keep a real step between the two
// sizes: the pair used to sit ~2px apart, which is how `sm` and `md` end up
// indistinguishable (the same trap Button's sizes fell into).
const segmentPaddingBySize = {
  sm: 'gap-1 px-2 py-1',
  md: 'gap-1 px-3 py-2',
} satisfies Record<SegmentedControlSize, string>;

const selectedAccentClasses = 'peer-checked:border-accent peer-checked:bg-accent-surface';
const selectedDangerClasses = 'peer-checked:border-danger peer-checked:bg-danger-surface';

function SegmentPreview({
  preview,
}: Readonly<{ preview: ReactNode | undefined }>): JSX.Element | null {
  if (preview === undefined) return null;
  return (
    <span aria-hidden="true" className="mb-1 block">
      {preview}
    </span>
  );
}

function SegmentLabel({
  id,
  icon,
  size,
  children,
}: Readonly<{
  id: string;
  icon: ReactNode | undefined;
  size: SegmentedControlSize;
  children: ReactNode;
}>): JSX.Element {
  return (
    <span className="text-ink-strong flex items-center gap-2">
      <SegmentIcon icon={icon} />
      <span id={id} className={cn('block min-w-0', labelTextClassBySize[size])}>
        {children}
      </span>
    </span>
  );
}

const labelTextClassBySize = {
  sm: 'text-ui-sm',
  md: 'text-ui-base',
} satisfies Record<SegmentedControlSize, string>;

function SegmentIcon({ icon }: Readonly<{ icon: ReactNode | undefined }>): JSX.Element | null {
  if (icon === undefined) return null;
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      {icon}
    </span>
  );
}

function SegmentDescription({
  id,
  size,
  description,
}: Readonly<{
  id: string;
  size: SegmentedControlSize;
  description: ReactNode | undefined;
}>): JSX.Element | null {
  if (description === undefined) return null;
  return (
    <span
      id={id}
      className={cn('text-ink-soft block font-normal', descriptionTextClassBySize[size])}
    >
      {description}
    </span>
  );
}

const descriptionTextClassBySize = {
  sm: 'text-ui-xs',
  md: 'text-ui-sm',
} satisfies Record<SegmentedControlSize, string>;

/** Dev-only nudge — an unnamed radiogroup announces as a bare "group" and
 *  fails WCAG 3.3.2. We warn rather than throw (the name can legitimately live
 *  in an external `aria-labelledby` target we can't verify here). Compiled out
 *  in production builds via the `NODE_ENV` replacement every bundler performs. */
function devWarnIfUnnamed(named: boolean): void {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (named || proc?.env?.['NODE_ENV'] === 'production') return;
  // eslint-disable-next-line no-console -- dev-only diagnostic
  console.warn(
    '[@movar/ui] <SegmentedControl> is missing an accessible name. Pass `legend`, `aria-label`, or `aria-labelledby`.',
  );
}
