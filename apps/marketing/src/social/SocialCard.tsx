import type { CSSProperties, JSX } from 'react';

import { colorLight, fontFamily, letterSpacing } from '@movar/theme';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

export interface SocialCardProps {
  lang?: Locale;
}

/**
 * Portrait social-post card (1080×1350) — a before/after **demo** that mirrors
 * the site's `BeforeAfter` treatment (framed figures, an accent-tinted border on
 * the "after" half, and a `font-mono` uppercase label + caption below each
 * image). It shows the real mechanism so the image earns Instagram's mandatory
 * media slot with information a caption + OG link preview can't carry: the same
 * Cyrillic Google search returns all-Russian results ("Before Movar") vs.
 * Ukrainian ones once Movar appends `hl=uk&lr=lang_uk` (visible in the URL bar).
 *
 * Reuses the committed marketing screenshots
 * (`public/screenshots/google-{without,with}-movar.png`, served to Storybook via
 * `.storybook/main.ts` `staticDirs`) and the `beforeAfter` labels + captions, so
 * it can't drift from the on-site section. Pinned to the light palette — social
 * feeds render the raw PNG and ignore `prefers-color-scheme`. Captured by
 * `scripts/capture-social-cards.mts` into `public/social/<lang>/`.
 */
export function SocialCard({ lang = 'en' }: Readonly<SocialCardProps>): JSX.Element {
  const t = strings[lang].social;
  const ba = strings[lang].beforeAfter;
  return (
    <div style={frameStyle}>
      <p style={headlineStyle}>{t.headline}</p>

      <Half
        src="/screenshots/google-without-movar.png"
        label={ba.without}
        caption={ba.pairs.search.withoutCaption}
        accent={false}
      />
      <Half
        src="/screenshots/google-with-movar.png"
        label={ba.withMovar}
        caption={ba.pairs.search.withCaption}
        accent
      />

      <span style={markStyle}>
        movar<span style={{ color: ACCENT }}>.fyi</span>
      </span>
    </div>
  );
}

function Half({
  src,
  label,
  caption,
  accent,
}: Readonly<{ src: string; label: string; caption: string; accent: boolean }>): JSX.Element {
  return (
    <figure style={{ ...figureStyle, borderColor: accent ? ACCENT_BORDER : BORDER }}>
      <div style={imgWrapStyle}>
        <img src={src} alt={label} style={imgStyle} />
      </div>
      <figcaption style={figcaptionStyle}>
        <div style={{ ...labelStyle, color: accent ? ACCENT : INK_FAINT }}>{label}</div>
        <p style={captionStyle}>{caption}</p>
      </figcaption>
    </figure>
  );
}

const BG = colorLight.bg;
const INK = colorLight['ink-strong'];
const INK_FAINT = colorLight['ink-faint'];
const ACCENT = colorLight.accent;
const BORDER = colorLight.border;
/** `border-accent/30` — the accent (#15803d) at 30%, matching BeforeAfter. */
const ACCENT_BORDER = 'rgba(21, 128, 61, 0.3)';

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
  gap: 24,
  padding: 56,
  boxSizing: 'border-box',
};

const headlineStyle: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 46,
  lineHeight: 1.1,
  letterSpacing: letterSpacing.display,
  color: INK,
};

const figureStyle: CSSProperties = {
  margin: 0,
  background: BG,
  borderRadius: 24,
  border: '1px solid',
  borderColor: BORDER,
  padding: 14,
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
  flex: '0 0 auto',
};

const imgWrapStyle: CSSProperties = {
  position: 'relative',
  height: 440,
  overflow: 'hidden',
  borderRadius: 14,
  background: '#ffffff',
};

const imgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'top',
};

const figcaptionStyle: CSSProperties = {
  marginTop: 14,
  paddingLeft: 4,
  paddingRight: 4,
};

const labelStyle: CSSProperties = {
  fontFamily: fontFamily.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  fontSize: 22,
  fontWeight: 600,
};

const captionStyle: CSSProperties = {
  margin: 0,
  marginTop: 6,
  fontSize: 28,
  color: INK,
};

const markStyle: CSSProperties = {
  marginTop: 'auto',
  alignSelf: 'flex-end',
  fontWeight: 800,
  fontSize: 26,
  letterSpacing: letterSpacing.display,
  color: INK,
};
