/**
 * `@movar/theme` — Movar's design tokens, the single source of truth for the
 * product's visual language.
 *
 * Import the **typed constants** from here when you can't read CSS variables —
 * social-card capture, `<meta name="theme-color">`, canvas/satori renders,
 * tests. Import the **generated stylesheets** for everything else:
 *
 *   import '@movar/theme/tokens.css';   // raw `:root` custom properties
 *   import '@movar/theme/theme.css';    // Tailwind v4 @theme wiring
 *   import '@movar/theme/tokens.host.css'; // shadow-DOM (:host) variant
 *
 * The CSS is *generated* from the same constants (see src/tokens.ts), so the
 * two surfaces can never disagree.
 */

export {
  color,
  colorLight,
  colorDark,
  forest,
  fontFamily,
  fontSizeUi,
  space,
  radius,
  breakpoints,
  size,
  shadow,
  shadowDark,
} from './tokens';

export type { ColorToken } from './tokens';
