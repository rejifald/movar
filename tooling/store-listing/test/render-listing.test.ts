import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  APP_STORE_CANVAS,
  assertLayout,
  assertSameLogo,
  LISTING,
  planShot,
  SPLIT_TAGS,
} from '../src/render/index.js';
import type { Layout, Locale } from '../src/render/index.js';

const TIMEOUT = 120_000;

describe('the listing as a set', () => {
  it('pairs every shot with its before capture', () => {
    for (const shot of LISTING) {
      expect(shot.capture).toBe(`${shot.id}.png`);
      expect(shot.before).toBe(`${shot.id}-before.png`);
    }
  });

  it('splits every shot at exactly half, each part from its own page top', () => {
    for (const shot of LISTING) expect(shot.split).toEqual({ mode: 'tops', cut: 0.5 });
  });

  for (const locale of ['uk', 'en'] as const satisfies readonly Locale[]) {
    it(
      `${locale}: every shot passes its guards and the logo sits at one place on all of them`,
      async () => {
        const png = await sharp({
          create: { ...APP_STORE_CANVAS, channels: 3, background: '#ffffff' },
        })
          .png()
          .toBuffer();
        const layouts: Layout[] = [];
        for (const shot of LISTING) {
          const plan = await planShot({
            canvas: APP_STORE_CANVAS,
            capture: png,
            before: png,
            split: shot.split,
            tags: SPLIT_TAGS[locale],
            ground: shot.ground,
            headline: shot.headline[locale],
          });
          assertLayout(plan.layout);
          layouts.push(plan.layout);
        }
        expect(() => assertSameLogo(layouts)).not.toThrow();
        expect(new Set(layouts.map((layout) => layout.logo.y)).size).toBe(1);
        // Headlines of different lengths still sit tight above the same phone.
        expect(new Set(layouts.map((layout) => layout.phone.phone.y)).size).toBe(1);
      },
      TIMEOUT,
    );
  }
});
