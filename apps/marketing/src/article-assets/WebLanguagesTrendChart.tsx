import type { JSX } from 'react';

import { formatShare, web, webFirst, webLast, webPeakUkrainian } from '../lib/article-figures';

import {
  BASELINE_NUDGE,
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  FONT,
  Label,
  TREND_DOT_RADIUS,
  TREND_LINE_WIDTH,
  WEIGHT_BOLD,
  YAxis,
  chartColor,
  chartType,
  linearTicks,
} from './chartKit';

/**
 * Content-language share of the web, 2015–2026 — the long-arc scene for
 * `src/content/blog/movu-rakhuyut.md`, written to
 * `src/content/blog/assets/web-languages-trend.svg` by
 * `scripts/gen-article-charts.mts`.
 *
 * Data and methodology: `docs/articles/movu-rakhuyut.research.md` §5. Points
 * 2015–2025 are the 1 January readings; the last is 26 August 2026, which is
 * why its axis label carries the month.
 *
 * **A line chart, not bars, because the shape is the argument.** The section
 * exists to stop a triumphalist reading: Russian's fall from 8,6% is far
 * larger than Ukrainian's rise to 0,6%, and two lines make that non-transfer
 * visible in a way a pair of end-point bars would hide. Both are drawn on one
 * shared linear axis — a second axis for Ukrainian, or a log scale, would
 * flatter the comparison by construction. The cost is a Ukrainian line that
 * hugs the baseline, so the end labels carry both values as text.
 */

const POINTS = web.points;

/* Geometry, in frame coordinates. The three horizontal spans sum to
 * CONTENT_WIDTH so the end labels sit inside the frame. */
const AXIS_GUTTER = 56;
const END_GUTTER = 216;
const PLOT_X = CONTENT_X + AXIS_GUTTER;
const PLOT_W = CONTENT_WIDTH - AXIS_GUTTER - END_GUTTER;
const PLOT_TOP_GAP = 18;
const PLOT_Y = CONTENT_TOP + PLOT_TOP_GAP;
const PLOT_H = 430;

const Y_MAX = 9;
const Y_TICK_STEP = 3;
const Y_TICKS = linearTicks(Y_MAX, Y_TICK_STEP);
const YEAR_LABEL_OFFSET = 34;
const YEAR_LABEL_LEADING = 20;
const END_LABEL_GAP = 18;
const PEAK_LABEL_LIFT = 20;

function x(index: number): number {
  return PLOT_X + (index / (POINTS.length - 1)) * PLOT_W;
}

function y(share: number): number {
  return PLOT_Y + (1 - share / Y_MAX) * PLOT_H;
}

interface Series {
  label: string;
  color: string;
  labelColor: string;
  shares: readonly number[];
}

const SERIES: readonly Series[] = [
  {
    // Russian: the incumbent mass, drawn in ink.
    label: 'російська',
    color: chartColor.inkStrong,
    labelColor: chartColor.inkStrong,
    shares: POINTS.map((point) => point.ru),
  },
  {
    // Ukrainian: the single brand accent.
    label: 'українська',
    color: chartColor.ua,
    labelColor: chartColor.uaLabel,
    shares: POINTS.map((point) => point.uk),
  },
];

function formatWholePercent(tick: number): string {
  return `${tick}%`;
}

function toPath(shares: readonly number[]): string {
  return shares
    .map((share, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(share)}`)
    .join(' ');
}

const LAST_INDEX = POINTS.length - 1;
const PEAK_INDEX = POINTS.findIndex((point) => point.year === web.peakYear);
const PEAK_SHARE = POINTS[PEAK_INDEX]?.ru ?? 0;

/** «серп.\n2026» → «2026»: an axis label's last line is always its year. */
const LAST_YEAR = webLast.year.split('\n').at(-1) ?? webLast.year;

/*
 * The accessible name, composed from the series it describes.
 *
 * Written out, it was a sixth copy of these figures and the only one no check
 * could reach — `check:charts` compares a fresh render against the committed
 * file, and a stale label is identical in both. The Ukrainian half quotes its
 * highest reading rather than a year, because the section's claim is the size
 * of the band the line moves inside, not when the top of it happens.
 */
const LABEL =
  `Графік часток вмісту в вебі з ${webFirst.year} до ${LAST_YEAR} року: російська піднімається з ` +
  `${formatShare(webFirst.ru)} до піку ${formatShare(PEAK_SHARE)} у ${web.peakYear} році й падає до ` +
  `${formatShare(webLast.ru)}, українська повільно зростає з ${formatShare(webFirst.uk)} до ` +
  `${formatShare(webLast.uk)}, найвище значення — ${formatShare(webPeakUkrainian())}`;

export function WebLanguagesTrendChart(): JSX.Element {
  return (
    <ChartFrame
      height={780}
      title="Якою мовою написані сайти"
      subtitle="Частка сайтів за мовою вмісту, 2015–2026"
      label={LABEL}
      source={[
        'Джерело: W3Techs — w3techs.com. Точки 2015–2025 — станом на 1 січня, остання — на 26 серпня 2026 року.',
      ]}
    >
      <YAxis x={PLOT_X} width={PLOT_W} ticks={Y_TICKS} toY={y} format={formatWholePercent} />

      {POINTS.map((point, index) => (
        <text
          key={point.year}
          y={PLOT_Y + PLOT_H + YEAR_LABEL_OFFSET}
          textAnchor="middle"
          fill={chartColor.inkSoft}
          fontFamily={FONT}
          fontSize={chartType.axis}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {point.year.split('\n').map((line, lineIndex) => (
            <tspan key={line} x={x(index)} dy={lineIndex === 0 ? 0 : YEAR_LABEL_LEADING}>
              {line}
            </tspan>
          ))}
        </text>
      ))}

      {SERIES.map((series) => (
        <path
          key={series.label}
          d={toPath(series.shares)}
          fill="none"
          stroke={series.color}
          strokeWidth={TREND_LINE_WIDTH}
        />
      ))}

      <circle
        cx={x(PEAK_INDEX)}
        cy={y(PEAK_SHARE)}
        r={TREND_DOT_RADIUS}
        fill={chartColor.inkStrong}
      />
      <Label
        x={x(PEAK_INDEX)}
        y={y(PEAK_SHARE) - PEAK_LABEL_LIFT}
        anchor="middle"
        size={chartType.annotation}
        weight={WEIGHT_BOLD}
        fill={chartColor.inkStrong}
        numeric
      >
        {`пік ${formatShare(PEAK_SHARE)}`}
      </Label>

      {SERIES.map((series) => {
        const last = series.shares.at(-1) ?? 0;
        return (
          <g key={series.label}>
            <circle cx={x(LAST_INDEX)} cy={y(last)} r={TREND_DOT_RADIUS} fill={series.color} />
            <Label
              x={x(LAST_INDEX) + END_LABEL_GAP}
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
