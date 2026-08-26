import type { JSX } from 'react';

import {
  delta,
  formatShare,
  ratio,
  steam,
  steamClimbEnd,
  steamLatest,
  steamStall,
} from '../lib/article-figures';

import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  Label,
  WEIGHT_BOLD,
  YAxis,
  chartColor,
  chartType,
} from './chartKit';

/**
 * Share of Steam users running the client in Ukrainian, early 2022 → July 2026
 * — the scene for the Steam section of `src/content/blog/movu-rakhuyut.md`,
 * written to `src/content/blog/assets/steam-ukrainian-trend.svg`.
 *
 * Figures and sources: `docs/articles/movu-rakhuyut.research.md` §1.
 *
 * **The x axis is real elapsed time, not one slot per reading.** The published
 * readings are unevenly spaced — four land inside nineteen months, then the
 * next two are twenty-one and fourteen months later — so equal intervals would
 * draw a gentle continuous climb. The truth is a steep rise that ran out: the
 * last three readings span more months than the first four and add an eighth
 * as much, so the tail has to *look* long.
 *
 * The bracket quotes the size of the later drift rather than calling the tail
 * flat, because it is not flat — it climbs and settles slightly lower. A
 * measured change is checkable against the labelled points beside it;
 * "plateau" is a characterisation the picture itself would contradict. Both
 * the bracket and the article's sentence compute from the same two readings.
 *
 * Russian (9,30% in the same survey) is deliberately absent from the plot: on
 * a shared axis it would compress this series into the baseline. It is stated
 * in the footer, where it reads as the ratio it is rather than as a line
 * thirteen times taller than the subject.
 */

const READINGS = steam.readings;

/** Year gridlines, as month offsets from January 2022. */
const YEAR_TICKS: readonly { month: number; label: string }[] = [
  { month: 0, label: '2022' },
  { month: 12, label: '2023' },
  { month: 24, label: '2024' },
  { month: 36, label: '2025' },
  { month: 48, label: '2026' },
];

/* Geometry, in frame coordinates. */
const AXIS_GUTTER = 62;
const END_GUTTER = 26;
const PLOT_X = CONTENT_X + AXIS_GUTTER;
const PLOT_W = CONTENT_WIDTH - AXIS_GUTTER - END_GUTTER;
/** Head-room for the bracket and its label, which sit above the plot. */
const BRACKET_HEADROOM = 74;
const PLOT_Y = CONTENT_TOP + BRACKET_HEADROOM;
const PLOT_H = 350;
const MONTH_MAX = 56;

const Y_MAX = 0.8;
const Y_TICK_STEP = 0.2;
const Y_TICK_COUNT = 5;
const Y_TICKS: readonly number[] = Array.from(
  { length: Y_TICK_COUNT },
  (_unused, index) => index * Y_TICK_STEP,
);

const LINE_WIDTH = 4;
const DOT_RADIUS = 6;
const YEAR_LABEL_OFFSET = 30;
const VALUE_LIFT = 18;
const FIRST_VALUE_DROP = 26;
const BRACKET_LIFT = 46;
const BRACKET_TICK = 8;
const BRACKET_LABEL_LIFT = 12;

function x(month: number): number {
  return PLOT_X + (month / MONTH_MAX) * PLOT_W;
}

function y(share: number): number {
  return PLOT_Y + (1 - share / Y_MAX) * PLOT_H;
}

const LINE_PATH = READINGS.map(
  (reading, index) => `${index === 0 ? 'M' : 'L'}${x(reading.month)} ${y(reading.share)}`,
).join(' ');

const BRACKET_Y = PLOT_Y - BRACKET_LIFT;
const BRACKET_FROM = x(steamClimbEnd.month);
const BRACKET_TO = x(steamLatest.month);

export function SteamUkrainianTrendChart(): JSX.Element {
  return (
    <ChartFrame
      height={730}
      title="Скільки людей запускають Steam українською"
      subtitle="Частка серед усіх користувачів Steam у світі"
      label="Графік частки української мови в Steam: 0,17% на початку 2022 року, 0,34% у жовтні 2022-го, 0,50% у березні 2023-го, 0,64% у серпні 2023-го, далі майже без змін — 0,73% у травні 2025-го і 0,70% у липні 2026-го"
      source={[
        `Джерело: опитування Steam про обладнання та програми — store.steampowered.com/hwsurvey.`,
        `Для порівняння: російською в тому ж липневому опитуванні — ${formatShare(steam.russianShare, 2)}, тобто у ${ratio(steam.russianShare, steamLatest.share)} більше.`,
      ]}
    >
      <YAxis x={PLOT_X} width={PLOT_W} ticks={Y_TICKS} toY={y} format={formatShare} />

      {YEAR_TICKS.map((tick) => (
        <Label
          key={tick.label}
          x={x(tick.month)}
          y={PLOT_Y + PLOT_H + YEAR_LABEL_OFFSET}
          anchor="middle"
          size={chartType.axis}
          fill={chartColor.inkSoft}
          numeric
        >
          {tick.label}
        </Label>
      ))}

      {/* The bracket: the section's actual claim, drawn rather than asserted. */}
      <path
        d={`M${BRACKET_FROM} ${BRACKET_Y + BRACKET_TICK} L${BRACKET_FROM} ${BRACKET_Y} L${BRACKET_TO} ${BRACKET_Y} L${BRACKET_TO} ${BRACKET_Y + BRACKET_TICK}`}
        fill="none"
        stroke={chartColor.inkFaint}
        strokeWidth={1}
      />
      <Label
        x={(BRACKET_FROM + BRACKET_TO) / 2}
        y={BRACKET_Y - BRACKET_LABEL_LIFT}
        anchor="middle"
        size={chartType.annotation}
        weight={WEIGHT_BOLD}
        fill={chartColor.inkSoft}
        numeric
      >
        {`далі — плюс ${delta(steamStall.from, steamStall.to)} за майже три роки`}
      </Label>

      <path d={LINE_PATH} fill="none" stroke={chartColor.ua} strokeWidth={LINE_WIDTH} />

      {READINGS.map((reading, index) => (
        <g key={reading.label}>
          <circle cx={x(reading.month)} cy={y(reading.share)} r={DOT_RADIUS} fill={chartColor.ua} />
          <Label
            x={x(reading.month)}
            y={y(reading.share) + (index === 0 ? FIRST_VALUE_DROP : -VALUE_LIFT)}
            anchor="middle"
            size={chartType.value}
            weight={WEIGHT_BOLD}
            fill={chartColor.uaLabel}
            numeric
          >
            {formatShare(reading.share, 2)}
          </Label>
        </g>
      ))}
    </ChartFrame>
  );
}
