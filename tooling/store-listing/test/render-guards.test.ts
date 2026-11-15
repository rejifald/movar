import { describe, expect, it } from 'vitest';
import {
  assertLayout,
  assertSameLogo,
  computeLayout,
  RenderGuardError,
  resolveDevice,
  toolbarStrip,
  type CtaSpec,
  type Layout,
  type PhonePlacement,
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

interface Extra {
  cta?: CtaSpec;
  maxBottomCropFraction?: number;
  headlineLines?: number;
  screenWidth?: number;
  beforeCapture?: { width: number; height: number };
}

function layoutFor(
  capture: { width: number; height: number },
  canvas: { width: number; height: number },
  extra: Extra = {},
): Layout {
  return computeLayout({
    canvas,
    capture,
    beforeCapture: extra.beforeCapture,
    device: resolveDevice(capture.width, capture.height),
    headlineLines: extra.headlineLines ?? 2,
    maxBottomCropFraction: extra.maxBottomCropFraction,
    screenWidth: extra.screenWidth,
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

function expectTruePhone(placement: PhonePlacement, capture: { width: number; height: number }) {
  const { screen, phone, shape } = placement;
  expect(
    Math.abs(screen.width / screen.height / (capture.width / capture.height) - 1),
  ).toBeLessThan(0.005);
  expect(Math.abs(phone.height / phone.width / shape.bodyRatio - 1)).toBeLessThan(0.005);
  expect((shape.edge / shape.screenWidth) * 100).toBeCloseTo(3.5, 0);
}

describe('B1 layout across captures and canvases', () => {
  for (const [name, capture] of Object.entries(captures)) {
    for (const canvas of canvases) {
      it(`${name} ${capture.width}x${capture.height} on ${canvas.width}x${canvas.height}`, () => {
        const layout = layoutFor(capture, canvas);
        // A before phone that cannot run off the bottom cleanly is refused, never faked.
        const code = codeOf(() => assertLayout(layout));
        expect([undefined, 'bezel-visible', 'bottom-crop']).toContain(code);
        if (code !== undefined) return;
        const { after, before, minSideGap } = layout;
        expectTruePhone(after, capture);
        expectTruePhone(before, capture);
        // After: whole, inside the canvas, right gap and bottom gap at the minimum.
        expect(canvas.width - after.phone.x - after.phone.width).toBe(minSideGap);
        expect(canvas.height - after.phone.y - after.phone.height).toBe(minSideGap);
        // Before: left-aligned, smaller, lower, runs off the bottom past its corners.
        expect(before.phone.x).toBe(minSideGap);
        expect(before.screen.width).toBe(Math.round(after.screen.width * 0.9));
        expect(before.phone.y).toBeGreaterThan(after.phone.y);
        expect(before.crop.px).toBeGreaterThanOrEqual(before.shape.screenRadius - 0.5);
        expect(before.crop.fraction).toBeLessThanOrEqual(layout.maxBottomCropFraction);
        // Headline sits tight above the after phone.
        expect(layout.headline.y + layout.headline.height).toBeLessThan(after.phone.y);
      });
    }
  }

  it('App Store canvas: the owner-approved numbers', () => {
    const layout = layoutFor(captures.iphone, canvases[0]);
    expect(layout.minSideGap).toBe(84);
    expect(layout.after.screen.width).toBe(820);
    expect(layout.before.screen.width).toBe(738);
    expect(layout.after.phone.y + layout.after.phone.height).toBe(2868 - 84);
    expect(layout.before.phone.y - layout.after.phone.y).toBe(420);
    expect(layout.logo.y).toBe(72);
    expect(layout.headline.y + layout.headline.height + 48).toBe(layout.after.phone.y);
  });

  it('the logo stays put and the headline hugs the phone, whatever the line count', () => {
    const [one, three] = [1, 3].map((headlineLines) =>
      layoutFor(captures.iphone, canvases[0], { headlineLines }),
    );
    expect(one?.logo).toEqual(three?.logo);
    expect(one?.after).toEqual(three?.after);
    expect(one?.headline.y).toBeGreaterThan(three?.headline.y ?? Infinity);
    expect(codeOf(() => assertSameLogo([one, three].filter((l) => l !== undefined)))).toBe(
      undefined,
    );
  });

  it('shrinks the screen, never the bezel, when a 3-line headline would not fit', () => {
    const layout = layoutFor(captures.iphone, canvases[1]);
    expect(layout.after.screen.width).toBeLessThan(Math.round((820 * 1080) / 1320));
    expect(layout.after.shape.edge / layout.after.screen.width).toBeCloseTo(0.0351, 3);
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[1], { headlineLines: 3 }))),
    ).toBe(undefined);
  });

  it('scales the side gap with the canvas', () => {
    expect(layoutFor(captures.iphone, canvases[1]).minSideGap).toBe(Math.round((84 * 1080) / 1320));
  });
});

const base = (): Layout => layoutFor(captures.iphone, canvases[0]);

function shift<P extends PhonePlacement>(placement: P, dx: number, dy = 0): P {
  return {
    ...placement,
    phone: { ...placement.phone, x: placement.phone.x + dx, y: placement.phone.y + dy },
    screen: { ...placement.screen, x: placement.screen.x + dx, y: placement.screen.y + dy },
  };
}

