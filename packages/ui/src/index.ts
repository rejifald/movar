/** Movar shared UI primitives.
 *
 * Token-driven, prefers-color-scheme dark mode (no `.dark` class strategy),
 * source-mode workspace package — consumed directly as TSX by the extension
 * (Vite/WXT) and marketing site (Astro/Vite). Both apps must have the design
 * tokens wired into Tailwind via `@theme inline` for utilities like
 * `bg-accent`, `text-ink-strong` to resolve. See
 * `apps/extension/src/styles/globals.css` for the canonical wiring.
 */

export { BrandMark } from './brand-mark';
export type { BrandMarkProps } from './brand-mark';

export { Button } from './button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './button';

export { Checkbox } from './checkbox';
export type { CheckboxProps } from './checkbox';

export { IconButton } from './icon-button';
export type { IconButtonProps } from './icon-button';

export { Pill } from './pill';
export type { PillProps, PillSize, PillTone } from './pill';

export { Select } from './select';
export type { SelectOption, SelectProps, SelectVariant } from './select';

export { Switch } from './switch';
export type { SwitchProps } from './switch';

export { Tooltip } from './tooltip';
export type { TooltipAction, TooltipPlacement, TooltipProps, TooltipTone } from './tooltip';
