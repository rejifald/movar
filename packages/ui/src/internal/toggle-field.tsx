import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Internal scaffolding shared by Checkbox and Switch. Both primitives wrap a
 * native `<input type="checkbox">` (Switch adds `role="switch"`) and frame it
 * with the same label + description + a11y plumbing — only the visual
 * primitive differs (tiny tickbox vs. sliding pill). This module factors out
 * the bits that were structurally identical so future toggle-shaped controls
 * (radio, segmented, …) inherit the same accessible name strategy by
 * construction rather than copy-paste.
 *
 * Package-private — exported from `internal/` and *not* re-exported via
 * `src/index.ts`. Consumers should reach for `<Checkbox>` / `<Switch>`, not
 * the shell.
 */

/**
 * Shared prop surface for every toggle-shaped primitive. Checkbox and Switch
 * both `extends` this so we have one place to maintain prop docs + types and
 * fallow's clone detector doesn't see two near-identical interface bodies.
 *
 * `*: T | undefined` (rather than `*?: T`) so consumers destructuring their
 * own props can forward fields directly — repo-wide
 * `exactOptionalPropertyTypes: true` would otherwise reject the call site.
 */
export interface ToggleFieldProps {
  /** Controlled checked state. Omit for uncontrolled. */
  checked?: boolean | undefined;
  /** Initial checked state in uncontrolled mode. */
  defaultChecked?: boolean | undefined;
  /** Fires with the new boolean — receives the future state, not the event. */
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  /**
   * Mark the toggle as invalid (failed validation). Swaps the accent-tinted
   * surface (border, checked fill, track, focus ring) to the `--danger`
   * family and sets `aria-invalid`. Pair with a `description` that explains
   * *why* it's invalid.
   */
  invalid?: boolean | undefined;

  /** Form integration. */
  id?: string | undefined;
  name?: string | undefined;
  value?: string | undefined;

  /** Primary label, rendered next to the visual. */
  label?: ReactNode;
  /** Helper text under the label. Auto-wired to `aria-describedby`. */
  description?: ReactNode;

  /** Applied to the root `<label>`. */
  className?: string | undefined;

  /**
   * A11y escape hatches. Use `aria-label` when no visible label is rendered
   * (e.g. in a compact toolbar). Use `aria-describedby` to override the
   * auto-wired description link.
   */
  'aria-label'?: string | undefined;
  'aria-labelledby'?: string | undefined;
  'aria-describedby'?: string | undefined;
}

export interface ToggleFieldA11y {
  /** The id to put on the `<input>` and `<label htmlFor>`. */
  inputId: string;
  /** The id for the visible label span (when one renders). */
  labelId: string;
  /** The id for the description span (when one renders). */
  descriptionId: string;
  /**
   * Resolved `aria-labelledby`. Caller-supplied override wins; otherwise we
   * point at our own labelId so screen readers announce "<label>, [role],
   * [state]" rather than concatenating label + description into one name.
   */
  ariaLabelledBy: string | undefined;
  /** Resolved `aria-describedby` (same precedence as `ariaLabelledBy`). */
  ariaDescribedBy: string | undefined;
  /** True when at least one of `label` / `description` will render. */
  hasText: boolean;
}

/** Override beats fallback, and fallback only applies when its anchor renders.
 *  Hoisted out of `useToggleFieldA11y` so the hook's branch count stays low
 *  enough for fallow to leave it alone — the per-id logic is the same for
 *  both `aria-labelledby` and `aria-describedby`. */
function resolveAriaId(
  override: string | undefined,
  anchor: ReactNode,
  anchorId: string,
): string | undefined {
  if (override !== undefined) return override;
  return anchor === undefined ? undefined : anchorId;
}

/**
 * Resolve the id triplet and `aria-*` wiring for a toggle field. Called from
 * each primitive's render — `useId` is stable across renders, so the IDs
 * stay consistent for the lifetime of the component.
 */
export function useToggleFieldA11y(props: ToggleFieldProps): ToggleFieldA11y {
  const generatedId = useId();
  const labelId = useId();
  const descriptionId = useId();
  return {
    inputId: props.id ?? generatedId,
    labelId,
    descriptionId,
    ariaLabelledBy: resolveAriaId(props['aria-labelledby'], props.label, labelId),
    ariaDescribedBy: resolveAriaId(props['aria-describedby'], props.description, descriptionId),
    hasText: props.label !== undefined || props.description !== undefined,
  };
}

export interface ToggleFieldShellProps {
  inputId: string;
  hasText: boolean;
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  className?: string | undefined;
  /** Visual primitive (input + decorators). Lives to the left of the text. */
  control: ReactNode;
  label?: ReactNode;
  labelId: string;
  description?: ReactNode;
  descriptionId: string;
}

/**
 * Root `<label>` plus the right-hand text panel. The control (input + the
 * primitive's bespoke decorators) is passed in via `control` so each primitive
 * keeps its visual JSX local — the shell only owns the layout box, click-
 * target padding, disabled/cursor states, and the label/description subtree.
 */
export function ToggleFieldShell({
  inputId,
  hasText,
  disabled,
  invalid,
  className,
  control,
  label,
  labelId,
  description,
  descriptionId,
}: Readonly<ToggleFieldShellProps>) {
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex items-start gap-3',
        // No visible text → the click target collapses to the small visual
        // box. Pad to 24×24 so a bare-mode toggle in a toolbar still passes
        // WCAG 2.5.8 AA (target size). Centred so the visual sits in the
        // middle of the padded hit area.
        !hasText && 'min-h-6 min-w-6 items-center justify-center',
        disabled === true ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      {control}
      {hasText && (
        <ToggleFieldText
          label={label}
          labelId={labelId}
          description={description}
          descriptionId={descriptionId}
          invalid={invalid}
        />
      )}
    </label>
  );
}

interface ToggleFieldTextProps {
  label: ReactNode;
  labelId: string;
  description: ReactNode;
  descriptionId: string;
  invalid: boolean | undefined;
}

/** Right-hand text panel — label on top, description below. Extracted out so
 *  ToggleFieldShell's branch count stays low and the markup stays in one
 *  place (any future "show validation icon next to the description" change
 *  lands here once). */
function ToggleFieldText({
  label,
  labelId,
  description,
  descriptionId,
  invalid,
}: Readonly<ToggleFieldTextProps>) {
  return (
    <span className="min-w-0 flex-1 leading-snug">
      {label !== undefined && (
        <span id={labelId} className="text-ink-strong text-ui-base block font-medium">
          {label}
        </span>
      )}
      {description !== undefined && (
        <span
          id={descriptionId}
          className={cn(
            'text-ui-sm mt-0.5 block',
            // Invalid descriptions act as the error message — tint them
            // danger so the eye lands on the explanation without prefixing
            // "Error:" by hand.
            invalid === true ? 'text-danger' : 'text-ink-soft',
          )}
        >
          {description}
        </span>
      )}
    </span>
  );
}
