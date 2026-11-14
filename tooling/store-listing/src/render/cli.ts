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
import { assertLayout } from './layout.js';
import { APP_STORE_CANVAS, LISTING, LISTING_GROUNDS } from './listing.config.js';
import type { Locale } from './listing.config.js';
import { measurePhone } from './measure.js';
import { planShot, renderLayout } from './render.js';
import type { ShotSpec } from './render.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      captures: { type: 'string' },
      out: { type: 'string' },
      locale: { type: 'string', default: 'uk' },
    },
  });
  if (values.captures === undefined || values.out === undefined) {
    throw new Error('Usage: cli.ts --captures <dir> --out <dir> --locale uk|en');
  }
  if (values.locale !== 'uk' && values.locale !== 'en')
    throw new Error('--locale must be uk or en');
  const locale: Locale = values.locale;
  const capturesDir = path.resolve(values.captures);
  const outDir = path.resolve(values.out);
  await mkdir(outDir, { recursive: true });

  const sheet: SheetItem[] = [];
  const measurements: Record<string, unknown> = {};
  for (const shot of LISTING) {
    const capture = path.join(capturesDir, shot.capture);
    if (!existsSync(capture)) {
      process.stdout.write(`skip ${shot.id}: no ${shot.capture}\n`);
      continue;
    }
    const spec: ShotSpec = {
      canvas: APP_STORE_CANVAS,
      capture,
      ground: shot.ground,
      background: shot.background ?? LISTING_GROUNDS[shot.ground],
      headline: shot.headline[locale],
    };
    const plan = await planShot(spec);
    assertLayout(plan.layout);
    const png = await renderLayout(plan, spec);
    await writeFile(path.join(outDir, `${shot.id}.png`), png);
    sheet.push({ label: `${shot.id} (${shot.ground})`, png });

    // Pixel checks: the real canvas (gaps) and a diagnostic extended canvas (true outer ratio).
    const real = await measurePhone(png);
    const full = await measurePhone(await renderLayout(plan, spec, { extendCanvasBelow: true }));
    const { layout } = plan;
    measurements[shot.id] = {
      headlineLines: layout.headline.lines,
      device: layout.device.id,
      outerWidthPx: real.outerWidth,
      outerRatioMeasured: full.outerRatio,
      outerRatioDevice: layout.shape.bodyRatio,
      gapsPx: real.gaps,
      rimPx: real.rimPx,
      bezelPx: real.bezelPx,
      edgeFractionMeasured: real.edgeFraction,
      screenDrawn: { width: layout.screen.width, height: layout.screen.height },
      screenSourceRatio: layout.capture.height / layout.capture.width,
      screenDrawnRatio: layout.screen.height / layout.screen.width,
      screenMeasuredWidthPx: real.screen.width,
      bottomCropPx: layout.crop.px,
      bottomCropFraction: layout.crop.fraction,
    };
    process.stdout.write(`ok   ${shot.id}\n`);
  }
  if (sheet.length > 0)
    await writeFile(path.join(outDir, 'contact-sheet.png'), await contactSheet(sheet));
  await writeFile(
    path.join(outDir, 'measurements.json'),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );
}

await main();
