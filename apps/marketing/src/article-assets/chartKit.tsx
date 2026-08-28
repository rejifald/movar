import type { JSX, ReactNode } from 'react';

/**
 * SVG primitives shared by every article chart.
 *
 * **These scenes are markup, not screenshots.** They used to be React rendered
 * in Storybook and photographed by headless Chromium, which made the committed
 * PNG a function of the machine that ran it — its Chromium build, its font
 * rasterisation, its OS. Now `scripts/gen-article-charts.mts` renders each
 * component to an SVG string with `renderToStaticMarkup`, and that string is a
 * pure function of the data in `src/lib/article-figures.ts`. Same input, same
 * bytes, on any machine, with no browser in the pipeline at all.
 *
 * The SVG is then **inlined into the page** by `plugins/remark-inline-chart.mjs`
 * rather than referenced with `<img src>`. That matters for one specific
 * reason: an SVG loaded through `<img>` is an isolated document that cannot
 * reach the page's fonts or CSS variables, so the brand typeface would
 * silently fall back and the chart could not follow the theme. Inlined, it
 * inherits both.
 *
 * Two consequences worth knowing before editing a scene:
 *
 * 1. **Layout is arithmetic.** There is no flexbox and no text measurement, so
 *    a column is a number and a wrapped caption is an explicit array of lines
 *    (`source`, `Lines`). Nothing re-flows if a label grows — look at the
 *    render.
 * 2. **Type is Manrope only.** The marketing site loads Manrope and no mono
 *    face (`styles/global.css`), and an inlined SVG can only use what the page
 *    already has. Numerals therefore use Manrope with `tabular-nums`, which
 *    keeps columns aligned without shipping a second family site-wide.
 */

/**
 * Colours as CSS custom properties, with the light value as fallback.
 *
 * The `var(...)` half is what lets an inlined chart follow the page into dark
 * mode; the fallback is what keeps the file legible opened on its own. The
 * `--chart-*` tokens are defined in `styles/global.css`, so the light/dark
 * decision lives with the rest of the site's theming instead of being frozen
 * into every scene.
 */
export const chartColor = {
  bg: 'var(--chart-bg, #FAFAF9)',
  ink: 'var(--chart-ink, #44403C)',
  inkStrong: 'var(--chart-ink-strong, #1C1917)',
  inkSoft: 'var(--chart-ink-soft, #78716C)',
  inkFaint: 'var(--chart-ink-faint, #A8A29E)',
  grid: 'var(--chart-grid, #E7E5E4)',
  /** The language the reader asked for. */
  ua: 'var(--chart-ua, #15803D)',
  /** Label ink for `ua` — lightens in dark mode, where the fill reads too dark as text. */
  uaLabel: 'var(--chart-ua-label, #14532D)',
  /** The imposed default: reads as mass, never as a "bad" colour. */
  ru: 'var(--chart-ru, #44403C)',
  /** Context that must not compete. */
  neutral: 'var(--chart-neutral, #D6D3D1)',
  /** Second context tone, for a third stacked band. */
  neutralSoft: 'var(--chart-neutral-soft, #EBE9E7)',
  /*
   * Foregrounds for text sitting *on* a filled band. Two tokens, not one,
   * because the fills invert differently between themes: the accent stays a
   * dark forest green in both (so its text is always light), while the ink
   * band flips from near-black to near-white and its text has to flip with it.
   */
  onUa: 'var(--chart-on-ua, #FFFFFF)',
  onRu: 'var(--chart-on-ru, #FFFFFF)',
} as const;

/** Label ink for an emphasised row. Extracted so no scene nests ternaries. */
export function emphasisInk(emphasis: 'ua' | 'ru' | undefined): string {
  if (emphasis === 'ua') return chartColor.uaLabel;
  if (emphasis === 'ru') return chartColor.inkStrong;
  return chartColor.ink;
}

export const chartType = {
  title: 34,
  subtitle: 20,
  barLabel: 18,
  value: 16,
  axis: 16,
  blockHeading: 21,
  blockCaption: 17,
  annotation: 18,
  endLabel: 19,
  source: 16,
} as const;

export const FONT = 'Manrope, ui-sans-serif, system-ui, sans-serif';
export const WEIGHT_REGULAR = 400;
export const WEIGHT_BOLD = 700;
const WEIGHT_DISPLAY = 800;
export const WEIGHT_MEDIUM = 600;

/* Frame geometry, in SVG user units (1 unit = 1 CSS px at natural size). */
const FRAME_WIDTH = 1200;
const PAD_X = 64;
const PAD_TOP = 56;
const PAD_BOTTOM = 52;
export const CONTENT_X = PAD_X;
export const CONTENT_WIDTH = FRAME_WIDTH - PAD_X * 2;

/* Baselines, not top edges: SVG text is positioned by its baseline. */
const TITLE_CAP_HEIGHT = 30;
const TITLE_TO_SUBTITLE = 34;
const SUBTITLE_TO_CONTENT = 30;
const TITLE_BASELINE = PAD_TOP + TITLE_CAP_HEIGHT;
const SUBTITLE_BASELINE = TITLE_BASELINE + TITLE_TO_SUBTITLE;
/** Where a scene's own content may start. */
export const CONTENT_TOP = SUBTITLE_BASELINE + SUBTITLE_TO_CONTENT;
const SOURCE_LINE_HEIGHT = 23;

