import type { JSX } from 'react';

import type { CyberpunkBar } from '../lib/article-figures';
import { cyberpunk, formatShare } from '../lib/article-figures';

import {
  Bar,
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  Label,
  Lines,
  WEIGHT_BOLD,
  WEIGHT_MEDIUM,
  WEIGHT_REGULAR,
  chartColor,
  chartType,
  emphasisInk,
} from './chartKit';

/**
 * Cyberpunk 2077 before/after language split — the centrepiece scene for
 * `src/content/blog/movu-rakhuyut.md`, written to
 * `src/content/blog/assets/cyberpunk-languages.svg`.
 *
 * Data and its limits: `docs/articles/movu-rakhuyut.research.md` §2. The
 * figures come from CD Projekt RED's localisation manager on a podcast and
 * were reported by DOU — second-hand, which is why the footer attributes the
 * speaker rather than the studio.
 *
 * **Grouped, not stacked, on purpose.** The published "after" shares sum to
 * 96%, not 100%: the source names three and does not account for the
 * remainder. A stack would either show a broken 96% run or invite us to invent
 * the missing 4%. Grouping renders exactly what was published and does no
 * arithmetic the source did not do — the same reason the 88% and 5% Russian
 * rows are never added into a single 93%.
 */

interface Block {
  heading: string;
  caption: string;
  bars: readonly CyberpunkBar[];
}

const BLOCKS: readonly Block[] = [
  {
    heading: 'До української локалізації',
    caption: 'мова, якою грали гравці з України',
    bars: cyberpunk.before,
  },
  {
    heading: 'Після — перші два тижні',
    caption: `локалізація вийшла ${cyberpunk.releasedOn}`,
    bars: cyberpunk.after,
  },
];

/* Geometry, in frame coordinates. */
const LABEL_COLUMN = 330;
const VALUE_GAP = 14;
const VALUE_COLUMN = 90;
const BAR_X = CONTENT_X + LABEL_COLUMN + VALUE_GAP;
const PLOT_WIDTH = CONTENT_WIDTH - LABEL_COLUMN - VALUE_GAP - VALUE_COLUMN;
const FULL_SCALE = 100;

const BAR_HEIGHT = 18;
const BAR_PITCH = 40;
const HEADING_TO_CAPTION = 26;
const CAPTION_TO_BARS = 34;
const BLOCK_GAP = 58;
/** Baseline offset that centres one line of label type on its bar. */
const LABEL_CENTRE = 14;
const LABEL_LINE_HEIGHT = 24;

function blockHeight(block: Block): number {
  return HEADING_TO_CAPTION + CAPTION_TO_BARS + block.bars.length * BAR_PITCH;
}

function barColor(emphasis: CyberpunkBar['emphasis']): string {
  if (emphasis === 'ua') return chartColor.ua;
  if (emphasis === 'ru') return chartColor.ru;
  return chartColor.neutral;
}

export function CyberpunkLanguagesChart(): JSX.Element {
  let cursor = CONTENT_TOP;
  const rendered = BLOCKS.map((block) => {
    const top = cursor;
    cursor += blockHeight(block) + BLOCK_GAP;
    return { block, top };
  });

  return (
    <ChartFrame
      height={660}
      title="Cyberpunk 2077: чим скінчилися три роки прохань"
      subtitle="Мова, якою гравці з України запускали гру, до і після локалізації"
      label="Дві групи смуг: до появи української локалізації 88% гравців з України грали Cyberpunk 2077 російською, 7% англійською, 5% з російськими субтитрами; після — 42% українською, 47% російською, 7% англійською"
      source={[
        'Джерело: дані навела менеджерка локалізації CD Projekt RED Марія Стрільчук; наведено за gamedev.dou.ua',
      ]}
    >
      {rendered.map(({ block, top }) => (
        <g key={block.heading}>
          <Label
            x={CONTENT_X}
            y={top}
            size={chartType.blockHeading}
            weight={WEIGHT_BOLD}
            fill={chartColor.inkStrong}
          >
            {block.heading}
          </Label>
          <Label
            x={CONTENT_X}
            y={top + HEADING_TO_CAPTION}
            size={chartType.blockCaption}
            fill={chartColor.inkFaint}
          >
            {block.caption}
          </Label>

          {block.bars.map((bar, index) => {
            const barTop = top + HEADING_TO_CAPTION + CAPTION_TO_BARS + index * BAR_PITCH;
            const width = (bar.share / FULL_SCALE) * PLOT_WIDTH;
            const lines = bar.label.split('\n');
            const labelTop = barTop + LABEL_CENTRE - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;
            return (
              <g key={bar.label}>
                <Lines
                  x={CONTENT_X + LABEL_COLUMN}
                  y={labelTop}
                  lines={lines}
                  lineHeight={LABEL_LINE_HEIGHT}
                  anchor="end"
                  weight={bar.emphasis ? WEIGHT_BOLD : WEIGHT_REGULAR}
                  fill={emphasisInk(bar.emphasis)}
                />
                <Bar
                  x={BAR_X}
                  y={barTop}
                  width={width}
                  height={BAR_HEIGHT}
                  fill={barColor(bar.emphasis)}
                  rounded
                />
                <Label
                  x={BAR_X + width + VALUE_GAP}
                  y={barTop + LABEL_CENTRE}
                  size={chartType.value}
                  weight={bar.emphasis ? WEIGHT_MEDIUM : WEIGHT_REGULAR}
                  fill={bar.emphasis ? chartColor.inkStrong : chartColor.inkSoft}
                  numeric
                >
                  {formatShare(bar.share, 0)}
                </Label>
              </g>
            );
          })}
        </g>
      ))}
    </ChartFrame>
  );
}
