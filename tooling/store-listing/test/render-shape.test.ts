import { describe, expect, it } from 'vitest';
import {
  ANDROID_GENERIC,
  DEFAULT_EDGE_FRACTION,
  DEVICE_PROFILES,
  IPHONE_17_PRO_MAX,
  phoneShape,
  readPngSize,
  resolveDevice,
  unknownDevice,
} from '../src/render/index.js';
import { colorDarkOverrides, colorLight } from '../../../packages/theme/src/tokens.js';
import { PALETTE, ACCENT } from '../src/render/palette.js';
import sharp from 'sharp';

const profiles = [...DEVICE_PROFILES, unknownDevice(1000, 1700)];

describe('phoneShape', () => {
  it.each(profiles.map((p) => [p.id, p] as const))(
    'edge is 3.5 % (+-0.1) of the screen width for %s at any size',
    (_id, profile) => {
      for (const screenWidth of [300, 761, 1076, 2000]) {
        const shape = phoneShape(screenWidth, profile);
        expect((shape.edge / screenWidth) * 100).toBeGreaterThan(DEFAULT_EDGE_FRACTION * 100 - 0.1);
        expect((shape.edge / screenWidth) * 100).toBeLessThan(DEFAULT_EDGE_FRACTION * 100 + 0.1);
      }
    },
  );

  it.each(profiles.map((p) => [p.id, p] as const))(
    'rim + bezel = edge and radii nest for %s',
    (_id, profile) => {
      const shape = phoneShape(1000, profile);
      expect(shape.rim + shape.bezel).toBeCloseTo(shape.edge, 9);
      expect(shape.bezelRadius).toBeCloseTo(shape.screenRadius + shape.bezel, 9);
      expect(shape.bodyRadius).toBeCloseTo(shape.screenRadius + shape.edge, 9);
      expect(shape.rim).toBeGreaterThan(0);
      expect(shape.bezel).toBeGreaterThan(shape.rim);
    },
  );

  it('scales linearly: the bezel never thins relative to the screen', () => {
    const big = phoneShape(1076, IPHONE_17_PRO_MAX);
    const small = phoneShape(538, IPHONE_17_PRO_MAX);
    expect(big.bezel / big.screenWidth).toBeCloseTo(small.bezel / small.screenWidth, 9);
  });

  it('keeps the iPhone 17 Pro Max body at its real 78.0 x 163.4 mm ratio', () => {
    expect(phoneShape(1000, IPHONE_17_PRO_MAX).bodyRatio).toBeCloseTo(163.4 / 78, 9);
    expect(phoneShape(1000, ANDROID_GENERIC).bodyRatio).toBeCloseTo(165.04 / 77.04, 9);
  });
});

describe('resolveDevice', () => {
  it('matches iPhone and Android captures, derives a profile for anything else', () => {
    expect(resolveDevice(1320, 2868).id).toBe('iphone-17-pro-max');
    expect(resolveDevice(1080, 2400).id).toBe('android-generic');
    const unknown = resolveDevice(1000, 1700);
    expect(unknown.id).toBe('unknown');
    expect(unknown.displayMm.h / unknown.displayMm.w).toBeCloseTo(1.7, 9);
  });
});

describe('readPngSize', () => {
  it('reads the real size from the header, whatever it is', async () => {
    for (const [width, height] of [
      [1320, 2868],
      [1080, 2400],
      [1000, 1700],
      [37, 91],
    ] as const) {
      const png = await sharp({ create: { width, height, channels: 3, background: '#fff' } })
        .png()
        .toBuffer();
      expect(readPngSize(png)).toEqual({ width, height });
    }
  });

  it('rejects non-PNG input', () => {
    expect(() => readPngSize(new Uint8Array(40))).toThrow(/Not a PNG/);
  });
});

describe('palette', () => {
  it('mirrors the design tokens', () => {
    expect(PALETTE.light.ground).toBe(colorLight['surface-3']);
    expect(PALETTE.dark.ground).toBe(colorDarkOverrides.surface);
    expect(PALETTE.light.ink).toBe(colorLight['ink-strong']);
    expect(PALETTE.dark.ink).toBe(colorDarkOverrides['ink-strong']);
    expect(PALETTE.light.captionDot).toBe(colorLight['ink-soft']);
    expect(PALETTE.dark.captionDot).toBe(colorDarkOverrides['ink-soft']);
    expect(ACCENT).toBe(colorLight.accent);
  });
});
