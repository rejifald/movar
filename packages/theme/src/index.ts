/**
 * `@movar/theme` — Movar's design tokens, the single source of truth for the
 * product's visual language.
 *
 * Import the **typed constants** from here when you can't read CSS variables —
 * social-card capture, `<meta name="theme-color">`, canvas/satori renders,
 * content scripts injected into host pages, tests. Import the **generated
 * stylesheets** (one self-contained file per token set) for everything else:
 *
 *   import '@movar/theme/color.css';       // semantic colors + Forest scale
 *   import '@movar/theme/typography.css';  // UI type scale, faces, tracking, leading
 *   import '@movar/theme/motion.css';      // transition durations
 *   // …plus shadow / glow / space / radius / size / breakpoint as needed
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
  letterSpacing,
  lineHeight,
  typeRoles,
  space,
  radius,
  breakpoints,
  size,
  shadow,
  shadowDark,
  duration,
  easing,
  glow,
  zIndex,
} from './tokens';

export type { ColorToken, TypeRole } from './tokens';
