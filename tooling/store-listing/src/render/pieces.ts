/**
 * The drawing pieces, shared by every canvas (App Store shots now, ads later):
 * `Ground`, `ShadowLayer`, `Phone`, `Seam`, `LogoRow`, `Headline`, `Cta`. Each takes
 * absolute pixel geometry from `computeLayout`; none decides a size itself.
 */
import { createElement as h } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { DISPLAY_FAMILY } from './fonts.js';
import { BRAND_DOT, BRAND_LETTER_PATH, BRAND_SQUARE_PATH, BRAND_VIEWBOX } from './logo.js';
import type { Layout, PhonePlacement, Rect } from './layout.js';
import { ACCENT, BEZEL_COLOR, PALETTE } from './palette.js';
import type { GroundTone } from './palette.js';
import type { CtaSpec } from './layout.js';

/* eslint-disable @typescript-eslint/no-magic-numbers -- visual proportions
 * (shadow, rim gradient, captions) are drawing data, expressed as fractions of
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

/** Drop shadow, as fractions of the canvas width. */
const SHADOW = { dy: 0.03, blur: 0.09 } as const;

/** Drop shadow under one phone: its own layer, deterministic. */
export function ShadowLayer(props: {
  placement: { phone: Rect; shape: { bodyRadius: number } };
  canvasWidth: number;
  tone: GroundTone;
}): ReactElement {
  const { placement, canvasWidth: w, tone } = props;
  const { dy, blur } = SHADOW;
  return h('div', {
    style: abs(placement.phone, {
      borderRadius: placement.shape.bodyRadius,
      boxShadow: `0px ${Math.round(w * dy)}px ${Math.round(w * blur)}px 0px ${PALETTE[tone].shadow}`,
    }),
  });
}

/** Thin silver frame: one diagonal gradient across the whole body. */
const RIM_GRADIENT =
  'linear-gradient(135deg, #74767b 0%, #b4b6ba 28%, #8d8f94 55%, #bcbdc1 80%, #7c7e83 100%)';

/** Rim, bezel and the real capture. No Dynamic Island: the real one is in the capture. */
export function Phone(props: {
  placement: PhonePlacement;
  canvas: { width: number; height: number };
  captureUri: string;
}): ReactElement {
  const { placement, canvas, captureUri } = props;
  const { shape, phone, screen } = placement;
  const rim = Math.round(shape.rim);
  const bezelRect = {
    x: phone.x + rim,
    y: phone.y + rim,
    width: phone.width - 2 * rim,
    height: phone.height - 2 * rim,
  };
  return h(
    'div',
    { style: abs({ x: 0, y: 0, width: canvas.width, height: canvas.height }) },
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
  );
}

/** The seam line: the ink of the light palette, dark on any page. */
const SEAM_COLOR = '#1c1917';

/** What `Seam` reads: shared by the portrait and the landscape layouts. */
export interface SeamLayout {
  canvas: { width: number; height: number };
  split: { seam: Rect; captions: { after: Rect; before: Rect; fontSize: number } };
}

export interface SplitTagLabels {
  /** Above the seam: the after part (Movar on). */
  after: string;
  /** Below the seam: the before part (Movar off). */
  before: string;
}

/** One caption, rotated to read bottom-up, centred in its footprint on the ground. */
export function Caption(props: {
  rect: Rect;
  fontSize: number;
  label: string;
  dot: string;
  ink: string;
}): ReactElement {
  const { rect, fontSize, label, dot, ink } = props;
  const dotSize = Math.round(fontSize * 0.55);
  // Laid out horizontally in a box the footprint's size turned on its side, then rotated about its centre.
  const box: Rect = {
    x: Math.round(rect.x + rect.width / 2 - rect.height / 2),
    y: Math.round(rect.y + rect.height / 2 - rect.width / 2),
    width: rect.height,
    height: rect.width,
  };
  return h(
    'div',
    {
      style: abs(box, {
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-90deg)',
        fontFamily: DISPLAY_FAMILY,
        fontWeight: 800,
        fontSize,
        letterSpacing: '0.06em',
        color: ink,
      }),
    },
    h('div', {
      style: {
        display: 'flex',
        width: dotSize,
        height: dotSize,
        borderRadius: dotSize / 2,
        backgroundColor: dot,
        marginRight: Math.round(fontSize * 0.4),
      },
    }),
    h('div', { style: { display: 'flex' } }, label.toLocaleUpperCase()),
  );
}

/** The seam line across the screen, and the two captions on the ground beside their parts. */
export function Seam(props: {
  layout: SeamLayout;
  labels: SplitTagLabels;
  tone: GroundTone;
}): ReactElement {
  const { seam, captions } = props.layout.split;
  const palette = PALETTE[props.tone];
  const { canvas } = props.layout;
  return h(
    'div',
    { style: abs({ x: 0, y: 0, width: canvas.width, height: canvas.height }) },
    h('div', { key: 'line', style: abs(seam, { backgroundColor: SEAM_COLOR }) }),
    h(Caption, {
      key: 'after',
      rect: captions.after,
      fontSize: captions.fontSize,
      label: props.labels.after,
      dot: ACCENT,
      ink: palette.ink,
    }),
    h(Caption, {
      key: 'before',
      rect: captions.before,
      fontSize: captions.fontSize,
      label: props.labels.before,
      dot: palette.captionDot,
      ink: palette.ink,
    }),
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

export function LogoRow(props: { layout: Pick<Layout, 'logo'>; tone: GroundTone }): ReactElement {
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

export function Headline(props: {
  layout: Pick<Layout, 'headline'>;
  text: string;
  tone: GroundTone;
}): ReactElement {
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
