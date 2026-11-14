/**
 * The drawing pieces, shared by every canvas (App Store shots now, ads later):
 * `Ground`, `ShadowLayer`, `Phone`, `LogoRow`, `Headline`, `Cta`. Each takes
 * absolute pixel geometry from `computeLayout`; none decides a size itself.
 */
import { createElement as h } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { DISPLAY_FAMILY } from './fonts.js';
import { BRAND_DOT, BRAND_LETTER_PATH, BRAND_SQUARE_PATH, BRAND_VIEWBOX } from './logo.js';
import type { Layout, Rect } from './layout.js';
import { ACCENT, BEZEL_COLOR, PALETTE } from './palette.js';
import type { GroundTone } from './palette.js';
import type { CtaSpec } from './layout.js';

/* eslint-disable @typescript-eslint/no-magic-numbers -- visual proportions
 * (shadow, rim gradient, island) are drawing data, expressed as fractions of
 * the phone/canvas so they scale with it. */

const abs = (rect: Rect, extra: CSSProperties = {}): CSSProperties => ({
  position: 'absolute',
  display: 'flex',
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  ...extra,
});

export function dataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

export function Ground(props: {
  tone: GroundTone;
  width: number;
  height: number;
  /** Already cover-fitted to the canvas, as a data URI. */
  imageUri?: string | undefined;
}): ReactElement {
  const { tone, width, height, imageUri } = props;
  return h(
    'div',
    { style: abs({ x: 0, y: 0, width, height }, { backgroundColor: PALETTE[tone].ground }) },
    imageUri === undefined
      ? null
      : h('img', { src: imageUri, width, height, style: { width, height } }),
  );
}

/** Soft drop shadow under the phone: its own layer, deterministic. */
export function ShadowLayer(props: { layout: Layout; tone: GroundTone }): ReactElement {
  const { layout, tone } = props;
  const w = layout.canvas.width;
  return h('div', {
    style: abs(layout.phone, {
      borderRadius: layout.shape.bodyRadius,
      boxShadow: `0px ${Math.round(w * 0.022)}px ${Math.round(w * 0.07)}px 0px ${PALETTE[tone].shadow}`,
    }),
  });
}

/** Thin silver frame: one diagonal gradient across the whole body. */
const RIM_GRADIENT =
  'linear-gradient(135deg, #74767b 0%, #b4b6ba 28%, #8d8f94 55%, #bcbdc1 80%, #7c7e83 100%)';

export function Phone(props: {
  layout: Layout;
  captureUri: string;
  island: boolean;
}): ReactElement {
  const { layout, captureUri, island } = props;
  const { shape, phone, screen } = layout;
  const rim = Math.round(shape.rim);
  const bezelRect = {
    x: phone.x + rim,
    y: phone.y + rim,
    width: phone.width - 2 * rim,
    height: phone.height - 2 * rim,
  };
  const children: ReactElement[] = [
    h('div', {
      key: 'rim',
      style: abs(phone, { borderRadius: shape.bodyRadius, backgroundImage: RIM_GRADIENT }),
    }),
    h('div', {
      key: 'bezel',
      style: abs(bezelRect, { borderRadius: shape.bezelRadius, backgroundColor: BEZEL_COLOR }),
    }),
    h('img', {
      key: 'screen',
      src: captureUri,
      width: screen.width,
      height: screen.height,
      style: {
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        width: screen.width,
        height: screen.height,
        borderRadius: shape.screenRadius,
      },
    }),
  ];
  if (island) {
    const islandW = Math.round(screen.width * 0.285);
    const islandH = Math.round(screen.width * 0.084);
    children.push(
      h('div', {
        key: 'island',
        style: abs(
          {
            x: screen.x + Math.round((screen.width - islandW) / 2),
            y: screen.y + Math.round(screen.width * 0.026),
            width: islandW,
            height: islandH,
          },
          { borderRadius: islandH / 2, backgroundColor: BEZEL_COLOR },
        ),
      }),
    );
  }
  return h(
    'div',
    { style: abs({ x: 0, y: 0, width: layout.canvas.width, height: layout.canvas.height }) },
    ...children,
  );
}

function BrandMark(props: { size: number; tone: GroundTone }): ReactElement {
  const palette = PALETTE[props.tone];
  return h(
    'svg',
    {
      width: props.size,
      height: props.size,
      viewBox: `0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}`,
      xmlns: 'http://www.w3.org/2000/svg',
    },
    h('path', { d: BRAND_SQUARE_PATH, fill: palette.markTile }),
    h('path', { d: BRAND_LETTER_PATH, fill: palette.markLetter }),
    h('circle', { cx: BRAND_DOT.cx, cy: BRAND_DOT.cy, r: BRAND_DOT.r, fill: palette.markDot }),
  );
}

export function LogoRow(props: { layout: Layout; tone: GroundTone }): ReactElement {
  const { logo } = props.layout;
  const palette = PALETTE[props.tone];
  return h(
    'div',
    {
      style: {
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        left: logo.x,
        top: logo.y,
        height: logo.markSize,
      },
    },
    h(BrandMark, { size: logo.markSize, tone: props.tone }),
    h(
      'div',
      {
        style: {
          display: 'flex',
          marginLeft: Math.round(logo.markSize * 0.28),
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 800,
          fontSize: logo.fontSize,
          letterSpacing: '-0.01em',
          color: palette.ink,
        },
      },
      'Мовар',
    ),
  );
}

export function headlineStyle(metrics: { fontSize: number; lineHeight: number }): CSSProperties {
  return {
    display: 'flex',
    fontFamily: DISPLAY_FAMILY,
    fontWeight: 800,
    fontSize: metrics.fontSize,
    lineHeight: `${metrics.lineHeight}px`,
    letterSpacing: '-0.012em',
    textWrap: 'balance',
  };
}

export function Headline(props: { layout: Layout; text: string; tone: GroundTone }): ReactElement {
  const { layout, text, tone } = props;
  return h(
    'div',
    {
      style: {
        ...abs(layout.headline),
        ...headlineStyle(layout.headline),
        color: PALETTE[tone].ink,
      },
    },
    text,
  );
}

/** Ad CTA: high-contrast pill with an arrow chip in the brand accent. */
export function Cta(props: { cta: CtaSpec; tone: GroundTone }): ReactElement {
  const { cta, tone } = props;
  const palette = PALETTE[tone];
  const chip = Math.round(cta.height * 0.7);
  const inset = Math.round((cta.height - chip) / 2);
  return h(
    'div',
    {
      style: {
        ...abs(cta),
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: cta.height / 2,
        backgroundColor: palette.ctaFill,
        paddingLeft: Math.round(cta.height * 0.5),
        paddingRight: inset,
        fontFamily: DISPLAY_FAMILY,
        fontWeight: 800,
        fontSize: Math.round(cta.height * 0.36),
        color: palette.ctaLabel,
      },
    },
    h('div', { style: { display: 'flex' } }, cta.label),
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: chip,
          height: chip,
          borderRadius: chip / 2,
          backgroundColor: ACCENT,
        },
      },
      // lucide `arrow-right` (inlined: `lucide` is not a dependency of this package).
      h(
        'svg',
        {
          width: Math.round(chip * 0.5),
          height: Math.round(chip * 0.5),
          viewBox: '0 0 24 24',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
        },
        h('path', {
          d: 'M5 12h14M12 5l7 7-7 7',
          stroke: '#ffffff',
          strokeWidth: 2.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          fill: 'none',
        }),
      ),
    ),
  );
}
