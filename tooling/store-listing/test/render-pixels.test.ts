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
      `${name}: the after phone measures whole, with its gaps, edge and body ratio`,
      async () => {
        const shot = await capture(cap[0], cap[1]);
        const spec: ShotSpec = {
          canvas: { width: canvas[0], height: canvas[1] },
          capture: shot,
          before: shot,
          ground: 'light',
          headline: 'Сайт — одразу українською',
        };
        const plan = await planShot(spec);
        const png = await renderShot(spec);
        const meta = await sharp(png).metadata();
        expect([meta.width, meta.height]).toEqual([canvas[0], canvas[1]]);

        const real = await measurePhone(png);
        const { after, minSideGap: minGap } = plan.layout;
        expect(Math.abs(real.gaps.left - after.phone.x)).toBeLessThanOrEqual(2);
        expect(real.gaps.right).toBeGreaterThanOrEqual(minGap - 2);
        expect(real.gaps.bottom).toBeGreaterThanOrEqual(minGap - 2);
        expect(Math.abs(real.gaps.top - after.phone.y)).toBeLessThanOrEqual(2);
        expect(real.edgeFraction).toBeGreaterThan(0.034);
        expect(real.edgeFraction).toBeLessThan(0.036);
        expect(Math.abs(real.screen.width - after.screen.width)).toBeLessThanOrEqual(2);
        // The after phone ends inside the canvas, so its true ratio is read off the real PNG.
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
        // A near-black before page on a dark ground: the washed before phone must
        // not be mistaken for the after phone's bezel.
        before: await capture(1320, 2868, '#000000'),
        ground: 'dark',
        headline: 'YouTube: російські відео сховано',
      };
      const plan = await planShot(spec);
      const real = await measurePhone(await renderShot(spec));
      expect(real.outerWidth).toBeCloseTo(plan.layout.after.phone.width, -1);
      expect(Math.abs(real.gaps.left - plan.layout.after.phone.x)).toBeLessThanOrEqual(2);
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
    'mutes the before phone: grey, washed toward the ground, on either tone',
    async () => {
      for (const ground of ['light', 'dark'] as const) {
        const spec: ShotSpec = {
          canvas: { width: 1320, height: 2868 },
          capture: await capture(1320, 2868),
          before: await capture(1320, 2868),
          ground,
          headline: 'Пошук — українською',
        };
        const plan = await planShot(spec);
        const png = await renderShot(spec);
        const { before, after } = plan.layout;
        const x = Math.round((before.screen.x + after.phone.x) / 2);
        const y = before.screen.y + 400;
        const { data } = await sharp(png)
          .extract({ left: x, top: y, width: 1, height: 1 })
          .raw()
          .toBuffer({ resolveWithObject: true });
        const [r = 0, g = 0, b = 0] = data;
        // The blue page comes out grey: no channel stands out.
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(6);
        // ... and pulled toward the ground: lighter than the blue on light, darker on dark.
        const lightness = ground === 'light' ? r - 130 : 110 - r;
        expect(lightness).toBeGreaterThan(0);
      }
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
          ground: 'light',
          headline: 'Пошук — українською',
        }),
      ).rejects.toMatchObject({ code: 'capture-mismatch' });
    },
    TIMEOUT,
  );
});
