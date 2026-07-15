import type { CSSProperties, JSX } from 'react';

import { colorLight, fontFamily, letterSpacing } from '@movar/theme';
import { BrandMark } from '@movar/ui';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

export interface SocialCardProps {
  lang?: Locale;
}

/**
 * Portrait social-post card — rendered at 1080×1350 (Instagram's 4:5 feed
 * ratio, also valid as a Threads / Facebook image post). Sibling of
 * `OgCard`, but where the OG card is a 1200×630 *link preview*, this PNG is
 * posted as the actual image, so it carries the full pitch (headline +
 * subhead + trust strip), not just a wordmark.
 *
 * `Marketing/Social/*` stories host the live component;
 * `apps/marketing/scripts/capture-social-cards.mts` screenshots each locale
 * into `public/social/<lang>/NN-<slug>.png`, which the social publish
 * pipeline (`scripts/social/`) uploads by its public `movar.fyi` URL.
 *
 * Pinned to the **light** palette (`colorLight.*`) for the same reason as
 * OgCard: social feeds render the raw PNG and never honour
 * `prefers-color-scheme`, so a dark-mode author would otherwise ship a card
 * nobody else sees. Because these are the constants the CSS is generated
 * from, the card can't drift from the live tokens.
 */
export function SocialCard({ lang = 'en' }: Readonly<SocialCardProps>): JSX.Element {
  const t = strings[lang].social;
  return (
    <div style={frameStyle}>
      <div style={wordmarkStyle}>
        <BrandMark size={72} />
        <span style={wordmarkTextStyle}>
          movar<span style={{ color: ACCENT }}>.fyi</span>
        </span>
      </div>

      <div style={bodyStyle}>
        <p style={headlineLineStyle}>{t.headlineLine1}</p>
        <p style={{ ...headlineLineStyle, color: ACCENT }}>{t.headlineLine2}</p>
        <p style={subheadStyle}>{t.subhead}</p>
      </div>

      <div style={captionStyle}>
        <span style={accentDotStyle} />
        <span>{t.caption}</span>
      </div>
    </div>
  );
}

const BG = colorLight.bg;
const INK = colorLight['ink-strong'];
const INK_FAINT = colorLight['ink-faint'];
const ACCENT = colorLight.accent;

/** Uniform inset; the three stacked blocks distribute top / middle / bottom. */
const PAD = 96;

const frameStyle: CSSProperties = {
  width: 1080,
  height: 1350,
  background: BG,
  color: INK,
  fontFamily: fontFamily.sans,
  colorScheme: 'light',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: PAD,
  boxSizing: 'border-box',
};

const wordmarkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  color: INK,
};

const wordmarkTextStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 52,
  letterSpacing: letterSpacing.display,
  lineHeight: 1,
};

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const headlineLineStyle: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 104,
  lineHeight: 1.05,
  letterSpacing: letterSpacing.display,
  color: INK,
};

const subheadStyle: CSSProperties = {
  margin: 0,
  marginTop: 44,
  maxWidth: 820,
  fontWeight: 400,
  fontSize: 40,
  lineHeight: 1.35,
  color: INK_FAINT,
};

const captionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  color: INK_FAINT,
  fontSize: 30,
  fontWeight: 400,
};

const accentDotStyle: CSSProperties = {
  display: 'inline-block',
  width: 16,
  height: 16,
  borderRadius: 9999,
  background: ACCENT,
};
