import type { CSSProperties, JSX } from 'react';

import { color, fontFamily } from '@movar/theme';
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
 * Colours come from `@movar/theme`'s typed tokens, pinned to the **light**
 * palette (`color.light.*`): social network crawlers don't honour
 * `prefers-color-scheme`, so a dark-mode visitor would otherwise see the link
 * preview captured against a dark surface nobody else sees. Because these are
 * the same constants the CSS is generated from, the card can't drift from the
 * live tokens the way the old hard-coded literals could.
 */
export function OgCard({ lang = 'en' }: Readonly<OgCardProps>): JSX.Element {
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

const BG = color.light.bg;
const INK = color.light['ink-strong'];
const INK_FAINT = color.light['ink-faint'];
const ACCENT = color.light.accent;

const frameStyle: CSSProperties = {
  width: 1200,
  height: 630,
  position: 'relative',
  background: BG,
  color: INK,
  fontFamily: fontFamily.sans,
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
  color: INK_FAINT,
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
