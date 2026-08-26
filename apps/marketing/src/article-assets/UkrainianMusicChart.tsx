import type { JSX } from 'react';

import { formatCount, formatShare, music } from '../lib/article-figures';

import {
  Bar,
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  Label,
  Lines,
  WEIGHT_BOLD,
  chartColor,
  chartType,
} from './chartKit';

/**
 * Ukrainian-language music, 2022 → 2025 — the scene for that section of
 * `src/content/blog/movu-rakhuyut.md`, written to
 * `src/content/blog/assets/ukrainian-music.svg`.
 *
 * Figures: `docs/articles/movu-rakhuyut.research.md` §6, including the note
 * that the study was commissioned by a record label rather than independently
 * audited — which is why the footer names the commissioner.
 *
 * **The caveat block carries the study's own counter-finding, and that is load
 * bearing.** Both bars move sharply upward, so a scene that stopped there
 * would argue "demand rose, supply followed, done". The same study reports
 * that nine in ten new performers never reached a thousand plays. Printing the
 * flattering pair without it would make the picture say something the source
 * does not.
 */

/* Geometry, in frame coordinates. */
const LABEL_COLUMN = 380;
const COLUMN_GAP = 24;
const YEAR_COLUMN = 54;
const VALUE_GAP = 14;
const VALUE_COLUMN = 70;
const BAR_X = CONTENT_X + LABEL_COLUMN + COLUMN_GAP + YEAR_COLUMN + VALUE_GAP;
const BAR_AREA = CONTENT_WIDTH - LABEL_COLUMN - COLUMN_GAP - YEAR_COLUMN - VALUE_GAP - VALUE_COLUMN;
/** Bars run against a full 100%, so the empty remainder stays visible —
 *  «57%» should not look like «most of it» when it is a little over half. */
const FULL_SCALE = 100;

const BAR_HEIGHT = 26;
const PAIR_PITCH = 38;
const MEASURE_PITCH = 116;
const LABEL_LINE_HEIGHT = 22;
/** Baseline offset that centres type on a bar. */
const BAR_CENTRE = 18;
/** Baselines for the two-part row label, relative to the row top. */
const MEASURE_TITLE_BASELINE = 16;
const MEASURE_SUB_BASELINE = 40;
/** Lift that puts the caveat rule above its first text baseline. */
const CAVEAT_RULE_LIFT = 20;
const CAVEAT_GAP = 34;
const CAVEAT_LINE_HEIGHT = 28;
const CAVEAT_RULE_WIDTH = 2;
const CAVEAT_TEXT_INSET = 18;

/*
 * Pre-broken: the scenes are SVG, which does not wrap text. Nothing re-flows,
 * so a longer line silently runs off the frame — `marketing.blog.spec.ts`
 * measures every text box against the viewBox to catch exactly that.
 */
const CAVEAT_LINES: readonly string[] = [
  `Але з іншого боку. За той самий час українські артисти випустили ${formatCount(music.tracksReleased)} пісень`,
  `— на ${formatShare(music.releaseGrowthPercent, 0)} більше, ніж торік. Девʼять із десяти нових виконавців не набрали`,
  'й тисячі прослуховувань.',
];

export function UkrainianMusicChart(): JSX.Element {
  const caveatTop = CONTENT_TOP + music.measures.length * MEASURE_PITCH + CAVEAT_GAP;

  return (
    <ChartFrame
      height={640}
      title="Українська музика за три роки"
      subtitle="Що змінилося між 2022 і 2025 роками"
      label="Дві пари смуг: частка плейлістів з піснями українською зросла з 34% у 2022 році до 57% у 2025-му, а частка українськомовних пісень, які артисти випускають на закордонну аудиторію, — з 27% до 53%"
      source={[
        'Джерело: дослідження «Музика має силу» — звукозаписна компанія Pomitni разом з дослідницькими',
        'агенціями Dive та Discovery Research, оприлюднене у вересні 2025 року.',
      ]}
    >
      {music.measures.map((measure, index) => {
        const top = CONTENT_TOP + index * MEASURE_PITCH;
        const pairs = [
          {
            year: music.fromYear,
            share: measure.from,
            fill: chartColor.neutral,
            ink: chartColor.inkSoft,
            weight: 500,
          },
          {
            year: music.toYear,
            share: measure.to,
            fill: chartColor.ua,
            ink: chartColor.uaLabel,
            weight: WEIGHT_BOLD,
          },
        ];
        return (
          <g key={measure.label}>
            <Label
              x={CONTENT_X + LABEL_COLUMN}
              y={top + MEASURE_TITLE_BASELINE}
              anchor="end"
              size={chartType.barLabel}
              weight={WEIGHT_BOLD}
              fill={chartColor.inkStrong}
            >
              {measure.label}
            </Label>
            <Lines
              x={CONTENT_X + LABEL_COLUMN}
              y={top + MEASURE_SUB_BASELINE}
              lines={measure.sub.split('\n')}
              lineHeight={LABEL_LINE_HEIGHT}
              anchor="end"
              size={chartType.blockCaption}
              fill={chartColor.inkFaint}
            />

            {pairs.map((pair, pairIndex) => {
              const barTop = top + pairIndex * PAIR_PITCH;
              const width = (pair.share / FULL_SCALE) * BAR_AREA;
              return (
                <g key={pair.year}>
                  <Label
                    x={CONTENT_X + LABEL_COLUMN + COLUMN_GAP + YEAR_COLUMN}
                    y={barTop + BAR_CENTRE}
                    anchor="end"
                    size={chartType.value}
                    fill={chartColor.inkFaint}
                    numeric
                  >
                    {pair.year}
                  </Label>
                  <Bar
                    x={BAR_X}
                    y={barTop}
                    width={width}
                    height={BAR_HEIGHT}
                    fill={pair.fill}
                    rounded
                  />
                  <Label
                    x={BAR_X + width + VALUE_GAP}
                    y={barTop + BAR_CENTRE}
                    size={chartType.endLabel}
                    weight={pair.weight}
                    fill={pair.ink}
                    numeric
                  >
                    {formatShare(pair.share, 0)}
                  </Label>
                </g>
              );
            })}
          </g>
        );
      })}

      <rect
        x={CONTENT_X}
        y={caveatTop - CAVEAT_RULE_LIFT}
        width={CAVEAT_RULE_WIDTH}
        height={CAVEAT_LINES.length * CAVEAT_LINE_HEIGHT}
        fill={chartColor.neutral}
      />
      <Lines
        x={CONTENT_X + CAVEAT_TEXT_INSET}
        y={caveatTop}
        lines={CAVEAT_LINES}
        lineHeight={CAVEAT_LINE_HEIGHT}
        size={chartType.barLabel}
        fill={chartColor.ink}
      />
    </ChartFrame>
  );
}
