import type { JSX } from 'react';

import { firefox, firefoxFirst, firefoxLatest, formatShare, ratio } from '../lib/article-figures';

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
 * Firefox Desktop interface locale among clients in Ukraine, February 2021 →
 * August 2026 — the scene for the Firefox section of
 * `src/content/blog/movu-rakhuyut.md`, written to
 * `src/content/blog/assets/firefox-ukraine.svg`.
 *
 * Figures and limits: `docs/articles/movu-rakhuyut.research.md` §1b.
 *
 * **Three lines, not two.** Every other setting scene in the post can leave
 * English out; this one cannot. English is the third-largest reading here and
 * it *rose* across the same window Russian fell — so a two-line version would
 * draw the exact conclusion the article spends the W3Techs section refusing.
 * The third line is the section's counter-figure, and it is in the picture
 * rather than in a footnote.
 *
 * **The x axis is real elapsed time.** Six of the seven anchors are a year
 * apart and the last is eight months after its predecessor; equal slots would
 * stretch that final segment into a full year and overstate the recent move.
 * Weeks since the first reading, the same treatment the Steam scene gets.
 *
 * **No stacking.** The three shares do not make a whole — `pl`, `de`, `und`
 * and the other English variants are in the same table and are not drawn — so
 * stacking would invent a remainder the source never published.
 */

const READINGS = firefox.readings;

/** Year gridlines, as week offsets from the first reading (1 February 2021). */
const YEAR_TICKS: readonly { week: number; label: string }[] = [
  { week: 0, label: '2021' },
  { week: 48, label: '2022' },
  { week: 100, label: '2023' },
  { week: 152, label: '2024' },
  { week: 205, label: '2025' },
  { week: 257, label: '2026' },
];

/* Geometry, in frame coordinates. The three horizontal spans sum to
 * CONTENT_WIDTH so the end labels stay inside the frame. */
const AXIS_GUTTER = 56;
const END_GUTTER = 208;
const PLOT_X = CONTENT_X + AXIS_GUTTER;
const PLOT_W = CONTENT_WIDTH - AXIS_GUTTER - END_GUTTER;
const PLOT_TOP_GAP = 18;
const PLOT_Y = CONTENT_TOP + PLOT_TOP_GAP;
const PLOT_H = 430;

const WEEK_MAX = 289;
const Y_MAX = 80;
const Y_TICK_STEP = 20;
const Y_TICKS: readonly number[] = Array.from(
  { length: Y_MAX / Y_TICK_STEP + 1 },
  (_unused, index) => index * Y_TICK_STEP,
);

const LINE_WIDTH = 4;
const DOT_RADIUS = 7;
/** Puts a text baseline on the optical centre of its anchor. */
const BASELINE_NUDGE = 6;
const YEAR_LABEL_OFFSET = 34;
const END_LABEL_GAP = 18;

function x(week: number): number {
  return PLOT_X + (week / WEEK_MAX) * PLOT_W;
}

function y(share: number): number {
  return PLOT_Y + (1 - share / Y_MAX) * PLOT_H;
}

function formatWholePercent(tick: number): string {
  return `${tick}%`;
}

interface Series {
  label: string;
  color: string;
  labelColor: string;
  shares: readonly number[];
}

const SERIES: readonly Series[] = [
  {
    // The incumbent mass, drawn in ink — still the majority reading.
    label: 'російська',
    color: chartColor.inkStrong,
    labelColor: chartColor.inkStrong,
    shares: READINGS.map((reading) => reading.ru),
  },
  {
    // The single brand accent.
    label: 'українська',
    color: chartColor.ua,
    labelColor: chartColor.uaLabel,
    shares: READINGS.map((reading) => reading.uk),
  },
  {
    // Context that must not compete, but must be visible: it rose too.
    label: 'англійська',
    color: chartColor.inkFaint,
    labelColor: chartColor.inkSoft,
    shares: READINGS.map((reading) => reading.en),
  },
];

function toPath(shares: readonly number[]): string {
  return READINGS.map(
    (reading, index) => `${index === 0 ? 'M' : 'L'}${x(reading.week)} ${y(shares[index] ?? 0)}`,
  ).join(' ');
}

const LAST_INDEX = READINGS.length - 1;

/*
 * The accessible name, composed from the readings rather than written out.
 *
 * `check:charts` re-renders and compares bytes, so a hand-typed label that
 * still announced 2025's numbers would be identical on both sides and pass —
 * and it is the whole of this scene for a screen-reader user. The English pair
 * is named for the same reason the third line is drawn.
 */
const LABEL =
  `Графік мовних налаштувань Firefox Desktop в Україні за реальною шкалою часу, ` +
  `${firefoxFirst.label} — ${firefoxLatest.label}: російська спадає з ` +
  `${formatShare(firefoxFirst.ru)} до ${formatShare(firefoxLatest.ru)}, українська зростає з ` +
  `${formatShare(firefoxFirst.uk)} до ${formatShare(firefoxLatest.uk)}, англійська — з ` +
  `${formatShare(firefoxFirst.en)} до ${formatShare(firefoxLatest.en)}`;

export function FirefoxUkraineChart(): JSX.Element {
  return (
    <ChartFrame
      height={780}
      title="Якою мовою відкрито браузер в Україні"
      subtitle="Частка мовних налаштувань Firefox Desktop серед користувачів з України"
      label={LABEL}
      source={[
        'Джерело: Firefox Public Data Report, регіон Ukraine — data.firefox.com/dashboard/usage-behavior.',
        `Щотижневий ряд, ${firefoxFirst.label} — ${firefoxLatest.label}; на графіку сім замірів із нього. Російська попереду української у ${ratio(firefoxLatest.ru, firefoxLatest.uk, 2)}.`,
      ]}
    >
      <YAxis x={PLOT_X} width={PLOT_W} ticks={Y_TICKS} toY={y} format={formatWholePercent} />

      {YEAR_TICKS.map((tick) => (
        <Label
          key={tick.label}
          x={x(tick.week)}
          y={PLOT_Y + PLOT_H + YEAR_LABEL_OFFSET}
          anchor="middle"
          size={chartType.axis}
          fill={chartColor.inkSoft}
          numeric
        >
          {tick.label}
        </Label>
      ))}

      {SERIES.map((series) => (
        <path
          key={series.label}
          d={toPath(series.shares)}
          fill="none"
          stroke={series.color}
          strokeWidth={LINE_WIDTH}
        />
      ))}

      {SERIES.map((series) => {
        const first = series.shares[0] ?? 0;
        const last = series.shares[LAST_INDEX] ?? 0;
        return (
          <g key={series.label}>
            <circle cx={x(0)} cy={y(first)} r={DOT_RADIUS} fill={series.color} />
            <circle cx={x(WEEK_MAX)} cy={y(last)} r={DOT_RADIUS} fill={series.color} />
            <Label
              x={x(WEEK_MAX) + END_LABEL_GAP}
              y={y(last) + BASELINE_NUDGE}
              size={chartType.endLabel}
              weight={WEIGHT_BOLD}
              fill={series.labelColor}
              numeric
            >
              {`${series.label} ${formatShare(last)}`}
            </Label>
          </g>
        );
      })}
    </ChartFrame>
  );
}
