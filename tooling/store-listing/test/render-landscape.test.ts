import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseCliOptions } from '../src/render/cli-options.js';
import {
  assertLandscapeLayout,
  assertSameLogo,
  computeLandscapeLayout,
  LANDSCAPE_CANVASES,
  measureWindow,
  readChromeTop,
  RenderGuardError,
  renderLandscapeShot,
  SPLIT_TAGS,
  type LandscapeLayout,
  type LandscapeLayoutInput,
} from '../src/render/index.js';

const captures = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1600, height: 1000 },
  { width: 1400, height: 1120 },
] as const;

function layoutFor(
  canvasName: 'desktop' | 'mac',
  capture: { width: number; height: number },
  extra: Partial<LandscapeLayoutInput> = {},
): LandscapeLayout {
  return computeLandscapeLayout({
    canvas: LANDSCAPE_CANVASES[canvasName],
    capture,
    chromeTop: 87,
    split: { cut: 0.5 },
    headlineLines: 3,
    ...extra,
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

describe('landscape layout', () => {
  for (const name of ['desktop', 'mac'] as const) {
    for (const capture of captures) {
      it(`${name}: ${capture.width}x${capture.height}`, () => {
        const layout = layoutFor(name, capture);
        expect(codeOf(() => assertLandscapeLayout(layout))).toBeUndefined();
        const { rect } = layout.window;
        const { canvas, split, minSideGap } = layout;
        // Whole on the canvas, right-aligned, vertically centred, own aspect.
        expect(canvas.width - rect.x - rect.width).toBe(minSideGap);
        expect(Math.abs(rect.y - (canvas.height - rect.y - rect.height))).toBeLessThanOrEqual(1);
        expect(rect.y).toBeGreaterThanOrEqual(minSideGap);
        expect(
          Math.abs(rect.width / rect.height / (capture.width / capture.height) - 1),
        ).toBeLessThan(0.005);
        // Seam centred on the window's half.
        expect(
          Math.abs(split.seam.y + split.seam.height / 2 - (rect.y + rect.height / 2)),
        ).toBeLessThanOrEqual(2);
        // Captions: left of the window, each beside its own half.
        for (const c of [split.captions.after, split.captions.before]) {
          expect(c.x + c.width).toBeLessThan(rect.x);
          expect(c.x).toBeGreaterThan(layout.headline.x + layout.headline.width);
        }
        expect(split.captions.after.y).toBe(rect.y);
        expect(split.captions.before.y + split.captions.before.height).toBe(rect.y + rect.height);
        // Headline stays in the left column.
        expect(layout.headline.x + layout.headline.width).toBeLessThan(rect.x);
      });
    }
  }

  it('mac is the desktop layout scaled', () => {
    const a = layoutFor('desktop', captures[0]);
    const b = layoutFor('mac', captures[0]);
    const k = 2560 / 1280;
    expect(Math.abs(b.window.rect.width - a.window.rect.width * k)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.logo.y - a.logo.y * k)).toBeLessThanOrEqual(1);
    expect(b.window.radius).toBe(Math.round(10 * k));
  });

  it('after part keeps its toolbar; before part starts under its own toolbar', () => {
    const { split, capture } = layoutFor('desktop', captures[0]);
    expect(split.afterSlice).toEqual({ y: 0, height: 450 });
    expect(split.beforeSlice.height).toBe(capture.height - 450);
    // The line's lower half falls on toolbar rows: the page starts at chromeTop.
    expect(split.beforeSlice.y).toBeLessThanOrEqual(87);
    expect(split.beforeSlice.y).toBeGreaterThanOrEqual(80);
    const own = layoutFor('desktop', captures[0], { beforeChromeTop: 120 });
    expect(own.split.beforeSlice.y).toBeGreaterThan(split.beforeSlice.y);
  });
});

describe('landscape guards', () => {
  const ok = layoutFor('desktop', captures[0]);

  it('headline over 3 lines', () => {
    expect(
      codeOf(() => assertLandscapeLayout({ ...ok, headline: { ...ok.headline, lines: 4 } })),
    ).toBe('headline-lines');
  });
  it('headline column into the window column', () => {
    expect(
      codeOf(() => assertLandscapeLayout({ ...ok, headline: { ...ok.headline, width: 700 } })),
    ).toBe('window-overlap');
  });
  it('headline into the logo', () => {
    expect(
      codeOf(() => assertLandscapeLayout({ ...ok, headline: { ...ok.headline, y: 60 } })),
    ).toBe('headline-overlap');
  });
  it('window clipped / too close to an edge', () => {
    const rect = { ...ok.window.rect, x: ok.window.rect.x + 60 };
    expect(codeOf(() => assertLandscapeLayout({ ...ok, window: { ...ok.window, rect } }))).toBe(
      'window-clipped',
    );
    const near = { ...ok.window.rect, x: ok.window.rect.x + 20 };
    expect(
      codeOf(() => assertLandscapeLayout({ ...ok, window: { ...ok.window, rect: near } })),
    ).toBe('side-gap');
  });
  it('window drawn off its ratio', () => {
    const rect = {
      ...ok.window.rect,
      height: ok.window.rect.height - 20,
      y: ok.window.rect.y + 10,
    };
    expect(codeOf(() => assertLandscapeLayout({ ...ok, window: { ...ok.window, rect } }))).toBe(
      'picture-aspect',
    );
  });
  it('before/after of different sizes', () => {
    expect(
      codeOf(() => assertLandscapeLayout({ ...ok, beforeCapture: { width: 1440, height: 800 } })),
    ).toBe('capture-mismatch');
  });
  it('split parts under a quarter', () => {
    expect(codeOf(() => assertLandscapeLayout({ ...ok, split: { ...ok.split, cut: 0.2 } }))).toBe(
      'split-cut',
    );
  });
  it('toolbar taller than the top half, or negative', () => {
    expect(
      codeOf(() => assertLandscapeLayout(layoutFor('desktop', captures[0], { chromeTop: 460 }))),
    ).toBe('chrome-top');
    expect(
      codeOf(() => assertLandscapeLayout(layoutFor('desktop', captures[0], { chromeTop: -1 }))),
    ).toBe('chrome-top');
  });
  it('captions without room', () => {
    const squeezed = layoutFor('desktop', captures[0], {});
    const after = { ...squeezed.split.captions.after, height: 40 };
    expect(
      codeOf(() =>
        assertLandscapeLayout({
          ...squeezed,
          split: { ...squeezed.split, captions: { ...squeezed.split.captions, after } },
        }),
      ),
    ).toBe('caption-room');
    const onHeadline = { ...squeezed.split.captions.before, x: 100 };
    expect(
      codeOf(() =>
        assertLandscapeLayout({
          ...squeezed,
          split: {
            ...squeezed.split,
            captions: { ...squeezed.split.captions, before: onHeadline },
          },
        }),
      ),
    ).toBe('caption-room');
  });
  it('logo stable across a set, drift fails', () => {
    expect(codeOf(() => assertSameLogo([ok, layoutFor('desktop', captures[1])]))).toBeUndefined();
    expect(
      codeOf(() => assertSameLogo([ok, { ...ok, logo: { ...ok.logo, y: ok.logo.y + 4 } }])),
    ).toBe('logo-drift');
  });
});

describe('chromeTop contract', () => {
  it('reads the sidecar next to a capture; none means undefined', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'landscape-'));
    await writeFile(path.join(dir, 'a.json'), '{ "chromeTop": 87 }');
    expect(await readChromeTop(path.join(dir, 'a.png'))).toBe(87);
    expect(await readChromeTop(path.join(dir, 'b.png'))).toBeUndefined();
    await writeFile(path.join(dir, 'c.json'), '{ "chromeTop": -3 }');
    await expect(readChromeTop(path.join(dir, 'c.png'))).rejects.toThrow(/chromeTop/);
  });
  it('CLI accepts the landscape canvases and --chrome-top', () => {
    const base = { captures: 'c', out: 'o', locale: 'uk' };
    expect(parseCliOptions({ ...base, canvas: 'mac', chromeTop: '87' })).toMatchObject({
      canvas: 'mac',
      chromeTop: 87,
    });
    expect(() => parseCliOptions({ ...base, canvas: 'desktop', chromeTop: 'x' })).toThrow(
      /chrome-top/,
    );
  });
});

describe('landscape render', () => {
  it('draws the canvas at its size with the seam where the layout says', async () => {
    const page = (colour: string): Promise<Buffer> =>
      sharp({ create: { width: 1440, height: 900, channels: 3, background: colour } })
        .png()
        .toBuffer();
    const [after, before] = [await page('#ffffff'), await page('#ffeeee')];
    const spec = {
      canvas: LANDSCAPE_CANVASES.desktop,
      capture: after,
      before,
      chromeTop: 80,
      split: { cut: 0.5 },
      tags: SPLIT_TAGS.uk,
      ground: 'light' as const,
      headline: 'Пошук — вашою мовою',
    };
    const png = await renderLandscapeShot(spec);
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1280, 800]);
    const layout = layoutFor('desktop', { width: 1440, height: 900 }, { headlineLines: 2 });
    const real = await measureWindow(png, layout);
    expect(real.seamY).toBeDefined();
    expect(Math.abs((real.cutMeasured ?? 0) - 0.5)).toBeLessThan(0.01);
    expect(real.seamHeight).toBe(layout.split.seam.height);
    expect(await renderLandscapeShot(spec)).toEqual(png); // byte-stable
  }, 60_000);
});