interface ChartFrameProps {
  /** Total scene height. Must leave room for the source lines. */
  height: number;
  title: string;
  subtitle: string;
  /**
   * Attribution, one array entry per rendered line.
   *
   * Explicit because nothing here measures text: a single long string would
   * run off the edge rather than wrap. Always names the source, and dates it
   * when it can go stale.
   */
  source: readonly string[];
  /** Alt text, surfaced to assistive tech since there is no `<img alt>`. */
  label: string;
  children: ReactNode;
}

export function ChartFrame({
  height,
  title,
  subtitle,
  source,
  label,
  children,
}: Readonly<ChartFrameProps>): JSX.Element {
  const sourceTop = height - PAD_BOTTOM - (source.length - 1) * SOURCE_LINE_HEIGHT;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${FRAME_WIDTH} ${height}`}
      role="img"
      aria-label={label}
      className="m-chart"
    >
      <rect width={FRAME_WIDTH} height={height} fill={chartColor.bg} />

      <text
        x={CONTENT_X}
        y={TITLE_BASELINE}
        fontFamily={FONT}
        fontSize={chartType.title}
        fontWeight={WEIGHT_DISPLAY}
        letterSpacing="-0.5"
        fill={chartColor.inkStrong}
      >
        {title}
      </text>
      <text
        x={CONTENT_X}
        y={SUBTITLE_BASELINE}
        fontFamily={FONT}
        fontSize={chartType.subtitle}
        fill={chartColor.inkSoft}
      >
        {subtitle}
      </text>

      {children}

      {source.map((line, index) => (
        <text
          key={line}
          x={CONTENT_X}
          y={sourceTop + index * SOURCE_LINE_HEIGHT}
          fontFamily={FONT}
          fontSize={chartType.source}
          fill={chartColor.inkFaint}
        >
          {line}
        </text>
      ))}
    </svg>
  );
}

interface LabelProps {
  x: number;
  /** Baseline, not the top edge. */
  y: number;
  children: ReactNode;
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Tabular figures, so stacked numbers line up without a mono face. */
  numeric?: boolean;
}

export function Label({
  x,
  y,
  children,
  size = chartType.barLabel,
  weight = WEIGHT_REGULAR,
  fill = chartColor.ink,
  anchor = 'start',
  numeric = false,
}: Readonly<LabelProps>): JSX.Element {
  return (
    <text
      x={x}
      y={y}
      fontFamily={FONT}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      textAnchor={anchor}
      style={numeric ? { fontVariantNumeric: 'tabular-nums' } : undefined}
    >
      {children}
    </text>
  );
}

interface LinesProps {
  x: number;
  /** Baseline of the first line. */
  y: number;
  lines: readonly string[];
  lineHeight: number;
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
}

/** Several pre-broken lines. See `ChartFrameProps.source` on why they are pre-broken. */
export function Lines({
  x,
  y,
  lines,
  lineHeight,
  size = chartType.barLabel,
  weight = WEIGHT_REGULAR,
  fill = chartColor.ink,
  anchor = 'start',
}: Readonly<LinesProps>): JSX.Element {
  return (
    <>
      {lines.map((line, index) => (
        <Label
          key={line}
          x={x}
          y={y + index * lineHeight}
          size={size}
          weight={weight}
          fill={fill}
          anchor={anchor}
        >
          {line}
        </Label>
      ))}
    </>
  );
}

/** Matches the `0 4px 4px 0` the flexbox scenes used before the SVG rewrite. */
const BAR_CORNER_RADIUS = 4;

interface YAxisProps {
  /** Left edge of the plot; gridlines start here and labels sit to their left. */
  x: number;
  width: number;
  /** Values to draw a gridline and a label for. */
  ticks: readonly number[];
  /** Maps a tick value to its baseline in frame coordinates. */
  toY: (value: number) => number;
  /** How the tick reads — the two trend scenes disagree on decimals. */
  format: (value: number) => string;
}

/** Horizontal gridlines with their value labels: shared by the trend scenes,
 *  which otherwise held the same twenty lines twice. */
export function YAxis({ x, width, ticks, toY, format }: Readonly<YAxisProps>): JSX.Element {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={x}
            x2={x + width}
            y1={toY(tick)}
            y2={toY(tick)}
            stroke={chartColor.grid}
            strokeWidth={1}
          />
          <Label
            x={x - AXIS_LABEL_GAP}
            y={toY(tick) + BASELINE_NUDGE}
            anchor="end"
            size={chartType.axis}
            fill={chartColor.inkFaint}
            numeric
          >
            {format(tick)}
          </Label>
        </g>
      ))}
    </>
  );
}

const AXIS_LABEL_GAP = 15;
/** Puts a text baseline on the optical centre of its anchor. */
const BASELINE_NUDGE = 6;

interface BarProps {
  x: number;
  /** Top edge of the bar. */
  y: number;
  width: number;
  height: number;
  fill: string;
  /** Rounded right end, matching the old flexbox scenes' `0 4px 4px 0`. */
  rounded?: boolean;
}

export function Bar({
  x,
  y,
  width,
  height,
  fill,
  rounded = false,
}: Readonly<BarProps>): JSX.Element {
  const w = Math.max(0, width);
  if (!rounded) return <rect x={x} y={y} width={w} height={height} fill={fill} />;
  const r = Math.min(BAR_CORNER_RADIUS, w);
  // Rounded on the right only: a plain `rx` would round the axis end too.
  return (
    <path
      d={`M${x} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + height - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + height} H${x} Z`}
      fill={fill}
    />
  );
}
