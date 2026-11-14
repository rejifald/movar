import { describe, expect, it } from 'vitest';
import {
  assertLayout,
  computeLayout,
  RenderGuardError,
  resolveDevice,
  toolbarStrip,
  type CtaSpec,
  type Layout,
} from '../src/render/index.js';

const captures = {
  iphone: { width: 1320, height: 2868 },
  android: { width: 1080, height: 2400 },
  unknown: { width: 1000, height: 1700 },
  wide: { width: 1800, height: 3900 },
} as const;
const canvases = [
  { width: 1320, height: 2868 },
  { width: 1080, height: 1920 },
  { width: 1080, height: 1350 },
] as const;

function layoutFor(
  capture: { width: number; height: number },
  canvas: { width: number; height: number },
  extra: { cta?: CtaSpec; maxBottomCropFraction?: number; headlineLines?: number } = {},
): Layout {
  return computeLayout({
    canvas,
    capture,
    device: resolveDevice(capture.width, capture.height),
    headlineLines: extra.headlineLines ?? 2,
    maxBottomCropFraction: extra.maxBottomCropFraction,
    cta: extra.cta,
  });
}

function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof RenderGuardError) return error.code;
    throw error;
  }
  return undefined;
}

describe('layout across captures and canvases', () => {
  for (const [name, capture] of Object.entries(captures)) {
    for (const canvas of canvases) {
      it(`${name} ${capture.width}x${capture.height} on ${canvas.width}x${canvas.height}`, () => {
        const layout = layoutFor(capture, canvas);
        // A phone that cannot reach the canvas bottom is refused, never faked.
        const code = codeOf(() => assertLayout(layout));
        expect([undefined, 'bezel-visible']).toContain(code);
        if (code !== undefined) return;
        const { screen, phone, shape } = layout;
        expect(
          Math.abs(screen.width / screen.height / (capture.width / capture.height) - 1),
        ).toBeLessThan(0.005);
        expect(Math.abs(phone.height / phone.width / shape.bodyRatio - 1)).toBeLessThan(0.005);
        expect(phone.x).toBeGreaterThanOrEqual(layout.minSideGap - 1);
        expect(canvas.width - phone.x - phone.width).toBeGreaterThanOrEqual(layout.minSideGap - 1);
        expect(layout.crop.fraction).toBeLessThanOrEqual(0.09);
        expect(layout.crop.px).toBeGreaterThanOrEqual(shape.screenRadius - 0.5);
        expect(phone.y + phone.height).toBeGreaterThan(canvas.height);
        expect((shape.edge / shape.screenWidth) * 100).toBeCloseTo(3.5, 0);
      });
    }
  }

  it('iPhone on the App Store canvas: min gap is 84 px and the phone is as large as the gap allows', () => {
    const layout = layoutFor(captures.iphone, canvases[0]);
    expect(layout.minSideGap).toBe(84);
    expect(layout.phone.x).toBe(84);
    expect(layout.screen.width).toBe(1076);
  });

  it('shrinks the screen, never the bezel, when the capture is too big to fit', () => {
    const layout = layoutFor(captures.wide, canvases[0]);
    expect(layout.screen.width).toBeLessThan(captures.wide.width);
    expect(layout.shape.edge / layout.screen.width).toBeCloseTo(0.0351, 3);
  });

  it('scales the side gap with the canvas', () => {
    expect(layoutFor(captures.iphone, canvases[1]).minSideGap).toBe(Math.round((84 * 1080) / 1320));
  });
});

const base = (): Layout => layoutFor(captures.iphone, canvases[0]);

