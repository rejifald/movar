import { describe, expect, it } from 'vitest';
import {
  assertLayout,
  assertSameLogo,
  computeLayout,
  MIN_PART_SHARE,
  STATUS_BAR_SHARE,
  RenderGuardError,
  resolveDevice,
  type CtaSpec,
  type Layout,
  type PhonePlacement,
  type SplitSpec,
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
  split?: SplitSpec;
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
    split: extra.split ?? { mode: 'tops', cut: 0.47 },
    headlineLines: extra.headlineLines ?? 2,
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

describe('halves layout across captures and canvases', () => {
  for (const [name, capture] of Object.entries(captures)) {
    for (const canvas of canvases) {
      it(`${name} ${capture.width}x${capture.height} on ${canvas.width}x${canvas.height}`, () => {
        const layout = layoutFor(capture, canvas);
        expect(codeOf(() => assertLayout(layout))).toBeUndefined();
        const { phone, minSideGap } = layout;
        expectTruePhone(phone, capture);
        // One phone: whole, centred, the minimum gap off the bottom.
        const left = phone.phone.x;
        const right = canvas.width - phone.phone.x - phone.phone.width;
        expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
        expect(Math.min(left, right)).toBeGreaterThanOrEqual(minSideGap - 1);
        expect(canvas.height - phone.phone.y - phone.phone.height).toBe(minSideGap);
        // The seam band spans the screen and is centred on the cut.
        const { seam } = layout.split;
        expect(seam.x).toBe(phone.screen.x);
        expect(seam.width).toBe(phone.screen.width);
        const cutY = phone.screen.y + phone.screen.height * 0.47;
        expect(Math.abs(seam.y + seam.height / 2 - cutY)).toBeLessThanOrEqual(2);
        // Headline sits tight above the phone.
        expect(layout.headline.y + layout.headline.height).toBeLessThan(phone.phone.y);
      });
    }
  }

  it('App Store canvas: the owner-approved numbers', () => {
    const layout = layoutFor(captures.iphone, canvases[0]);
    expect(layout.minSideGap).toBe(84);
    expect(layout.phone.screen.width).toBe(940);
    expect(layout.phone.phone.y + layout.phone.phone.height).toBe(2868 - 84);
    expect(layout.logo.y).toBe(72);
    expect(layout.headline.y + layout.headline.height + 48).toBe(layout.phone.phone.y);
  });

  it('tops: each part from its own page top; the band covers only the before status bar', () => {
    const { split, capture, phone } = layoutFor(captures.iphone, canvases[0]);
    const cutRows = Math.round(capture.height * 0.47);
    expect(split.afterSlice).toEqual({ y: 0, height: cutRows });
    expect(split.beforeSlice.height).toBe(capture.height - cutRows);
    // The band's lower half, in capture rows, ends exactly where the before page starts.
    const halfBandRows =
      ((split.seam.y +
        split.seam.height -
        (phone.screen.y + (phone.screen.height * cutRows) / capture.height)) *
        capture.height) /
      phone.screen.height;
    expect(
      Math.abs(split.beforeSlice.y + halfBandRows - Math.round(capture.height * STATUS_BAR_SHARE)),
    ).toBeLessThanOrEqual(3);
  });

  it('region: both parts from the same rows, cut at one line', () => {
    const { split, capture } = layoutFor(captures.iphone, canvases[0], {
      split: { mode: 'region', cut: 0.705 },
    });
    const cutRows = Math.round(capture.height * 0.705);
    expect(split.afterSlice).toEqual({ y: 0, height: cutRows });
    expect(split.beforeSlice).toEqual({ y: cutRows, height: capture.height - cutRows });
  });

  it('the logo stays put and the headline hugs the phone, whatever the line count', () => {
    const [one, three] = [1, 3].map((headlineLines) =>
      layoutFor(captures.iphone, canvases[0], { headlineLines }),
    );
    expect(one?.logo).toEqual(three?.logo);
    expect(one?.phone).toEqual(three?.phone);
    expect(one?.headline.y).toBeGreaterThan(three?.headline.y ?? Infinity);
    expect(codeOf(() => assertSameLogo([one, three].filter((l) => l !== undefined)))).toBe(
      undefined,
    );
  });

  it('shrinks the screen, never the bezel, when a 3-line headline would not fit', () => {
    const layout = layoutFor(captures.iphone, canvases[1]);
    expect(layout.phone.screen.width).toBeLessThan(Math.round((940 * 1080) / 1320));
    expect(layout.phone.shape.edge / layout.phone.screen.width).toBeCloseTo(0.0351, 3);
    expect(
      codeOf(() => assertLayout(layoutFor(captures.iphone, canvases[1], { headlineLines: 3 }))),
    ).toBe(undefined);
  });

  it('scales the side gap with the canvas', () => {
    expect(layoutFor(captures.iphone, canvases[1]).minSideGap).toBe(Math.round((84 * 1080) / 1320));
  });
});

const base = (): Layout => layoutFor(captures.iphone, canvases[0]);

function shift(placement: PhonePlacement, dx: number, dy = 0): PhonePlacement {
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

  it('1: a picture more than 0.5 % off its source aspect', () => {
    const layout = base();
    const screen = { ...layout.phone.screen, height: layout.phone.screen.height * 0.98 };
    expect(codeOf(() => assertLayout({ ...layout, phone: { ...layout.phone, screen } }))).toBe(
      'picture-aspect',
    );
  });

  it('2: a phone body more than 0.5 % off the device ratio', () => {
    const layout = base();
    const phone = { ...layout.phone.phone, width: layout.phone.phone.width - 40 };
    expect(codeOf(() => assertLayout({ ...layout, phone: { ...layout.phone, phone } }))).toBe(
      'phone-body-ratio',
    );
  });

  it('3: a phone closer than the minimum gap to a side edge', () => {
    const layout = base();
    const room = layout.phone.phone.x - layout.minSideGap;
    expect(codeOf(() => assertLayout({ ...layout, phone: shift(layout.phone, room + 10) }))).toBe(
      'side-gap',
    );
  });

  it('the phone must stand whole, the minimum gap off the bottom', () => {
    const layout = base();
    expect(codeOf(() => assertLayout({ ...layout, phone: shift(layout.phone, 0, 40) }))).toBe(
      'phone-clipped',
    );
    expect(
      codeOf(() =>
        assertLayout({ ...layout, phone: shift(layout.phone, 0, -layout.phone.phone.y - 10) }),
      ),
    ).toBe('phone-clipped');
  });

  it('each part keeps at least a quarter of the screen', () => {
    for (const cut of [0.2, 0.8]) {
      for (const mode of ['tops', 'region'] as const) {
        const layout = layoutFor(captures.iphone, canvases[0], { split: { mode, cut } });
        expect(codeOf(() => assertLayout(layout))).toBe('split-cut');
      }
    }
    for (const cut of [MIN_PART_SHARE, 1 - MIN_PART_SHARE]) {
      const layout = layoutFor(captures.iphone, canvases[0], { split: { mode: 'region', cut } });
      expect(codeOf(() => assertLayout(layout))).toBeUndefined();
    }
  });

  it('a before slice that reads past its capture is refused', () => {
    const layout = base();
    const beforeSlice = { ...layout.split.beforeSlice, y: layout.capture.height - 100 };
    expect(codeOf(() => assertLayout({ ...layout, split: { ...layout.split, beforeSlice } }))).toBe(
      'split-cut',
    );
  });

  it('4: a CTA over the phone; allowed on the ground', () => {
    const layout = base();
    const overPhone: CtaSpec = { x: 600, y: 1400, width: 400, height: 120, label: 'Get' };
    expect(codeOf(() => assertLayout({ ...layout, cta: overPhone }))).toBe('cta-overlap');
    const ground: CtaSpec = { x: 84, y: 300, width: 400, height: 100, label: 'Get' };
    expect(codeOf(() => assertLayout({ ...layout, cta: ground }))).toBeUndefined();
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

  it('a set whose logo moves between shots is refused', () => {
    const layout = base();
    const moved = { ...layout, logo: { ...layout.logo, y: layout.logo.y + 30 } };
    expect(codeOf(() => assertSameLogo([layout, layout]))).toBeUndefined();
    expect(codeOf(() => assertSameLogo([]))).toBeUndefined();
    expect(codeOf(() => assertSameLogo([layout, moved]))).toBe('logo-drift');
  });
});
