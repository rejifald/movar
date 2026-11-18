/**
 * `tsx src/render/cli.ts --captures <dir> --out <dir> --locale uk|en [--canvas iphone|ipad|desktop|mac
 * [--chrome-top <px>]`
 * Renders every listing shot whose capture exists, then a contact sheet and
 * measurements.json (pixel-measured, not layout-derived), and `screens/<id>.webp`:
 * each shot's bare split screen for the website, which draws its own frame.
 * The landscape canvases (desktop 1280x800, mac 2560x1600) frame a real browser-window
 * capture and skip screens/: each capture's toolbar height comes from its `<name>.json`
 * sidecar (`{ "chromeTop": 87 }`, capture px), else `--chrome-top`.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { contactSheet } from './contact-sheet.js';
import type { SheetItem } from './contact-sheet.js';
import {
  assertCapturesPresent,
  landscapeMeasurement,
  parseCliOptions,
  shotMeasurement,
} from './cli-options.js';
import { assertLandscapeLayout } from './layout-landscape.js';
import { assertLayout, assertSameLogo } from './layout.js';
import {
  APP_STORE_CANVASES,
  LANDSCAPE_CANVASES,
  LISTING,
  LISTING_GROUNDS,
  SPLIT_TAGS,
} from './listing.config.js';
import type { LandscapeCanvas, ListingCanvas, ListingShot, Locale } from './listing.config.js';
import { measurePhone } from './measure.js';
import { measureWindow } from './measure-landscape.js';
import { planShot, renderLayout, renderScreen } from './render.js';
import type { ShotSpec } from './render.js';
import { planLandscapeShot, readChromeTop, renderLandscapeLayout } from './render-landscape.js';
import type { LandscapeShotSpec } from './render-landscape.js';

/** Website screen widths: 2x the CSS width the page draws each device at, at most. */
const WEB_SCREEN_WIDTH: Readonly<Record<ListingCanvas, number>> = { iphone: 720, ipad: 1200 };

interface CliOptions {
  readonly capturesDir: string;
  readonly outDir: string;
  readonly locale: Locale;
  readonly canvas: ListingCanvas | LandscapeCanvas;
  readonly chromeTop: number | undefined;
}

function readOptions(): CliOptions {
  const { values } = parseArgs({
    options: {
      captures: { type: 'string' },
      out: { type: 'string' },
      locale: { type: 'string', default: 'uk' },
      canvas: { type: 'string', default: 'iphone' },
      'chrome-top': { type: 'string' },
    },
  });
  const options = parseCliOptions({ ...values, chromeTop: values['chrome-top'] });
  return {
    capturesDir: path.resolve(options.captures),
    outDir: path.resolve(options.out),
    locale: options.locale,
    canvas: options.canvas,
    chromeTop: options.chromeTop,
  };
}

function specFor(shot: ListingShot, options: CliOptions): ShotSpec {
  return {
    canvas: APP_STORE_CANVASES[options.canvas as ListingCanvas],
    capture: path.join(options.capturesDir, shot.capture),
    before: path.join(options.capturesDir, shot.before),
    split: shot.split,
    tags: SPLIT_TAGS[options.locale],
    ground: shot.ground,
    background: shot.background ?? LISTING_GROUNDS[shot.ground],
    headline: shot.headline[options.locale],
  };
}

const isLandscape = (canvas: CliOptions['canvas']): canvas is LandscapeCanvas =>
  canvas === 'desktop' || canvas === 'mac';

/** The toolbar height of a capture: its sidecar, else the `--chrome-top` default. */
async function chromeTopFor(file: string, fallback: number | undefined): Promise<number> {
  const value = (await readChromeTop(file)) ?? fallback;
  if (value === undefined) {
    throw new Error(
      `no toolbar height for ${file}: add ${path.basename(file, path.extname(file))}.json ` +
        `({ "chromeTop": <px> }) beside it, or pass --chrome-top <px>`,
    );
  }
  return value;
}

async function landscapeSpecFor(
  shot: ListingShot,
  options: CliOptions & { canvas: LandscapeCanvas },
): Promise<LandscapeShotSpec> {
  const capture = path.join(options.capturesDir, shot.capture);
  const before = path.join(options.capturesDir, shot.before);
  const chromeTop = await chromeTopFor(capture, options.chromeTop);
  return {
    canvas: LANDSCAPE_CANVASES[options.canvas],
    capture,
    before,
    chromeTop,
    // The before capture's own toolbar, else the after's (one browser, one toolbar).
    beforeChromeTop: (await readChromeTop(before)) ?? chromeTop,
    split: shot.split,
    tags: SPLIT_TAGS[options.locale],
    ground: shot.ground,
    background: shot.background ?? LISTING_GROUNDS[shot.ground],
    headline: shot.headline[options.locale],
  };
}

async function mainLandscape(options: CliOptions & { canvas: LandscapeCanvas }): Promise<void> {
  const planned = await Promise.all(
    LISTING.map(async (shot) => {
      const spec = await landscapeSpecFor(shot, options);
      return { shot, spec, plan: await planLandscapeShot(spec) };
    }),
  );
  for (const { plan } of planned) assertLandscapeLayout(plan.layout);
  assertSameLogo(planned.map(({ plan }) => plan.layout));

  const sheet: SheetItem[] = [];
  const measurements: Record<string, unknown> = {};
  for (const { shot, spec, plan } of planned) {
    const png = await renderLandscapeLayout(plan, spec);
    await writeFile(path.join(options.outDir, `${shot.id}.png`), png);
    sheet.push({ label: `${shot.id} (${shot.ground})`, png });
    measurements[shot.id] = landscapeMeasurement(
      plan.layout,
      await measureWindow(png, plan.layout),
    );
    process.stdout.write(`ok   ${shot.id}\n`);
  }
  await writeFile(path.join(options.outDir, 'contact-sheet.png'), await contactSheet(sheet, 2));
  await writeFile(
    path.join(options.outDir, 'measurements.json'),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  const options = readOptions();
  await mkdir(options.outDir, { recursive: true });
  assertCapturesPresent(LISTING, options.capturesDir, existsSync);
  if (isLandscape(options.canvas)) {
    await mainLandscape({ ...options, canvas: options.canvas });
    return;
  }

  // Plan and check the whole set first: the logo must sit at one place on every shot.
  const planned = await Promise.all(
    LISTING.map(async (shot) => {
      const spec = specFor(shot, options);
      return { shot, spec, plan: await planShot(spec) };
    }),
  );
  for (const { plan } of planned) assertLayout(plan.layout);
  assertSameLogo(planned.map(({ plan }) => plan.layout));

  const screensDir = path.join(options.outDir, 'screens');
  await mkdir(screensDir, { recursive: true });
  const sheet: SheetItem[] = [];
  const measurements: Record<string, unknown> = {};
  for (const { shot, spec, plan } of planned) {
    const png = await renderLayout(plan, spec);
    await writeFile(path.join(options.outDir, `${shot.id}.png`), png);
    sheet.push({ label: `${shot.id} (${shot.ground})`, png });
    await writeFile(
      path.join(screensDir, `${shot.id}.webp`),
      await renderScreen(plan, WEB_SCREEN_WIDTH[options.canvas]),
    );
    measurements[shot.id] = shotMeasurement(plan.layout, await measurePhone(png));
    process.stdout.write(`ok   ${shot.id}\n`);
  }
  await writeFile(path.join(options.outDir, 'contact-sheet.png'), await contactSheet(sheet));
  await writeFile(
    path.join(options.outDir, 'measurements.json'),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );
}

await main();
