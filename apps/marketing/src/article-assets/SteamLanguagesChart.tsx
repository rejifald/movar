import type { JSX } from 'react';

import type { SurveyLanguage } from '../lib/article-figures';
import { formatShare, steamSurvey } from '../lib/article-figures';

import {
  Bar,
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  Label,
  WEIGHT_BOLD,
  WEIGHT_MEDIUM,
  WEIGHT_REGULAR,
  chartColor,
  chartType,
  emphasisInk,
} from './chartKit';

/**
 * Steam client-language ranking — the scene for
 * `src/content/blog/tykha-kapitulyatsiya.md`, written to
 * `src/content/blog/assets/steam-languages.svg`.
 *
 * The table comes from `src/lib/article-figures.ts`, not a local copy. It is
 * the same published survey `SteamUkrainianTrendChart` ends on, in a different
 * article — the two used to hold separate transcriptions of one month's
 * numbers, so refreshing one would have left the other a month behind.
 * `article-figures.test.ts` pins the trend's last reading to this table's
 * Ukrainian row.
 *
 * Emphasis design, not a categorical palette: context bars are recessive
 * neutral, Russian is the dark incumbent mass, Ukrainian wears the single
 * brand accent. Every row carries its name and value as text, so identity
 * never rides on colour alone.
 */

const ROWS = steamSurvey.languages;
/** Longest bar. Computed, so the scene does not depend on the table staying sorted. */
const MAX_SHARE = Math.max(...ROWS.map((row) => row.share));

const LABEL_COLUMN = 290;
const GAP = 14;
const VALUE_COLUMN = 96;
const NOTE_COLUMN = 30;
const BAR_X = CONTENT_X + LABEL_COLUMN + GAP;
const PLOT_WIDTH = CONTENT_WIDTH - LABEL_COLUMN - GAP - VALUE_COLUMN - NOTE_COLUMN;
const BAR_HEIGHT = 18;
const ROW_PITCH = 38;
/** Baseline offset that centres label type on its bar. */
const LABEL_CENTRE = 14;
/** Floor so sub-percent shares stay visible as a sliver, not a hairline. */
const MIN_BAR_WIDTH = 4;
const NAME_SIZE = 19;
const NOTE_SIZE = 17;
/** Room under the last row for the source line. */
const FOOTER_SPACE = 96;

function barColor(emphasis: SurveyLanguage['emphasis']): string {
  if (emphasis === 'ua') return chartColor.ua;
  if (emphasis === 'ru') return chartColor.ru;
  return chartColor.neutral;
}

interface SurveyRowProps {
  row: SurveyLanguage;
  /** Top edge of this row's bar, in frame coordinates. */
  top: number;
}

/**
 * Type treatment for a row, chosen once.
 *
 * Asking `row.emphasis` separately for weight, value weight and value ink put
 * three branches in the render for one decision. One lookup, three reads.
 */
function rowStyle(emphasis: SurveyLanguage['emphasis']) {
  return emphasis === undefined
    ? { name: WEIGHT_REGULAR, value: WEIGHT_REGULAR, valueInk: chartColor.inkSoft }
    : { name: WEIGHT_BOLD, value: WEIGHT_MEDIUM, valueInk: chartColor.inkStrong };
}

function SurveyRow({ row, top }: Readonly<SurveyRowProps>): JSX.Element {
  const width = Math.max(MIN_BAR_WIDTH, (row.share / MAX_SHARE) * PLOT_WIDTH);
  const style = rowStyle(row.emphasis);

  return (
    <g>
      <Label
        x={CONTENT_X + LABEL_COLUMN}
        y={top + LABEL_CENTRE}
        anchor="end"
        size={NAME_SIZE}
        weight={style.name}
        fill={emphasisInk(row.emphasis)}
      >
        {row.name}
      </Label>
      <Bar
        x={BAR_X}
        y={top}
        width={width}
        height={BAR_HEIGHT}
        fill={barColor(row.emphasis)}
        rounded
      />
      <Label
        x={BAR_X + width + GAP}
        y={top + LABEL_CENTRE}
        size={chartType.value}
        weight={style.value}
        fill={style.valueInk}
        numeric
      >
        {formatShare(row.share, 2)}
      </Label>
      <RowNote note={row.note} x={BAR_X + width + GAP + VALUE_COLUMN} y={top + LABEL_CENTRE} />
    </g>
  );
}

/** Only Ukrainian carries one; absent for every other row. */
function RowNote({
  note,
  x,
  y,
}: Readonly<{ note: string | undefined; x: number; y: number }>): JSX.Element | null {
  if (note === undefined) return null;
  return (
    <Label x={x} y={y} size={NOTE_SIZE} weight={WEIGHT_MEDIUM} fill={chartColor.uaLabel}>
      {note}
    </Label>
  );
}

export function SteamLanguagesChart(): JSX.Element {
  return (
    <ChartFrame
      height={CONTENT_TOP + ROWS.length * ROW_PITCH + FOOTER_SPACE}
      title="Мови, якими користувачі запускають Steam"
      subtitle={`Частка користувачів за мовою клієнта · ${steamSurvey.month}`}
      label="Стовпчикова діаграма мов клієнтів Steam за липень 2026: російська третя з 9,30%, українська пʼятнадцята з 0,70%, одразу попереду італійської з 0,63%"
      source={['Джерело: Steam Hardware & Software Survey — store.steampowered.com/hwsurvey']}
    >
      {ROWS.map((row, index) => (
        <SurveyRow key={row.name} row={row} top={CONTENT_TOP + index * ROW_PITCH} />
      ))}
    </ChartFrame>
  );
}
