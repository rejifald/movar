import type { JSX } from 'react';

import { actionIconSvg } from './action-icon-svg';
import type { ActionIconState } from './action-icon-svg';

// The state catalogue + SVG string live on the `./action-icon-svg` sub-path and
// are re-exported from the package barrel (`index.ts`); no need to re-export them
// here too. This wrapper's own surface is just <ActionIcon> + its props.

export interface ActionIconProps {
  /** Which toolbar posture to render. */
  state: ActionIconState;
  /** Rendered edge length in px. Defaults to 48 (comfortable in Storybook / a
   *  settings preview); the real toolbar uses 16/32/48/128 rasters. */
  size?: number;
  /** Accessible name. Omit to render the icon aria-hidden (decorative). */
  title?: string;
  className?: string;
}

/**
 * React wrapper around {@link actionIconSvg} — a preview of the browser's
 * toolbar button in a given state, for Storybook and any in-app "here's what
 * the toolbar looks like" surface.
 *
 * It injects the canonical SVG string rather than re-authoring the geometry in
 * JSX: the toolbar icon is fundamentally a static raster asset (fixed hex, no
 * theme reactivity — see `action-icon.ts`), and sharing the one string keeps
 * this preview honest against what actually rasterises and ships. `innerHTML`
 * is safe here — the markup is entirely self-authored, with no interpolated
 * user input (only the a11y `title`, which `actionIconSvg` XML-escapes).
 */
export function ActionIcon({
  state,
  size = 48,
  title,
  className,
}: Readonly<ActionIconProps>): JSX.Element {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: actionIconSvg(state, { size, title }) }}
    />
  );
}
