import type { CSSProperties, JSX } from 'react';

import { colorLight, fontFamily, letterSpacing } from '@movar/theme';

/**
 * Steam client-language bar chart — an illustration for the DOU article
 * `docs/articles/dou-tykha-kapitulyatsiya.md`. Rendered at a fixed
 * 1200×880 and screenshotted by
 * `apps/marketing/scripts/capture-article-assets.mts` into
 * `docs/articles/assets/steam-languages.png`.
 *
 * Data is the July 2026 Steam Hardware & Software Survey language table
 * (store.steampowered.com/hwsurvey) — the same numbers the article cites.
 * When the article's numbers are refreshed for a newer survey month,
 * update ROWS and the subtitle together, then re-run `capture:article`.
 *
 * Emphasis design, not a categorical palette: context bars are recessive
 * neutral, Russian is the dark incumbent mass, Ukrainian wears the single
 * brand accent. Identity never rides on color alone — every row carries
 * its name and value as text.
 */

interface LanguageRow {
  name: string;
  /** Percent share, as published by the survey. */
  share: number;
  emphasis?: 'ua' | 'ru';
  note?: string;
}

const ROWS: readonly LanguageRow[] = [
  { name: 'Англійська', share: 39.61 },
  { name: 'Китайська (спрощена)', share: 22.52 },
  { name: 'Російська', share: 9.3, emphasis: 'ru' },
  { name: 'Іспанська (Іспанія)', share: 4.91 },
  { name: 'Португальська (Бразилія)', share: 4.38 },
  { name: 'Німецька', share: 2.82 },
  { name: 'Японська', share: 2.43 },
  { name: 'Французька', share: 2.33 },
  { name: 'Польська', share: 1.74 },
  { name: 'Корейська', share: 1.45 },
  { name: 'Китайська (традиційна)', share: 1.33 },
  { name: 'Турецька', share: 1.24 },
  { name: 'Іспанська (Лат. Америка)', share: 0.89 },
  { name: 'Тайська', share: 0.85 },
  {
    name: 'Українська',
    share: 0.7,
    emphasis: 'ua',
    note: '15-те місце — вже попереду італійської',
  },
  { name: 'Італійська', share: 0.63 },
];

const MAX_SHARE = ROWS[0]?.share ?? 1;
/** Plot width in px for the longest bar (English). */
const PLOT_WIDTH = 660;
/** Floor so sub-percent shares stay visible as a sliver, not a hairline. */
const MIN_BAR_WIDTH = 4;

function formatShare(share: number): string {
  return `${share.toFixed(2).replace('.', ',')}%`;
}

function barColor(emphasis: LanguageRow['emphasis']): string {
  if (emphasis === 'ua') return colorLight.accent;
  if (emphasis === 'ru') return colorLight.ink;
  return NEUTRAL_BAR;
}

export function SteamLanguagesChart(): JSX.Element {
  return (
    <div style={frameStyle}>
      <p style={titleStyle}>Мови, якими користувачі запускають Steam</p>
      <p style={subtitleStyle}>Частка користувачів за мовою клієнта · липень 2026</p>

      <div style={rowsStyle}>
        {ROWS.map((row) => (
          <div key={row.name} style={rowStyle}>
            <span style={row.emphasis ? emphasizedLabelStyle(row.emphasis) : labelStyle}>
              {row.name}
            </span>
            <span
              style={{
                ...barStyle,
                width: Math.max(MIN_BAR_WIDTH, (row.share / MAX_SHARE) * PLOT_WIDTH),
                background: barColor(row.emphasis),
              }}
            />
            <span style={row.emphasis ? emphasizedValueStyle : valueStyle}>
              {formatShare(row.share)}
            </span>
            {row.note === undefined ? null : <span style={noteStyle}>{row.note}</span>}
          </div>
        ))}
      </div>

      <p style={sourceStyle}>
        Джерело: Steam Hardware &amp; Software Survey — store.steampowered.com/hwsurvey
      </p>
    </div>
  );
}

const BG = colorLight.bg;
const INK = colorLight.ink;
const INK_STRONG = colorLight['ink-strong'];
const INK_SOFT = colorLight['ink-soft'];
const INK_FAINT = colorLight['ink-faint'];
const ACCENT_DEEP = colorLight['accent-deep'];
/** Recessive context bar — reads as background mass; values live in the labels. */
const NEUTRAL_BAR = '#d6d3d1';

const LABEL_COLUMN = 290;

const frameStyle: CSSProperties = {
  width: 1200,
  height: 880,
  boxSizing: 'border-box',
  padding: '56px 64px',
  background: BG,
  color: INK,
  fontFamily: fontFamily.sans,
  colorScheme: 'light',
  overflow: 'hidden',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: 34,
  lineHeight: 1.15,
  letterSpacing: letterSpacing.display,
  color: INK_STRONG,
};

const subtitleStyle: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 20,
  color: INK_SOFT,
};

const rowsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  marginTop: 44,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const labelStyle: CSSProperties = {
  width: LABEL_COLUMN,
  flex: 'none',
  textAlign: 'right',
  fontSize: 19,
  lineHeight: 1,
  color: INK,
};

function emphasizedLabelStyle(emphasis: 'ua' | 'ru'): CSSProperties {
  return {
    ...labelStyle,
    fontWeight: 700,
    color: emphasis === 'ua' ? ACCENT_DEEP : INK_STRONG,
  };
}

const barStyle: CSSProperties = {
  flex: 'none',
  height: 18,
  borderRadius: '0 4px 4px 0',
};

const valueStyle: CSSProperties = {
  fontFamily: fontFamily.mono,
  fontSize: 16,
  lineHeight: 1,
  color: INK_SOFT,
};

const emphasizedValueStyle: CSSProperties = {
  ...valueStyle,
  fontWeight: 600,
  color: INK_STRONG,
};

const noteStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: ACCENT_DEEP,
};

const sourceStyle: CSSProperties = {
  margin: '40px 0 0',
  fontSize: 16,
  color: INK_FAINT,
};
