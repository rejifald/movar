import type { CSSProperties, JSX } from 'react';

import { BrandMark } from '@movar/ui';

/**
 * Chrome Web Store promo tile — 440×280 React composition that replaces
 * the inline-SVG + sharp pipeline that used to live in
 * `apps/extension/scripts/generate-promo-tile.mts`.
 *
 * Layout: brand mark on the left (≈⅓ of the tile width), wordmark
 * `Movar.` over a two-line tagline on the right, against the brand's
 * dark `#1C1917` surface. Tile reads as one brand with the marketing
 * site and the manifest icon.
 *
 * Why pixel-precise inline styles instead of Tailwind: the deliverable
 * is a fixed-size PNG. Hard-wiring 440×280 here means the Storybook
 * → Playwright capture is exact, and the same dimensions can't drift
 * if Tailwind config or viewport assumptions change later.
 */
export function ChromeTile(): JSX.Element {
  return (
    <div style={frameStyle}>
      <div style={markStyle}>
        <BrandMark size={156} letterColor="#FFFFFF" />
      </div>

      <div style={textStyle}>
        <p style={wordmarkStyle}>
          Movar<span style={{ color: ACCENT }}>.</span>
        </p>
        <p style={taglineStyle}>
          Keep the internet
          <br />
          in your language.
        </p>
      </div>
    </div>
  );
}

const BG = '#1C1917';
const ACCENT = '#15803D';
const INK = '#FFFFFF';
const INK_SOFT = '#A8A29E';

const frameStyle: CSSProperties = {
  width: 440,
  height: 280,
  background: BG,
  color: INK,
  fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
  colorScheme: 'light',
  display: 'flex',
  alignItems: 'center',
  gap: 28,
  padding: '0 32px',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const markStyle: CSSProperties = {
  flex: '0 0 auto',
  // `currentColor` drives BrandMark's rounded square; setting `color`
  // here paints the rect dark-2 against the dark BG without the
  // glyph turning invisible.
  color: '#0F0E0D',
};

const textStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
};

const wordmarkStyle: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 56,
  lineHeight: 1,
  letterSpacing: '-0.04em',
  color: INK,
};

const taglineStyle: CSSProperties = {
  margin: '14px 0 0',
  fontWeight: 500,
  fontSize: 21,
  lineHeight: 1.25,
  letterSpacing: '-0.01em',
  color: INK_SOFT,
};
