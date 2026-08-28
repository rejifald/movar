import type { JSX } from 'react';

import {
  CONTENT_TOP,
  CONTENT_WIDTH,
  CONTENT_X,
  ChartFrame,
  FONT,
  Label,
  WEIGHT_BOLD,
  WEIGHT_MEDIUM,
  chartColor,
  chartType,
} from './chartKit';

/**
 * Signal-ladder diagram — the scene for
 * `src/content/blog/tykha-kapitulyatsiya.md`, written to
 * `src/content/blog/assets/signal-ladder.svg`.
 *
 * The six steps mirror `packages/page-language`'s detection order
 * (picker → html lang → subdomain → path segment → self-hreflang → text) and
 * the article's «Як Мовар визначає мову» section. If that order ever changes,
 * update the package, the article and this diagram together — nothing checks
 * the three against each other.
 *
 * Unlike its siblings this scene carries no figures, so it has no entry in
 * `src/lib/article-figures.ts`: its content *is* the detection order, and
 * moving the list to another module would add indirection without removing a
 * duplicate.
 *
 * The inline code fragments (`<html lang>`, `/uk/`) used to sit in tinted
 * chips. A chip needs the text's width, and nothing here measures text — so
 * they are now distinguished by colour and weight instead, which consecutive
 * `<tspan>`s can do without any measurement at all.
 */

interface LadderStep {
  title: string;
  /** Optional code fragment, rendered inline after the title. */
  code?: string;
  annotation: string;
}

const STEPS: readonly LadderStep[] = [
  {
    title: 'Активний пункт перемикача мов',
    annotation: 'Його малює той самий код, що малює контент, — вони майже завжди збігаються.',
  },
  {
    title: 'Атрибут',
    code: '<html lang>',
    annotation: 'Лежить у шаблоні й живе власним життям: буває ru на всіх без винятку локалях.',
  },
  {
    title: 'Піддомен',
    code: 'ru.example.com',
    annotation: 'Мовна версія, винесена на окремий хост.',
  },
  {
    title: 'Сегмент шляху',
    code: '/uk/',
    annotation: 'Лише строгий збіг: /ru-return-warranty не вважається російською.',
  },
  {
    title: 'self-hreflang',
    annotation: 'Сторінка сама вказує на себе з мовною міткою.',
  },
  {
    title: 'Текст сторінки',
    annotation: 'Вбудований у браузер визначник мови, а без нього — franc на таблицях триграм.',
  },
];

/* Geometry, in frame coordinates. */
const RAIL_BASELINE_DROP = 10;
const RAIL_TO_CARDS = 18;
const RAIL_TOP_BASELINE = CONTENT_TOP + RAIL_BASELINE_DROP;
const CARDS_TOP = RAIL_TOP_BASELINE + RAIL_TO_CARDS;
const CARD_HEIGHT = 84;
const CARD_PITCH = 96;
const CARD_RADIUS = 12;
const CARD_PAD_X = 24;
const CHIP_RADIUS = 20;
const CHIP_GAP = 20;
const TITLE_BASELINE = 34;
const ANNOTATION_BASELINE = 60;
const CHIP_TEXT_NUDGE = 7;
const CODE_GAP = 10;

const CARDS_BOTTOM = CARDS_TOP + STEPS.length * CARD_PITCH - (CARD_PITCH - CARD_HEIGHT);
const CARDS_TO_RAIL = 30;
const RAIL_TO_FOOTER = 46;
const FOOTER_TO_EDGE = 44;
const RAIL_BOTTOM_BASELINE = CARDS_BOTTOM + CARDS_TO_RAIL;
const FOOTER_BASELINE = RAIL_BOTTOM_BASELINE + RAIL_TO_FOOTER;

const CHIP_CX = CONTENT_X + CARD_PAD_X + CHIP_RADIUS;
const BODY_X = CHIP_CX + CHIP_RADIUS + CHIP_GAP;

export function SignalLadder(): JSX.Element {
  return (
    <ChartFrame
      height={FOOTER_BASELINE + FOOTER_TO_EDGE}
      title="Як Мовар визначає мову сторінки"
      subtitle="Шість сигналів, від найнадійнішого до найслабшого. Перший, що дав відповідь, вирішує."
      label="Драбина з шести сигналів визначення мови сторінки, від найнадійнішого до найслабшого: активний пункт перемикача мов, атрибут html lang, піддомен, сегмент шляху, self-hreflang і текст сторінки"
      source={[]}
    >
      <Label
        x={CONTENT_X}
        y={RAIL_TOP_BASELINE}
        size={13}
        weight={WEIGHT_MEDIUM}
        fill={chartColor.inkFaint}
      >
        НАДІЙНІШЕ
      </Label>

      {STEPS.map((step, index) => {
        const top = CARDS_TOP + index * CARD_PITCH;
        return (
          <g key={step.title}>
            <rect
              x={CONTENT_X}
              y={top}
              width={CONTENT_WIDTH}
              height={CARD_HEIGHT}
              rx={CARD_RADIUS}
              fill={chartColor.bg}
              stroke={chartColor.grid}
              strokeWidth={1}
            />
            <circle
              cx={CHIP_CX}
              cy={top + CARD_HEIGHT / 2}
              r={CHIP_RADIUS}
              fill={chartColor.ua}
              fillOpacity={0.12}
            />
            <Label
              x={CHIP_CX}
              y={top + CARD_HEIGHT / 2 + CHIP_TEXT_NUDGE}
              anchor="middle"
              size={20}
              weight={WEIGHT_MEDIUM}
              fill={chartColor.uaLabel}
              numeric
            >
              {index + 1}
            </Label>

            {/* Consecutive tspans flow inline, so the code needs no measured x. */}
            <text
              x={BODY_X}
              y={top + TITLE_BASELINE}
              fontFamily={FONT}
              fontSize={chartType.blockHeading}
              fontWeight={WEIGHT_BOLD}
              fill={chartColor.inkStrong}
            >
              <tspan>{step.title}</tspan>
              {step.code === undefined ? null : (
                <tspan dx={CODE_GAP} fontWeight={WEIGHT_MEDIUM} fill={chartColor.uaLabel}>
                  {step.code}
                </tspan>
              )}
            </text>
            <Label
              x={BODY_X}
              y={top + ANNOTATION_BASELINE}
              size={chartType.blockCaption}
              fill={chartColor.inkSoft}
            >
              {step.annotation}
            </Label>
          </g>
        );
      })}

      <Label
        x={CONTENT_X}
        y={RAIL_BOTTOM_BASELINE}
        size={13}
        weight={WEIGHT_MEDIUM}
        fill={chartColor.inkFaint}
      >
        СЛАБШЕ
      </Label>

      <text
        x={CONTENT_X}
        y={FOOTER_BASELINE}
        fontFamily={FONT}
        fontSize={chartType.barLabel}
        fill={chartColor.ink}
      >
        <tspan>Доказів бракує чи сигнали суперечать один одному? Вердикт — «невідомо», і </tspan>
        <tspan fontWeight={WEIGHT_BOLD} fill={chartColor.uaLabel}>
          Мовар не чіпає нічого
        </tspan>
        <tspan>.</tspan>
      </text>
    </ChartFrame>
  );
}
