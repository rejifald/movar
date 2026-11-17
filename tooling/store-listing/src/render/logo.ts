/**
 * Movar brand-mark geometry for the renderer. Source of truth is
 * `packages/ui/src/brand-mark.tsx` (solid variant): a rounded 116-unit square,
 * the cutout lowercase "r" (Fixel Display 800, 96 units, baseline y=100, centred
 * on x=56, letter-spacing -0.02em) and an accent dot, all in a 128 x 128 viewBox.
 *
 * Satori renders `<svg>` children without access to fonts, so the "r" cannot be
 * a `<text>` here. The outline below is the glyph itself, extracted from the
 * bundled Fixel Display 800 with exactly the brand-mark's size/anchor/spacing —
 * not a redraw. Everything else is copied from `brand-mark.tsx`.
 */

/* eslint-disable @typescript-eslint/no-magic-numbers -- drawing data in the
 * brand-mark's fixed 0-128 viewBox, copied from brand-mark.tsx, not logic. */

export const BRAND_VIEWBOX = 128;
const SQUARE = { x: 6, y: 6, size: 116, radius: 28 } as const;
export const BRAND_DOT = { cx: 89.6, cy: 90.4, r: 9.6 } as const;

/** The "r" glyph outline in viewBox units (y down). */
export const BRAND_LETTER_PATH =
  'M42.7 100H59.41V73.79C59.41 68.42 63.44 64.77 71.41 64.77C72.85 64.77 74.58 65.15 75.73 65.54V50.08H74.19C67.09 50.08 61.23 52.86 57.39 57.47C57.3 55.46 56.62 52.1 55.95 50.08H42.7Z';

function roundedSquarePath(): string {
  const { x, y, size, radius } = SQUARE;
  const far = x + size;
  return [
    `M${x + radius} ${y}`,
    `H${far - radius}`,
    `A${radius} ${radius} 0 0 1 ${far} ${y + radius}`,
    `V${y + size - radius}`,
    `A${radius} ${radius} 0 0 1 ${far - radius} ${y + size}`,
    `H${x + radius}`,
    `A${radius} ${radius} 0 0 1 ${x} ${y + size - radius}`,
    `V${y + radius}`,
    `A${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    'Z',
  ].join('');
}

export const BRAND_SQUARE_PATH = roundedSquarePath();
