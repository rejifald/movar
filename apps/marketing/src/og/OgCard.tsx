import type { CSSProperties, JSX } from 'react';

import { BrandMark } from '@movar/ui';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

export interface OgCardProps {
  lang?: Locale;
}

/**
 * Open Graph share card — rendered at the canonical 1200×630 social
 * preview size. Storybook (`Marketing/OG/Default`) hosts the live
 * component; `apps/marketing/scripts/capture-og-images.mts` screenshots
 * each locale story into `public/og/<lang>/01-default.png`, which
 * `BaseLayout.astro` then references from `<meta property="og:image">`.
 *
 * Pixel-precise inline sizing: the OG image is a fixed-size deliverable,
 * so the wrapper is hard-wired to 1200×630 instead of relying on
 * responsive Tailwind units. Tailwind would still resolve at the Storybook
 * viewport size, but locking dimensions here means the capture script
 * can't accidentally crop the card if a future viewport change drifts.
 *
 * Colours are hard-coded literals (`#fafaf9`, `#1c1917`, `#15803d`,
 * `#737373`) rather than the token CSS vars (`--bg`, `--ink-strong`,
 * `--accent`, `--ink-faint`). Social network crawlers don't honour
 * `prefers-color-scheme`, so a dark-mode visitor would otherwise see the
 * link preview captured against a dark surface that nobody else sees.
 * If tokens drift, update the literals here too — the Storybook capture
 * is the only place the OG image is materialised.
 */
export function OgCard({ lang = 'en' }: OgCardProps): JSX.Element {
  const t = strings[lang].og;
  return (
    <div style={frameStyle}>
      <div style={wordmarkStyle}>
        <BrandMark size={64} />
        <span style={wordmarkTextStyle}>
          movar<span style={{ color: ACCENT }}>.fyi</span>
        </span>
      </div>

      <div style={taglineStackStyle}>
        <p style={taglineLineStyle}>{t.taglineLine1}</p>
        <p style={{ ...taglineLineStyle, color: ACCENT, marginTop: 8 }}>{t.taglineLine2}</p>
      </div>

      <div style={captionStyle}>
        <span>{t.caption}</span>
        <span style={accentDotStyle} />
      </div>
    </div>
  );
}

const BG = '#fafaf9';
const INK = '#1c1917';
const INK_SOFT = '#737373';
const ACCENT = '#15803d';

const frameStyle: CSSProperties = {
  width: 1200,
  height: 630,
  position: 'relative',
  background: BG,
  color: INK,
  fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
  colorScheme: 'light',
  overflow: 'hidden',
};

const wordmarkStyle: CSSProperties = {
  position: 'absolute',
  top: 64,
  left: 72,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  color: INK,
};

const wordmarkTextStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 44,
  letterSpacing: '-0.02em',
  lineHeight: 1,
};

const taglineStackStyle: CSSProperties = {
  position: 'absolute',
  left: 72,
  right: 72,
  top: '50%',
  transform: 'translateY(-50%)',
};

const taglineLineStyle: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 96,
  lineHeight: 1.05,
  letterSpacing: '-0.02em',
  color: INK,
};

const captionStyle: CSSProperties = {
  position: 'absolute',
  right: 72,
  bottom: 56,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  color: INK_SOFT,
  fontSize: 28,
  fontWeight: 400,
};

const accentDotStyle: CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  borderRadius: 9999,
  background: ACCENT,
};
