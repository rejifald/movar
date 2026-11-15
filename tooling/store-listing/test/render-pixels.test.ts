import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  measurePhone,
  planShot,
  renderShot,
  RenderGuardError,
  type ShotSpec,
} from '../src/render/index.js';

const TIMEOUT = 120_000;
const SPLIT = {
  split: { cut: 0.47 },
  tags: { after: 'З Моваром', before: 'Без Мовара' },
} as const;

async function capture(width: number, height: number, colour = '#3b82f6'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: colour } })
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
      `${name}: the phone measures whole, with its gaps, edge and body ratio`,
      async () => {
        const shot = await capture(cap[0], cap[1]);
        const spec: ShotSpec = {
          canvas: { width: canvas[0], height: canvas[1] },
          capture: shot,
          before: shot,
          ...SPLIT,
          ground: 'light',
          headline: 'Сайт — одразу українською',
        };
        const plan = await planShot(spec);
        const png = await renderShot(spec);
        const meta = await sharp(png).metadata();
        expect([meta.width, meta.height]).toEqual([canvas[0], canvas[1]]);

        const real = await measurePhone(png);
        const { phone: after, minSideGap: minGap } = plan.layout;
        expect(Math.abs(real.gaps.left - after.phone.x)).toBeLessThanOrEqual(2);
        expect(real.gaps.right).toBeGreaterThanOrEqual(minGap - 2);
        expect(real.gaps.bottom).toBeGreaterThanOrEqual(minGap - 2);
        expect(Math.abs(real.gaps.top - after.phone.y)).toBeLessThanOrEqual(2);
        expect(real.edgeFraction).toBeGreaterThan(0.034);
        expect(real.edgeFraction).toBeLessThan(0.036);
        expect(Math.abs(real.screen.width - after.screen.width)).toBeLessThanOrEqual(2);
        // The phone ends inside the canvas, so its true ratio is read off the real PNG.
        expect(real.outerRatio).toBeDefined();
        expect(Math.abs((real.outerRatio ?? 0) / after.shape.bodyRatio - 1)).toBeLessThan(0.005);
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
        // A near-black before page on a dark ground must not be mistaken for the bezel.
        before: await capture(1320, 2868, '#000000'),
        ...SPLIT,
        ground: 'dark',
        headline: 'YouTube: російські відео сховано',
      };
      const plan = await planShot(spec);
      const real = await measurePhone(await renderShot(spec));
      expect(real.outerWidth).toBeCloseTo(plan.layout.phone.phone.width, -1);
      expect(Math.abs(real.gaps.left - plan.layout.phone.phone.x)).toBeLessThanOrEqual(2);
      expect(real.gaps.bottom).toBeGreaterThanOrEqual(82);
    },
    TIMEOUT,
  );

  it(
    'is byte-stable: two renders are identical',
    async () => {
      const spec: ShotSpec = {
        canvas: { width: 1320, height: 2868 },
        capture: await capture(1320, 2868),
        before: await capture(1320, 2868, '#ef4444'),
        ...SPLIT,
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
        before: await capture(1320, 2868),
        ...SPLIT,
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
        before: await capture(1320, 2868),
        ...SPLIT,
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
        before: await capture(1320, 2868),
        ...SPLIT,
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

  it(
    'draws the after capture above the seam and the before capture below it, undimmed',
    async () => {
      const spec: ShotSpec = {
        canvas: { width: 1320, height: 2868 },
        capture: await capture(1320, 2868, '#3b82f6'),
        before: await capture(1320, 2868, '#ef4444'),
        ...SPLIT,
        ground: 'light',
        headline: 'Пошук — українською',
      };
      const plan = await planShot(spec);
      const png = await renderShot(spec);
      const { phone, split } = plan.layout;
      const pixel = async (y: number): Promise<number[]> => {
        const { data } = await sharp(png)
          .extract({ left: phone.screen.x + phone.screen.width - 60, top: y, width: 1, height: 1 })
          .raw()
          .toBuffer({ resolveWithObject: true });
        return [...data.subarray(0, 3)];
      };
      expect(await pixel(split.seam.y - 40)).toEqual([0x3b, 0x82, 0xf6]);
      expect(await pixel(split.seam.y + split.seam.height + 40)).toEqual([0xef, 0x44, 0x44]);
      // The line itself is the dark seam colour.
      const [r = 0] = await pixel(split.seam.y + Math.round(split.seam.height / 2));
      expect(r).toBeLessThan(40);
    },
    TIMEOUT,
  );

  it(
    'refuses a before capture of another size',
    async () => {
      await expect(
        renderShot({
          canvas: { width: 1320, height: 2868 },
          capture: await capture(1320, 2868),
          before: await capture(1080, 2400),
          ...SPLIT,
          ground: 'light',
          headline: 'Пошук — українською',
        }),
      ).rejects.toMatchObject({ code: 'capture-mismatch' });
    },
    TIMEOUT,
  );
});
