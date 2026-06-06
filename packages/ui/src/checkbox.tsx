import { Check, Minus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { cn } from './internal/cn';
import { ToggleFieldShell, useToggleFieldA11y } from './internal/toggle-field';
import type { ToggleFieldProps } from './internal/toggle-field';

/**
 * Movar Checkbox primitive.
 *
 * Native `<input type="checkbox">` with `appearance-none`, restyled in our
 * tokens and overlaid with an SVG indicator. Native means free keyboard
 * support (Space toggles), free form participation, and free a11y
 * announcement ("checkbox, checked / not checked / mixed").
 *
 * Theming is token-driven via Tailwind utilities that resolve to the
 * `--accent`, `--surface`, `--ink-*`, `--border-*` CSS variables wired in
 * each consuming app's `globals.css`. Dark mode follows the existing
 * `@media (prefers-color-scheme: dark)` flip — no `.dark` class needed.
 *
 * Indeterminate is a DOM property, not an HTML attribute — we mirror the
 * prop onto the input via an effect, and render the dash indicator
 * conditionally rather than relying on `:indeterminate` for visibility
 * (Tailwind v4 supports the variant, but the React-side branch keeps the
 * indicator state colocated with the rest of the component contract).
 *
 * Shared scaffolding (root `<label>`, ID + ARIA wiring, label/description
 * subtree) lives in `./internal/toggle-field` so Switch (and any future
 * toggle-shaped primitive) inherits the same naming strategy by construction.
 */
export interface CheckboxProps extends ToggleFieldProps {
  /**
   * Tri-state indicator. When `true`, the dash icon renders regardless of
   * `checked`, and the input's `.indeterminate` DOM property is set so
   * assistive tech announces "mixed". Checkbox-only; Switch is binary.
   */
  indeterminate?: boolean | undefined;
}

export function Checkbox(props: Readonly<CheckboxProps>): JSX.Element {
  // `id` is consumed by `useToggleFieldA11y(props)` below, not here — the
  // hook resolves it (or generates) into `inputId` so we don't need to thread
  // the raw prop through this destructure.
  const {
    checked,
    defaultChecked,
    onCheckedChange,
    indeterminate = false,
    disabled,
    required,
    invalid = false,
    name,
    value,
    label,
    description,
    className,
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const { inputId, labelId, descriptionId, ariaLabelledBy, ariaDescribedBy, hasText } =
    useToggleFieldA11y(props);

  // `indeterminate` has no HTML attribute — only a DOM property. Mirror on
  // mount and on every change so controlled-from-React stays in sync with
  // what the browser actually announces.
  useEffect(() => {
    const el = inputRef.current;
    if (el) el.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <ToggleFieldShell
      inputId={inputId}
      hasText={hasText}
      disabled={disabled}
      invalid={invalid}
      className={className}
      label={label}
      labelId={labelId}
      description={description}
      descriptionId={descriptionId}
      control={
        <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
          <input
            ref={inputRef}
            id={inputId}
            type="checkbox"
            name={name}
            value={value}
            checked={checked}
            defaultChecked={defaultChecked}
            disabled={disabled}
            required={required}
            aria-label={props['aria-label']}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className={cn(
              // Layout — absolutely fill the box wrapper so the click target
              // matches the visual box exactly.
              'peer absolute inset-0 size-full appearance-none rounded-sm',
              'cursor-[inherit] transition-colors motion-reduce:transition-none',
              // Unchecked surface. Border uses `ink-soft` (not `border-strong`)
              // so the unchecked box passes WCAG 1.4.11 non-text contrast (3:1)
              // against the page bg in both light and dark.
              'border-ink-soft bg-surface border',
              // Checked & indeterminate share the same accent fill.
              'checked:border-accent checked:bg-accent',
              'indeterminate:border-accent indeterminate:bg-accent',
              // Hover only when the user can actually toggle it.
              'enabled:hover:border-ink',
              // Focus ring uses the accent so it's visible against any surface.
              'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
              'disabled:cursor-not-allowed',
              // Invalid swaps every accent-tinted surface (border, checked fill,
              // focus ring) for the danger family. `aria-invalid:` variants key
              // off the attribute we set above, so the invalid styles ride the
              // same prop without a separate class branch.
              'aria-invalid:border-danger aria-invalid:enabled:hover:border-danger',
              'aria-invalid:checked:border-danger aria-invalid:checked:bg-danger',
              'aria-invalid:indeterminate:border-danger aria-invalid:indeterminate:bg-danger',
              'aria-invalid:focus-visible:outline-danger',
            )}
          />
          {indeterminate ? <DashIndicator /> : <CheckIndicator />}
        </span>
      }
    />
  );
}

/** Solid dash for indeterminate ("mixed") state — always visible when rendered. */
function DashIndicator() {
  return (
    <Minus
      aria-hidden="true"
      strokeWidth={3}
      className="text-accent-on pointer-events-none relative size-3"
    />
  );
}

/** Check glyph for the checked state. Hidden when the input is unchecked via
 *  `peer-checked:opacity-100` — the input is a sibling-`peer` of this SVG so
 *  the CSS-only visibility flip avoids a React-side branch on `checked`. */
function CheckIndicator() {
  return (
    <Check
      aria-hidden="true"
      strokeWidth={3}
      className="text-accent-on pointer-events-none relative size-3 opacity-0 transition-opacity peer-checked:opacity-100"
    />
  );
}
