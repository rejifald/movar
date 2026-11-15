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
 * Every listing shot must have its capture: a partial or empty set is a failed
 * frame run, never a silent skip (a wrong `--captures` folder skips them all).
 */
export function assertCapturesPresent(
  shots: readonly { readonly capture: string }[],
  capturesDir: string,
  exists: (file: string) => boolean,
): void {
  const missing = shots
    .map((shot) => shot.capture)
    .filter((capture) => !exists(path.join(capturesDir, capture)));
  if (missing.length > 0) {
    throw new Error(
      `captures missing in ${capturesDir}: ${missing.join(', ')} (pass the locale folder, e.g. captures/uk)`,
    );
  }
}

/** measurements.json entry: layout numbers beside what the pixels measured. */
export function shotMeasurement(
  layout: Layout,
  real: PhoneMeasurement,
  full: PhoneMeasurement,
): Record<string, unknown> {
  return {
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
}
