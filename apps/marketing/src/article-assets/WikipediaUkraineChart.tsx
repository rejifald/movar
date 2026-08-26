import type { JSX } from 'react';

import type { WikipediaRow } from '../lib/article-figures';
import { formatShare, wikipedia } from '../lib/article-figures';

import {
  Bar,
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  Label,
  WEIGHT_BOLD,
  WEIGHT_MEDIUM,
  chartColor,
  chartType,
} from './chartKit';

/**
 * Which language edition of Wikipedia readers in Ukraine actually open — the
 * scene for that section of `src/content/blog/movu-rakhuyut.md`, written to
 * `src/content/blog/assets/wikipedia-ukraine.svg`.
 *
 * Figures and limits: `docs/articles/movu-rakhuyut.research.md` §4.
 *
 * **Stacked, unlike the sibling scenes, because here the parts make a whole.**
 * Each row is 100% of the pageviews originating in Ukraine in that period, so
 * a stack shows what the section is about: not that Ukrainian grew, but that
 * it grew *out of* the Russian share. The remainder band is labelled «інші»
 * rather than dropped — an unexplained gap to the right edge would read as a
 * rendering fault, and the residual is real traffic.
 *
 * The rows are NOT like-for-like and the footer says so: 2013 and 2024 are
 * full years, September 2025 is a single month.
 */

interface Band {
  label: string;
  share: number;
  color: string;
  legendColor: string;
  valueColor: string;
}

const FULL_SCALE = 100;
const ROUNDING = 10;

function toBands(row: WikipediaRow): readonly Band[] {
  const other = Math.round((FULL_SCALE - row.uk - row.ru - row.en) * ROUNDING) / ROUNDING;
  return [
    {
      label: 'українська',
      share: row.uk,
      color: chartColor.ua,
      legendColor: chartColor.uaLabel,
      valueColor: chartColor.onUa,
    },
    {
      label: 'російська',
      share: row.ru,
      color: chartColor.ru,
      legendColor: chartColor.inkStrong,
      valueColor: chartColor.onRu,
    },
    {
      label: 'англійська',
      share: row.en,
      color: chartColor.neutral,
      legendColor: chartColor.inkSoft,
      valueColor: chartColor.inkStrong,
    },
    {
      label: 'інші',
      share: other,
      color: chartColor.neutralSoft,
      legendColor: chartColor.inkSoft,
      valueColor: chartColor.inkStrong,
    },
  ];
}

/* Geometry, in frame coordinates. */
const LABEL_COLUMN = 210;
const COLUMN_GAP = 24;
const BAR_X = CONTENT_X + LABEL_COLUMN + COLUMN_GAP;
const BAR_WIDTH = CONTENT_WIDTH - LABEL_COLUMN - COLUMN_GAP;
const BAR_HEIGHT = 62;
const ROW_PITCH = 88;
/** Below this width a band cannot hold its own percentage legibly. */
const INLINE_VALUE_MIN_WIDTH = 74;
const PERIOD_BASELINE = 30;
const NOTE_BASELINE = 56;
const VALUE_BASELINE = 39;
const LEGEND_GAP = 34;
const SWATCH = 14;
const SWATCH_TEXT_GAP = 8;
const LEGEND_ITEM_WIDTH = 150;

const LEGEND_BANDS = toBands(wikipedia.rows[0]);

export function WikipediaUkraineChart(): JSX.Element {
  const legendY = CONTENT_TOP + wikipedia.rows.length * ROW_PITCH + LEGEND_GAP;

  return (
    <ChartFrame
      height={600}
      title="Яку Wikipedia читають в Україні"
      subtitle="Частка переглядів, що надходять з України, за мовним розділом"
      label="Три смуги, поділені за мовами: у 2013 році з України 71,1% переглядів припадало на російську Wikipedia і 16,4% на українську; у 2024-му — 45,0% і 39,2%; у вересні 2025-го — 45,7% і 33,6%"
      source={[
        'Джерело: статистика Wikimedia, наведена у статті «Українська Вікіпедія», та дані Chytomo.',
        'Рядки за 2013 і 2024 роки — річні, останній — за один місяць, тож порівнювати їх навпростець не можна.',
      ]}
    >
      {wikipedia.rows.map((row, rowIndex) => {
        const top = CONTENT_TOP + rowIndex * ROW_PITCH;
        let offset = 0;
        return (
          <g key={row.period}>
            <Label
              x={CONTENT_X + LABEL_COLUMN}
              y={top + PERIOD_BASELINE}
              anchor="end"
              size={chartType.blockHeading}
              weight={WEIGHT_BOLD}
              fill={chartColor.inkStrong}
              numeric
            >
              {row.period}
            </Label>
            <Label
              x={CONTENT_X + LABEL_COLUMN}
              y={top + NOTE_BASELINE}
              anchor="end"
              size={chartType.blockCaption}
              fill={chartColor.inkFaint}
            >
              {row.note}
            </Label>

            {toBands(row).map((band) => {
              const width = (band.share / FULL_SCALE) * BAR_WIDTH;
              const x = BAR_X + offset;
              offset += width;
              return (
                <g key={band.label}>
                  <Bar x={x} y={top} width={width} height={BAR_HEIGHT} fill={band.color} />
                  {width < INLINE_VALUE_MIN_WIDTH ? null : (
                    <Label
                      x={x + width / 2}
                      y={top + VALUE_BASELINE}
                      anchor="middle"
                      size={chartType.value}
                      weight={WEIGHT_MEDIUM}
                      fill={band.valueColor}
                      numeric
                    >
                      {formatShare(band.share)}
                    </Label>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Legend: identity never rides on colour alone. */}
      {LEGEND_BANDS.map((band, index) => {
        const x = BAR_X + index * LEGEND_ITEM_WIDTH;
        return (
          <g key={band.label}>
            <rect
              x={x}
              y={legendY - SWATCH + 2}
              width={SWATCH}
              height={SWATCH}
              rx={3}
              fill={band.color}
            />
            <Label
              x={x + SWATCH + SWATCH_TEXT_GAP}
              y={legendY}
              size={chartType.blockCaption}
              weight={WEIGHT_MEDIUM}
              fill={band.legendColor}
            >
              {band.label}
            </Label>
          </g>
        );
      })}
    </ChartFrame>
  );
}
