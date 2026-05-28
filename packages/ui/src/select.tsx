import type { ReactNode } from 'react';

import { cn } from './internal/cn';

/**
 * Native `<select>` styled in the Movar token vocabulary.
 *
 * Two variants today:
 *   - `form` — bordered, padded, surface bg. The standard form control look,
 *     used inside settings rows next to an Add button. Renders a custom SVG
 *     chevron overlay (`appearance-none` on the underlying select) so the
 *     indicator gets proper breathing room from the right edge — the native
 *     chevron's position is browser-controlled and rendered outside the
 *     padding box, which leaves it glued to the border. This follows the
 *     same "wrap with appearance-none + custom indicator" pattern Checkbox
 *     uses (see `packages/ui/README.md`).
 *   - `inline` — borderless, transparent, small. Behaves like inline text
 *     with a dropdown affordance (footer language picker). Keeps the native
 *     chevron, since the variability across Chrome's ▾, Safari's framed
 *     glyph, and Firefox's thin chevron reads as text-adjacent affordance,
 *     not a bordered control whose edge the chevron has to respect.
 *
 * Native `<select>` was chosen over a custom listbox for the same reason as
 * Checkbox: native keyboard, native a11y announcement, native form
 * participation, zero deps. The trade-off is that the open-state menu items
 * are styled by the OS, not by our tokens — acceptable here, would not be
 * acceptable for richer combobox use cases (e.g. typeahead).
 *
 * **Accessibility — naming.** Unlike Checkbox, Select has no built-in label
 * slot — consumers must wire `aria-label` or `aria-labelledby` (or a
 * neighbouring `<label htmlFor={id}>`). A dev-only `console.warn` fires
 * when none of those is present, since an unnamed `<select>` is announced
 * as a bare "combobox" by screen readers (WCAG 3.3.2).
 *
 * **`className` placement.** Applied to the outer element of each variant —
 * the wrapping `<span>` for `form`, the bare `<select>` for `inline`. Layout
 * utilities (`flex-1`, `w-full`, margin) work on either; styling utilities
 * meant for the underlying select element won't reach it through the form
 * variant's wrapper.
 */

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export type SelectVariant = 'form' | 'inline';

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (next: T) => void;
  options: readonly SelectOption<T>[];
  /**
   * Renders an extra option at the top with `value=''`. Use for "Pick one…"
   * affordances where the empty value means "nothing chosen yet".
   */
  placeholder?: string;
  variant?: SelectVariant;
  disabled?: boolean;
  /**
   * Mark the field as invalid (failed validation). Swaps border + focus ring
   * to the `--danger` family and sets `aria-invalid` so assistive tech
   * announces the error state. Pair with a sibling description that explains
   * *why* it's invalid — Select doesn't render its own helper text slot.
   */
  invalid?: boolean;
  name?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function Select<T extends string = string>(props: SelectProps<T>) {
  useDevWarnIfUnnamed(props);
  return props.variant === 'inline' ? <InlineSelect {...props} /> : <FormSelect {...props} />;
}

/** Inline variant — borderless, transparent, small. See the module JSDoc for
 *  when this look is the right pick over the form variant. */
function InlineSelect<T extends string = string>(props: SelectProps<T>) {
  const { value, onChange, disabled, invalid = false, name, id, className } = props;
  return (
    <select
      value={value}
      onChange={(e) => {
        onChange(e.target.value as T);
      }}
      disabled={disabled}
      name={name}
      id={id}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      aria-invalid={invalid || undefined}
      className={cn(INLINE_CLASSES, className)}
    >
      <SelectOptions {...props} />
    </select>
  );
}

/** Form variant — `appearance-none` hides the native chevron so the SVG
 *  overlay can sit at a controlled offset from the right border. The select
 *  gets the `peer` class so the chevron can react to the select's hover,
 *  disabled, and aria-invalid state without re-deriving them in React. */
function FormSelect<T extends string = string>(props: SelectProps<T>) {
  const { value, onChange, disabled, invalid = false, name, id, className } = props;
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value as T);
        }}
        disabled={disabled}
        name={name}
        id={id}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        aria-invalid={invalid || undefined}
        className={FORM_CLASSES}
      >
        <SelectOptions {...props} />
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={cn(
          'pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2',
          'text-ink-soft transition-colors motion-reduce:transition-none',
          'peer-hover:text-ink peer-focus-visible:text-ink-strong',
          'peer-disabled:opacity-50',
          'peer-aria-invalid:text-danger',
        )}
      >
        <polyline
          points="4 6 8 10 12 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Shared option-list render — placeholder (if any) followed by the typed
 *  options. Pulled out so both variants stay focused on their visual shell. */
