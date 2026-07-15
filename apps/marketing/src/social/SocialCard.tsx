import type { CSSProperties, JSX } from 'react';

import { ArrowDown } from 'lucide-react';

import { colorLight, fontFamily, letterSpacing } from '@movar/theme';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

export interface SocialCardProps {
  lang?: Locale;
}

/**
 * Portrait social-post card (1080×1350) — a before/after **demo**, not a
 * wordmark. It shows the real product mechanism so the image earns Instagram's
 * mandatory media slot with information a caption + OG link preview can't carry:
 * the same Cyrillic Google search returns all-Russian results ("Before Movar")
 * vs. Ukrainian results once Movar appends its language hint ("After Movar" —
 * note `hl=uk&lr=lang_uk` in the captured URL bar).
 *
 * Reuses the committed marketing before/after screenshots
 * (`public/screenshots/google-{without,with}-movar.png`, served to Storybook via
 * `.storybook/main.ts` `staticDirs`) and the `beforeAfter` panel labels from
 * i18n, so it can't drift from the on-site demo. Pinned to the light palette —
 * social feeds render the raw PNG and ignore `prefers-color-scheme`.
 *
 * Captured by `scripts/capture-social-cards.mts` into `public/social/<lang>/`.
 */
export function SocialCard({ lang = 'en' }: Readonly<SocialCardProps>): JSX.Element {
  const t = strings[lang].social;
  const ba = strings[lang].beforeAfter;
  return (
    <div style={frameStyle}>
      <div style={headerStyle}>
        <p style={headlineStyle}>{t.headline}</p>
        <p style={scenarioStyle}>{t.scenario}</p>
      </div>

      <Panel label={ba.without} tone={DANGER} src="/screenshots/google-without-movar.png" />
      <div style={arrowRowStyle}>
        <ArrowDown size={40} color={ACCENT} strokeWidth={3} />
      </div>
      <Panel label={ba.withMovar} tone={ACCENT} src="/screenshots/google-with-movar.png" />

      <div style={footerStyle}>
        <span style={takeawayStyle}>
          <span style={dotStyle} />
          {t.takeaway}
        </span>
        <span style={markStyle}>
          movar<span style={{ color: ACCENT }}>.fyi</span>
        </span>
      </div>
    </div>
  );
}

function Panel({
  label,
  tone,
  src,
}: Readonly<{ label: string; tone: string; src: string }>): JSX.Element {
  return (
    <div style={panelStyle}>
      <img src={src} alt={label} style={imgStyle} />
      <span style={{ ...labelStyle, background: tone }}>{label}</span>
    </div>
  );
}

const BG = colorLight.bg;
const INK = colorLight['ink-strong'];
const INK_FAINT = colorLight['ink-faint'];
const ACCENT = colorLight.accent;
const DANGER = colorLight.danger;
const BORDER = colorLight.border;

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
  gap: 20,
  padding: 56,
  boxSizing: 'border-box',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const headlineStyle: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 46,
  lineHeight: 1.1,
  letterSpacing: letterSpacing.display,
  color: INK,
};

const scenarioStyle: CSSProperties = {
  margin: 0,
  fontFamily: fontFamily.mono,
  fontSize: 26,
  color: INK_FAINT,
};

const panelStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 462,
  borderRadius: 20,
  overflow: 'hidden',
  border: `1px solid ${BORDER}`,
  background: '#ffffff',
  flex: '0 0 auto',
};

const imgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'top',
};

const labelStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  padding: '8px 18px',
  borderRadius: 9999,
  color: '#ffffff',
  fontSize: 24,
  fontWeight: 700,
};

const arrowRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginTop: 'auto',
};

const takeawayStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: INK_FAINT,
  fontSize: 27,
  fontWeight: 500,
};

const dotStyle: CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  borderRadius: 9999,
  background: ACCENT,
  flex: '0 0 auto',
};

const markStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: 28,
  letterSpacing: letterSpacing.display,
  color: INK,
  flex: '0 0 auto',
};
