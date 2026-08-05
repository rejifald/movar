import type { CSSProperties, JSX } from 'react';

import { colorLight, fontFamily, letterSpacing } from '@movar/theme';

/**
 * Signal-ladder diagram — an illustration for the DOU article
 * `docs/articles/dou-tykha-kapitulyatsiya.md`. Rendered at a fixed
 * 1200×920 and screenshotted by
 * `apps/marketing/scripts/capture-article-assets.mts` into
 * `docs/articles/assets/signal-ladder.png`.
 *
 * The six steps mirror `packages/page-language`'s detection order
 * (picker → html lang → subdomain → path segment → self-hreflang → text)
 * and the article's «Як Мовар визначає мову» section. If that order ever
 * changes, update both the article and this diagram together.
 */

interface LadderStep {
  title: string;
  /** Optional inline-code fragment appended to the title. */
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

export function SignalLadder(): JSX.Element {
  return (
    <div style={frameStyle}>
      <p style={titleStyle}>Як Мовар визначає мову сторінки</p>
      <p style={subtitleStyle}>
        Шість сигналів, від найнадійнішого до найслабшого. Перший, що дав відповідь, вирішує.
      </p>

      <div style={railLabelStyle}>надійніше</div>
      <div style={stepsStyle}>
        {STEPS.map((step, index) => (
          <div key={step.title} style={cardStyle}>
            <span style={chipStyle}>{index + 1}</span>
            <span style={cardBodyStyle}>
              <span style={cardTitleStyle}>
                {step.title}
                {step.code === undefined ? null : <code style={codeStyle}>{step.code}</code>}
              </span>
              <span style={annotationStyle}>{step.annotation}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ ...railLabelStyle, marginTop: 14 }}>слабше</div>

      <p style={footerStyle}>
        Доказів бракує чи сигнали суперечать один одному? Вердикт — «невідомо», і{' '}
        <strong style={{ color: ACCENT_DEEP }}>Мовар не чіпає нічого</strong>.
      </p>
    </div>
  );
}

const BG = colorLight.bg;
const SURFACE = colorLight.surface;
const SURFACE_3 = colorLight['surface-3'];
const INK = colorLight.ink;
const INK_STRONG = colorLight['ink-strong'];
const INK_SOFT = colorLight['ink-soft'];
const INK_FAINT = colorLight['ink-faint'];
const ACCENT_DEEP = colorLight['accent-deep'];
const ACCENT_SOFT = colorLight['accent-soft'];

const frameStyle: CSSProperties = {
  width: 1200,
  height: 920,
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

const railLabelStyle: CSSProperties = {
  marginTop: 32,
  fontFamily: fontFamily.mono,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: letterSpacing.label,
  textTransform: 'uppercase',
  color: INK_FAINT,
};

const stepsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginTop: 14,
};

const cardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  padding: '16px 24px',
  background: SURFACE,
  border: `1px solid ${SURFACE_3}`,
  borderRadius: 12,
};

const chipStyle: CSSProperties = {
  flex: 'none',
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  background: ACCENT_SOFT,
  color: ACCENT_DEEP,
  fontFamily: fontFamily.mono,
  fontSize: 20,
  fontWeight: 600,
};

const cardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const cardTitleStyle: CSSProperties = {
  fontSize: 21,
  fontWeight: 700,
  lineHeight: 1.2,
  color: INK_STRONG,
};

const codeStyle: CSSProperties = {
  marginLeft: 10,
  padding: '2px 8px',
  borderRadius: 6,
  background: colorLight['surface-2'],
  fontFamily: fontFamily.mono,
  fontSize: 18,
  fontWeight: 500,
};

const annotationStyle: CSSProperties = {
  fontSize: 17,
  lineHeight: 1.35,
  color: INK_SOFT,
};

const footerStyle: CSSProperties = {
  margin: '30px 0 0',
  fontSize: 18,
  color: INK,
};