describe('guards throw typed errors', () => {
  it('before and after captures must be the same size', () => {
    const layout = layoutFor(captures.iphone, canvases[0], { beforeCapture: captures.android });
    expect(codeOf(() => assertLayout(layout))).toBe('capture-mismatch');
  });

  it('1: a picture more than 0.5 % off its source aspect, on either phone', () => {
    const layout = base();
    for (const which of ['after', 'before'] as const) {
      const squashed = {
        ...layout,
        [which]: {
          ...layout[which],
          screen: { ...layout[which].screen, height: layout[which].screen.height * 0.98 },
        },
      };
      expect(codeOf(() => assertLayout(squashed))).toBe('picture-aspect');
    }
  });

  it('2: a phone body more than 0.5 % off the device ratio, on either phone', () => {
    const layout = base();
    for (const which of ['after', 'before'] as const) {
      const thin = {
        ...layout,
        [which]: {
          ...layout[which],
          phone: { ...layout[which].phone, width: layout[which].phone.width - 40 },
        },
      };
      expect(codeOf(() => assertLayout(thin))).toBe('phone-body-ratio');
    }
  });

  it('3: a phone closer than the minimum gap to a side edge', () => {
    const layout = base();
    expect(codeOf(() => assertLayout({ ...layout, after: shift(layout.after, 30) }))).toBe(
      'side-gap',
    );
    expect(codeOf(() => assertLayout({ ...layout, before: shift(layout.before, -40) }))).toBe(
      'side-gap',
    );
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[0], { screenWidth: 1250 }))),
    ).toBe('side-gap');
  });

  it('the after phone must stand whole, the minimum gap off the bottom', () => {
    const layout = base();
    expect(codeOf(() => assertLayout({ ...layout, after: shift(layout.after, 0, 40) }))).toBe(
      'phone-clipped',
    );
    expect(
      codeOf(() =>
        assertLayout({ ...layout, after: shift(layout.after, 0, -layout.after.phone.y - 10) }),
      ),
    ).toBe('phone-clipped');
  });

  it('at least a quarter of the before phone shows left of the after phone', () => {
    const layout = base();
    const strip = (layout.after.phone.x - layout.before.phone.x) / layout.before.phone.width;
    expect(strip).toBeGreaterThan(0.3);
    const hidden = { ...layout, after: shift(layout.after, -120) };
    expect(codeOf(() => assertLayout(hidden))).toBe('before-hidden');
  });

  it('4: a CTA over a phone; allowed over the ground, the toolbar strip, and the hidden part of the before phone', () => {
    const layout = base();
    const overAfter: CtaSpec = { x: 600, y: 1400, width: 400, height: 120, label: 'Get' };
    expect(codeOf(() => assertLayout({ ...layout, cta: overAfter }))).toBe('cta-overlap');
    const overBefore: CtaSpec = { x: 120, y: 2000, width: 150, height: 100, label: 'Get' };
    expect(codeOf(() => assertLayout({ ...layout, cta: overBefore }))).toBe('cta-overlap');
    const ground: CtaSpec = { x: 84, y: 300, width: 400, height: 100, label: 'Get' };
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

  it('5: headline wrapping to more than 3 lines, or running into the logo', () => {
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[0], { headlineLines: 3 }))),
    ).toBeUndefined();
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[0], { headlineLines: 4 }))),
    ).toBe('headline-lines');
    const layout = base();
    const high = { ...layout, headline: { ...layout.headline, y: layout.logo.y + 100 } };
    expect(codeOf(() => assertLayout(high))).toBe('headline-overlap');
  });

  it('6: before crop above the allowance, and bezel showing under the before screen', () => {
    const layout = base();
    const crop = (px: number, fraction: number): Layout => ({
      ...layout,
      before: { ...layout.before, crop: { px, fraction } },
    });
    expect(codeOf(() => assertLayout(crop(300, 0.13)))).toBe('bottom-crop');
    expect(codeOf(() => assertLayout(crop(-20, -0.01)))).toBe('bezel-visible');
    // Only the corner-radius sliver cut: the curve would still show.
    expect(codeOf(() => assertLayout(crop(40, 0.025)))).toBe('bezel-visible');
    // A landscape capture cannot run off the bottom: refused, not faked.
    expect(codeOf(() => assertLayout(layoutFor({ width: 2868, height: 1320 }, canvases[0])))).toBe(
      'bezel-visible',
    );
  });

  it('maxBottomCropFraction is a per-shot parameter', () => {
    const tight = layoutFor(captures.iphone, canvases[1], { maxBottomCropFraction: 0.07 });
    expect(tight.before.crop.fraction).toBeLessThanOrEqual(0.07);
    expect(codeOf(() => assertLayout(tight))).toBeUndefined();
  });

  it('a set whose logo moves between shots is refused', () => {
    const layout = base();
    const moved = { ...layout, logo: { ...layout.logo, y: layout.logo.y + 30 } };
    expect(codeOf(() => assertSameLogo([layout, layout]))).toBeUndefined();
    expect(codeOf(() => assertSameLogo([]))).toBeUndefined();
    expect(codeOf(() => assertSameLogo([layout, moved]))).toBe('logo-drift');
  });
});
