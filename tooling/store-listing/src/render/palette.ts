/**
 * Colours for the framing renderer. Hexes mirror `packages/theme/src/tokens.ts`
 * (a test pins them to it); they are copied rather than imported because this
 * package does not depend on `@movar/theme`.
 */

export type GroundTone = 'light' | 'dark';

export interface TonePalette {
  /** Flat ground used until a background image is provided. */
  ground: string;
  /** Headline + wordmark. */
  ink: string;
  /** Logo tile fill. */
  markTile: string;
  /** Logo letter ("r") fill. */
  markLetter: string;
  /** Logo dot. */
  markDot: string;
  /** CTA pill fill / label. */
  ctaFill: string;
  ctaLabel: string;
  /** Soft shadow under the phone. */
  shadow: string;
  /** The "without Movar" caption's dot (the "with" dot is the accent). */
  captionDot: string;
}

export const ACCENT = '#15803d'; // tokens: colorLight.accent
const INK_STRONG = '#1c1917'; //    tokens: colorLight['ink-strong']
const PAPER = '#fafaf9'; //         tokens: colorDarkOverrides['ink-strong']

export const PALETTE: Record<GroundTone, TonePalette> = {
  light: {
    ground: '#edeae6', // tokens: colorLight['surface-3'] (warm stone)
    ink: INK_STRONG,
    markTile: INK_STRONG,
    markLetter: '#ffffff',
    markDot: ACCENT,
    ctaFill: INK_STRONG,
    ctaLabel: PAPER,
    shadow: 'rgba(28, 25, 23, 0.34)',
    captionDot: '#57534e', // tokens: colorLight['ink-soft']
  },
  dark: {
    ground: '#1c1917', // tokens: colorDarkOverrides.surface
    ink: PAPER,
    // All-white mark on dark grounds: the letter and dot knock out to the ground.
    markTile: '#ffffff',
    markLetter: '#1c1917',
    markDot: '#1c1917',
    ctaFill: PAPER,
    ctaLabel: INK_STRONG,
    shadow: 'rgba(0, 0, 0, 0.55)',
    captionDot: '#a8a29e', // tokens: colorDarkOverrides['ink-soft']
  },
};

/** The device's black bezel. Near-black but not pure, so `measure.ts` can find it. */
export const BEZEL_COLOR = '#060607';