describe('guards throw typed errors', () => {
  it('1: picture more than 0.5 % off its source aspect', () => {
    const layout = base();
    const squashed = {
      ...layout,
      screen: { ...layout.screen, height: layout.screen.height * 0.98 },
    };
    expect(codeOf(() => assertLayout(squashed))).toBe('picture-aspect');
    const stretched = {
      ...layout,
      screen: { ...layout.screen, width: layout.screen.width * 1.02 },
    };
    expect(codeOf(() => assertLayout(stretched))).toBe('picture-aspect');
  });

  it('2: phone body more than 0.5 % off the device ratio', () => {
    const layout = base();
    const thinBezel = { ...layout, phone: { ...layout.phone, width: layout.phone.width - 40 } };
    expect(codeOf(() => assertLayout(thinBezel))).toBe('phone-body-ratio');
  });

  it('3: phone closer than the minimum gap to a side edge', () => {
    const layout = base();
    const left = { ...layout, phone: { ...layout.phone, x: 40 } };
    expect(codeOf(() => assertLayout(left))).toBe('side-gap');
    const right = { ...layout, phone: { ...layout.phone, x: layout.phone.x + 60 } };
    expect(codeOf(() => assertLayout(right))).toBe('side-gap');
    expect(
      codeOf(() =>
        assertLayout(
          computeLayout({
            canvas: canvases[0],
            capture: captures.iphone,
            device: resolveDevice(1320, 2868),
            headlineLines: 2,
            screenWidth: 1250,
          }),
        ),
      ),
    ).toBe('side-gap');
  });

  it('4: a CTA over screen content; allowed over empty ground and the toolbar strip', () => {
    const layout = base();
    const over: CtaSpec = { x: 300, y: 1200, width: 500, height: 120, label: 'Get' };
    expect(codeOf(() => assertLayout({ ...layout, cta: over }))).toBe('cta-overlap');
    const onBezel: CtaSpec = { x: layout.phone.x - 10, y: 1200, width: 80, height: 80, label: '' };
    expect(codeOf(() => assertLayout({ ...layout, cta: onBezel }))).toBe('cta-overlap');
    const ground: CtaSpec = { x: 84, y: 40, width: 400, height: 100, label: 'Get' };
    expect(codeOf(() => assertLayout({ ...layout, cta: ground }))).toBeUndefined();
    const strip = toolbarStrip(layout);
    expect(strip.height).toBeGreaterThan(0);
    const inStrip: CtaSpec = {
      x: strip.x + 100,
      y: strip.y + 5,
      width: 400,
      height: strip.height - 10,
      label: 'Get',
    };
    expect(codeOf(() => assertLayout({ ...layout, cta: inStrip }))).toBeUndefined();
  });

  it('5: headline wrapping to more than 3 lines', () => {
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[0], { headlineLines: 3 }))),
    ).toBeUndefined();
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[0], { headlineLines: 4 }))),
    ).toBe('headline-lines');
  });

  it('6: bottom crop above the allowance, and bezel showing under the screen', () => {
    const layout = base();
    const over = { ...layout, crop: { px: 300, fraction: 0.13 } };
    expect(codeOf(() => assertLayout(over))).toBe('bottom-crop');
    const bezel = { ...layout, crop: { px: -20, fraction: -0.01 } };
    expect(codeOf(() => assertLayout(bezel))).toBe('bezel-visible');
    // Only the corner-radius sliver cut: the curve would still show.
    const corners = { ...layout, crop: { px: 40, fraction: 0.017 } };
    expect(codeOf(() => assertLayout(corners))).toBe('bezel-visible');
    // A landscape capture cannot run off the bottom: refused, not faked.
    expect(codeOf(() => assertLayout(layoutFor({ width: 2868, height: 1320 }, canvases[0])))).toBe(
      'bezel-visible',
    );
  });

  it('maxBottomCropFraction is a per-shot parameter', () => {
    const tight = layoutFor(captures.iphone, canvases[1], { maxBottomCropFraction: 0.07 });
    expect(tight.crop.fraction).toBeLessThanOrEqual(0.07);
    expect(codeOf(() => assertLayout(tight))).toBeUndefined();
  });
});