function SelectOptions<T extends string = string>({
  options,
  placeholder,
}: Pick<SelectProps<T>, 'options' | 'placeholder'>) {
  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </>
  );
}

/** Dev-only nudge — an unnamed `<select>` announces as bare "combobox" and
 *  fails WCAG 3.3.2. We intentionally don't *throw* (some flows wire the
 *  label via a sibling `<label htmlFor={id}>` we can't detect from here);
 *  the warn surfaces the gap during development only. */
function useDevWarnIfUnnamed<T extends string>(props: SelectProps<T>): void {
  if (isProd() || hasAccessibleName(props)) return;
  // eslint-disable-next-line no-console -- dev-only diagnostic
  console.warn(
    '[@movar/ui] <Select> is missing an accessible name. Pass `aria-label`, `aria-labelledby`, or `id` (paired with an external `<label htmlFor>`).',
  );
}

/** Any one of these channels is enough for assistive tech to name the
 *  control: ARIA name (label, labelledby) or a sibling `<label htmlFor>`
 *  (which we approximate by the presence of `id`). */
function hasAccessibleName<T extends string>(props: SelectProps<T>): boolean {
  return (
    props['aria-label'] !== undefined ||
    props['aria-labelledby'] !== undefined ||
    props.id !== undefined
  );
}

/**
 * Cross-bundler `NODE_ENV === 'production'` check that doesn't require a
 * Node `process` type in this package. Vite, Astro, and esbuild all replace
 * `process.env.NODE_ENV` at build time; this just shields the read from
 * runtime ReferenceError where `process` isn't defined and from TS at
 * compile time.
 */
function isProd(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.['NODE_ENV'] === 'production';
}

// Settled form control: visible border, surface bg, hover surface bump,
// accent focus ring on keyboard focus. Border uses `ink-soft` (not `border`)
// so the resting form-field outline passes WCAG 1.4.11 non-text contrast
// (3:1) against the page bg. The focus-visible pattern matches Button/
// IconButton/Pill/Switch — the offset outline is the only focus indicator,
// the resting border stays put. Earlier this also swapped the border to
// `--accent` on focus, which read as a double ring (1px accent border +
// 2px gap + 2px accent outline of the same color).
//
// `peer` is for the SVG chevron sibling — see the form-variant return above.
// `appearance-none` hides the native chevron so the overlay can own
// placement; `w-full` lets the select fill its wrapping span (which is what
// receives the consumer `className`, e.g. `flex-1`).
// `pr-9` reserves 36px on the right for the chevron, which sits at `right-3`
// (12px from edge) and is 14px wide — that leaves ~10px between text and
// chevron and 12px between chevron and border.
const FORM_CLASSES = cn(
  'peer w-full appearance-none',
  'border-ink-soft bg-surface text-ink-strong transition-colors motion-reduce:transition-none',
  'rounded-lg border py-2 pr-9 pl-3 text-ui-base',
  'hover:border-ink',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  'disabled:cursor-not-allowed disabled:opacity-50',
  // Invalid swaps the resting/hover border to the danger family and recolors
  // the focus ring. The `aria-invalid:` variant rides the same attribute we
  // set on the <select> above, keeping the invalid prop the single source
  // of truth. The double ring on invalid+focused is intentional: inner
  // border = "this is invalid", outer ring = "this is focused" — two
  // different signals, unlike the same-color same-meaning pair we used to
  // render on the normal-state focus.
  'aria-invalid:border-danger aria-invalid:hover:border-danger',
  'aria-invalid:focus-visible:outline-danger',
);

// Footer-chip look: passes for inline text with a dropdown affordance.
// Keyboard focus still gets a visible ring — keyboard users have no other
// affordance, and the ring only renders on keyboard focus so mouse use is
// undisturbed.
const INLINE_CLASSES = cn(
  'cursor-pointer rounded-sm border-none bg-transparent text-ui-xs',
  'transition-colors motion-reduce:transition-none hover:text-ink-strong',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:text-danger aria-invalid:focus-visible:outline-danger',
);
