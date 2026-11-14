import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  measurePhone,
  planShot,
  renderLayout,
  renderShot,
  RenderGuardError,
  type ShotSpec,
} from '../src/render/index.js';

const TIMEOUT = 120_000;

async function capture(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3b82f6' } })
    .png()
    .toBuffer();
}

const cases = [
  { name: 'iPhone 1320x2868 / 1320x2868', cap: [1320, 2868], canvas: [1320, 2868] },
  { name: 'iPhone / 1080x1920', cap: [1320, 2868], canvas: [1080, 1920] },
  { name: 'Android 1080x2400 / 1320x2868', cap: [1080, 2400], canvas: [1320, 2868] },
  { name: 'unknown 1000x1700 / 1080x1920', cap: [1000, 1700], canvas: [1080, 1920] },
  { name: 'oversized 1800x3900 / 1320x2868', cap: [1800, 3900], canvas: [1320, 2868] },
] as const;

describe('rendered pixels', () => {
  for (const { name, cap, canvas } of cases) {
    it(
      `${name}: measured gaps, edge and body ratio hold`,
      async () => {
        const spec: ShotSpec = {
          canvas: { width: canvas[0], height: canvas[1] },
          capture: await capture(cap[0], cap[1]),
          ground: 'light',
          headline: 'Сайт — одразу українською',
        };
        const plan = await planShot(spec);
        const png = await renderShot(spec);
        const meta = await sharp(png).metadata();
        expect([meta.width, meta.height]).toEqual([canvas[0], canvas[1]]);

        const real = await measurePhone(png);
        const minGap = plan.layout.minSideGap;
        expect(real.gaps.left).toBeGreaterThanOrEqual(minGap - 2);
        expect(real.gaps.right).toBeGreaterThanOrEqual(minGap - 2);
        expect(real.edgeFraction).toBeGreaterThan(0.034);
        expect(real.edgeFraction).toBeLessThan(0.036);
        expect(Math.abs(real.screen.width - plan.layout.screen.width)).toBeLessThanOrEqual(2);

        const full = await measurePhone(
          await renderLayout(plan, spec, { extendCanvasBelow: true }),
        );
        expect(full.outerRatio).toBeDefined();
        expect(Math.abs((full.outerRatio ?? 0) / plan.layout.shape.bodyRatio - 1)).toBeLessThan(
          0.005,
        );
      },
      TIMEOUT,
    );
  }

  it(
    'dark ground measures the same phone',
    async () => {
      const spec: ShotSpec = {
        canvas: { width: 1320, height: 2868 },
        capture: await capture(1320, 2868),
        ground: 'dark',
        headline: 'YouTube: російські відео сховано',
      };
      const plan = await planShot(spec);
      const real = await measurePhone(await renderShot(spec));
      expect(real.outerWidth).toBeCloseTo(plan.layout.phone.width, -1);
      expect(real.gaps.left).toBeGreaterThanOrEqual(82);
    },
    TIMEOUT,
  );

  it(
    'is byte-stable: two renders are identical',
    async () => {
      const spec: ShotSpec = {
        canvas: { width: 1320, height: 2868 },
        capture: await capture(1320, 2868),
        ground: 'dark',
        headline: 'Російську навіть не запропонує',
      };
      const [a, b] = [await renderShot(spec), await renderShot(spec)];
      expect(a.equals(b)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'refuses a headline that wraps to more than 3 lines (measured, not counted)',
    async () => {
      const spec: ShotSpec = {
        canvas: { width: 1320, height: 2868 },
        capture: await capture(1320, 2868),
        ground: 'light',
        headline:
          'Сайт одразу українською без вікна вибору мови і без зайвих запитань про російську',
      };
      await expect(renderShot(spec)).rejects.toMatchObject({ code: 'headline-lines' });
      await expect(renderShot(spec)).rejects.toBeInstanceOf(RenderGuardError);
    },
    TIMEOUT,
  );

  it(
    'keeps short headlines to their own line count',
    async () => {
      const plan = await planShot({
        canvas: { width: 1320, height: 2868 },
        capture: await capture(1320, 2868),
        ground: 'light',
        headline: 'Пошук — українською',
      });
      expect(plan.layout.headline.lines).toBe(1);
    },
    TIMEOUT,
  );

  it(
    'draws a CTA pill only where it is allowed',
    async () => {
      const spec: ShotSpec = {
        canvas: { width: 1080, height: 1920 },
        capture: await capture(1320, 2868),
        ground: 'dark',
        headline: 'Пошук — українською',
        cta: { x: 68, y: 40, width: 420, height: 96, label: 'Завантажити' },
      };
      const png = await renderShot(spec);
      expect((await sharp(png).metadata()).width).toBe(1080);
      await expect(
        renderShot({
          ...spec,
          cta: { x: 300, y: 1000, width: 420, height: 96, label: 'Завантажити' },
        }),
      ).rejects.toMatchObject({ code: 'cta-overlap' });
    },
    TIMEOUT,
  );
});
