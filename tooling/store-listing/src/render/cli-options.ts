/** Pure parts of the `frame` CLI: option validation and the per-shot measurement record. */
import path from 'node:path';
import type { Layout } from './layout.js';
import type { LandscapeCanvas, ListingCanvas, Locale } from './listing.config.js';
import type { LandscapeLayout } from './layout-landscape.js';
import type { PhoneMeasurement } from './measure.js';
import type { WindowMeasurement } from './measure-landscape.js';

export interface RawCliValues {
  readonly captures?: string | undefined;
  readonly out?: string | undefined;
  readonly locale?: string | undefined;
  readonly canvas?: string | undefined;
  readonly chromeTop?: string | undefined;
}

export interface ParsedCliOptions {
  readonly captures: string;
  readonly out: string;
  readonly locale: Locale;
  readonly canvas: ListingCanvas | LandscapeCanvas;
  /** Default toolbar height (capture px) for landscape captures without a sidecar. */
  readonly chromeTop: number | undefined;
}

/** Throws the CLI's usage errors; returns the validated options. */
export function parseCliOptions(values: RawCliValues): ParsedCliOptions {
  if (values.captures === undefined || values.out === undefined) {
    throw new Error(
      'Usage: cli.ts --captures <dir> --out <dir> --locale uk|en [--canvas iphone|ipad|desktop|mac [--chrome-top <px>]]',
    );
  }
  if (values.locale !== 'uk' && values.locale !== 'en') {
    throw new Error('--locale must be uk or en');
  }
  const canvas = values.canvas ?? 'iphone';
  if (canvas !== 'iphone' && canvas !== 'ipad' && canvas !== 'desktop' && canvas !== 'mac') {
    throw new Error('--canvas must be iphone, ipad, desktop or mac');
  }
  let chromeTop: number | undefined;
  if (values.chromeTop !== undefined) {
    chromeTop = Number(values.chromeTop);
    if (!Number.isInteger(chromeTop) || chromeTop < 0) {
      throw new Error('--chrome-top must be a non-negative integer (capture px)');
    }
  }
  return {
    captures: values.captures,
    out: values.out,
    locale: values.locale,
    canvas,
    chromeTop,
  };
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

/** measurements.json entry: layout numbers beside what the pixels measured. */
export function shotMeasurement(layout: Layout, real: PhoneMeasurement): Record<string, unknown> {
  const { phone, split } = layout;
  return {
    headlineLines: layout.headline.lines,
    device: layout.device.id,
    logoY: layout.logo.y,
    headlineY: layout.headline.y,
    outerWidthPx: real.outerWidth,
    outerRatioMeasured: real.outerRatio,
    outerRatioDevice: phone.shape.bodyRatio,
    gapsPx: real.gaps,
    rimPx: real.rimPx,
    bezelPx: real.bezelPx,
    edgeFractionMeasured: real.edgeFraction,
    screenDrawn: { width: phone.screen.width, height: phone.screen.height },
    screenSourceRatio: layout.capture.height / layout.capture.width,
    screenDrawnRatio: phone.screen.height / phone.screen.width,
    screenMeasuredWidthPx: real.screen.width,
    top: phone.phone.y,
    split: {
      cut: split.cut,
      afterRows: split.afterSlice,
      beforeRows: split.beforeSlice,
      seamY: split.seam.y,
    },
  };
}

/** measurements.json entry for a landscape shot. */
export function landscapeMeasurement(
  layout: LandscapeLayout,
  real: WindowMeasurement,
): Record<string, unknown> {
  const { window: win, split } = layout;
  return {
    headlineLines: layout.headline.lines,
    logoY: layout.logo.y,
    headlineY: layout.headline.y,
    window: win.rect,
    windowRadius: win.radius,
    windowSourceRatio: layout.capture.height / layout.capture.width,
    windowDrawnRatio: win.rect.height / win.rect.width,
    chromeTop: layout.chromeTop,
    beforeChromeTop: layout.beforeChromeTop,
    gapsPx: {
      right: layout.canvas.width - win.rect.x - win.rect.width,
      top: win.rect.y,
      bottom: layout.canvas.height - win.rect.y - win.rect.height,
    },
    split: {
      cut: split.cut,
      afterRows: split.afterSlice,
      beforeRows: split.beforeSlice,
      seamY: split.seam.y,
      seamMeasured: real,
    },
  };
}
