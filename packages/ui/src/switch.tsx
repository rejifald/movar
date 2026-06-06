import { useRef } from 'react';

import { cn } from './internal/cn';
import { ToggleFieldShell, useToggleFieldA11y } from './internal/toggle-field';
import type { ToggleFieldProps } from './internal/toggle-field';

/**
 * Movar Switch primitive — a binary on/off toggle.
 *
 * Built on a native `<input type="checkbox" role="switch">` for the same
 * reason as Checkbox: free keyboard support (Space toggles), free form
 * participation, and free a11y announcement ("switch, on / off"). The `role`
 * upgrade tells assistive tech to announce "switch" instead of "checkbox" so
 * the visual affordance matches what users hear.
 *
 * Visually it's a sliding pill: a rounded-full track with a circular thumb
 * that translates 16px on toggle. The track recolors to `--accent` when on;
 * the thumb stays `--accent-on` (white) so the iOS-familiar look reads in
 * both light and dark.
 *
 * **When to use Switch vs. Checkbox.** Switch is for *settings* — a single
 * binary state that takes effect immediately (notification on/off, dark
 * mode, "remember me"). Checkbox is for *selections* — picking zero or more
 * items from a list, or affirming a single statement before form submission
 * (terms of service). When in doubt, ask: "does flipping this take effect
 * the moment I flip it, before any 'Save'?" If yes, Switch.
 *
 * Shared scaffolding lives in `./internal/toggle-field` — see Checkbox for
 * the rationale.
 */
export type SwitchProps = ToggleFieldProps;

export function Switch(props: Readonly<SwitchProps>) {
  // `id` is consumed by `useToggleFieldA11y(props)` below, not here.
  const {
    checked,
    defaultChecked,
    onCheckedChange,
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
        <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
          <input
            ref={inputRef}
            id={inputId}
            type="checkbox"
            role="switch"
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
            // Invisible-but-clickable: input fills the wrapper, captures clicks
            // and keyboard focus, paints nothing. Track + thumb are siblings,
            // rendered via peer-*: variants so React stays out of the visual
            // wiring entirely.
            className={cn(
              'peer absolute inset-0 size-full cursor-[inherit] appearance-none opacity-0',
              'disabled:cursor-not-allowed',
            )}
          />
          <SwitchTrack invalid={invalid} />
          <SwitchThumb />
        </span>
      }
    />
  );
}

/** Track — rounded-full pill that recolors to `--accent` when the sibling
 *  `<input>` is checked. Resting bg is `border-strong` (not `surface-3`) so
 *  the off state still passes 3:1 non-text contrast against the page bg in
 *  both light and dark. Switching the entire bg class on `invalid` (rather
 *  than layering `aria-invalid:`) keeps the generated CSS unambiguous. */
function SwitchTrack({ invalid }: Readonly<{ invalid: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 rounded-full transition-colors motion-reduce:transition-none',
        invalid ? 'bg-danger' : 'bg-border-strong peer-checked:bg-accent peer-disabled:opacity-60',
        // Focus ring rides the track since the real input is invisible.
        'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
        invalid ? 'peer-focus-visible:outline-danger' : 'peer-focus-visible:outline-accent',
      )}
    />
  );
}

/** Thumb — fixed `--accent-on` (white) so it reads against every track tone
 *  (stone, accent, danger) without per-state thumb colors. Translates 16px
 *  on `peer-checked:` to land at the right edge of the track. */
function SwitchThumb() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-accent-on pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full shadow-sm',
        'transition-transform motion-reduce:transition-none',
        'peer-checked:translate-x-4',
      )}
    />
  );
}
