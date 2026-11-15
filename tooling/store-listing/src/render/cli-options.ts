/** Pure parts of the `frame` CLI: option validation and the per-shot measurement record. */
import path from 'node:path';
import type { Layout } from './layout.js';
import type { Locale } from './listing.config.js';
import type { PhoneMeasurement } from './measure.js';

export interface RawCliValues {
  readonly captures?: string | undefined;
  readonly out?: string | undefined;
  readonly locale?: string | undefined;
}

export interface ParsedCliOptions {
  readonly captures: string;
  readonly out: string;
  readonly locale: Locale;
}

/** Throws the CLI's usage errors; returns the validated options. */
export function parseCliOptions(values: RawCliValues): ParsedCliOptions {
  if (values.captures === undefined || values.out === undefined) {
    throw new Error('Usage: cli.ts --captures <dir> --out <dir> --locale uk|en');
  }
  if (values.locale !== 'uk' && values.locale !== 'en') {
    throw new Error('--locale must be uk or en');
  }
  return { captures: values.captures, out: values.out, locale: values.locale };
}

/**
 * Every listing shot must have both captures (Movar on and off): a partial or
 * empty set is a failed frame run, never a silent skip (a wrong `--captures`
 * folder skips them all).
 */
export function assertCapturesPresent(
  shots: readonly { readonly capture: string; readonly before: string }[],
  capturesDir: string,
  exists: (file: string) => boolean,
): void {
  const missing = shots
    .flatMap((shot) => [shot.capture, shot.before])
    .filter((capture) => !exists(path.join(capturesDir, capture)));
  if (missing.length > 0) {
    throw new Error(
      `captures missing in ${capturesDir}: ${missing.join(', ')} (pass the locale folder, e.g. captures/uk)`,
    );
  }
}

/**
 * measurements.json entry: layout numbers beside what the pixels measured. The
 * pixels measure the after phone only; the before phone's numbers are layout.
 */
export function shotMeasurement(layout: Layout, real: PhoneMeasurement): Record<string, unknown> {
  const { after, before } = layout;
  return {
    headlineLines: layout.headline.lines,
    device: layout.device.id,
    logoY: layout.logo.y,
    headlineY: layout.headline.y,
    after: {
      outerWidthPx: real.outerWidth,
      outerRatioMeasured: real.outerRatio,
      outerRatioDevice: after.shape.bodyRatio,
      gapsPx: real.gaps,
      rimPx: real.rimPx,
      bezelPx: real.bezelPx,
      edgeFractionMeasured: real.edgeFraction,
      screenDrawn: { width: after.screen.width, height: after.screen.height },
      screenSourceRatio: layout.capture.height / layout.capture.width,
      screenDrawnRatio: after.screen.height / after.screen.width,
      screenMeasuredWidthPx: real.screen.width,
      top: after.phone.y,
    },
    before: {
      screenDrawn: { width: before.screen.width, height: before.screen.height },
      top: before.phone.y,
      visibleStripPx: after.phone.x - before.phone.x,
      bottomCropPx: before.crop.px,
      bottomCropFraction: before.crop.fraction,
    },
  };
}
