/**
 * `tsx src/render/cli.ts --captures <dir> --out <dir> --locale uk|en`
 * Renders every listing shot whose capture exists, then a contact sheet and
 * measurements.json (pixel-measured, not layout-derived).
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { contactSheet } from './contact-sheet.js';
import type { SheetItem } from './contact-sheet.js';
import { parseCliOptions, shotMeasurement } from './cli-options.js';
import { assertLayout } from './layout.js';
import { APP_STORE_CANVAS, LISTING, LISTING_GROUNDS } from './listing.config.js';
import type { ListingShot, Locale } from './listing.config.js';
import { measurePhone } from './measure.js';
import { planShot, renderLayout } from './render.js';
import type { ShotSpec } from './render.js';

interface CliOptions {
  readonly capturesDir: string;
  readonly outDir: string;
  readonly locale: Locale;
}

function readOptions(): CliOptions {
  const { values } = parseArgs({
    options: {
      captures: { type: 'string' },
      out: { type: 'string' },
      locale: { type: 'string', default: 'uk' },
    },
  });
  const options = parseCliOptions(values);
  return {
    capturesDir: path.resolve(options.captures),
    outDir: path.resolve(options.out),
    locale: options.locale,
  };
}

async function renderOne(
  shot: ListingShot,
  capture: string,
  options: CliOptions,
): Promise<{ png: Buffer; measurement: Record<string, unknown> }> {
  const spec: ShotSpec = {
    canvas: APP_STORE_CANVAS,
    capture,
    ground: shot.ground,
    background: shot.background ?? LISTING_GROUNDS[shot.ground],
    headline: shot.headline[options.locale],
  };
  const plan = await planShot(spec);
  assertLayout(plan.layout);
  const png = await renderLayout(plan, spec);
  // Pixel checks: the real canvas (gaps) and a diagnostic extended canvas (true outer ratio).
  const real = await measurePhone(png);
  const full = await measurePhone(await renderLayout(plan, spec, { extendCanvasBelow: true }));
  return { png, measurement: shotMeasurement(plan.layout, real, full) };
}

async function main(): Promise<void> {
  const options = readOptions();
  await mkdir(options.outDir, { recursive: true });

  const sheet: SheetItem[] = [];
  const measurements: Record<string, unknown> = {};
  for (const shot of LISTING) {
    const capture = path.join(options.capturesDir, shot.capture);
    if (!existsSync(capture)) {
      process.stdout.write(`skip ${shot.id}: no ${shot.capture}\n`);
      continue;
    }
    const { png, measurement } = await renderOne(shot, capture, options);
    await writeFile(path.join(options.outDir, `${shot.id}.png`), png);
    sheet.push({ label: `${shot.id} (${shot.ground})`, png });
    measurements[shot.id] = measurement;
    process.stdout.write(`ok   ${shot.id}\n`);
  }
  if (sheet.length > 0)
    await writeFile(path.join(options.outDir, 'contact-sheet.png'), await contactSheet(sheet));
  await writeFile(
    path.join(options.outDir, 'measurements.json'),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );
}

await main();
