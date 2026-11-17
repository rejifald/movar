/**
 * Window geometry for the desktop captures, as pure functions: the window size
 * every browser is put at, the X screen it lives on, how the browser's own
 * chrome (tab strip + toolbar) is measured out of a capture, and how the one
 * browser window is picked out of a window list.
 */

/** Logical window size of every desktop capture (CSS px at DPR 1 on Linux, points on a Mac). */
export const WINDOW = { width: 1440, height: 900 } as const;

/**
 * The Xvfb screen the Linux browsers run on: exactly the window, at DPR 1. There
 * is no window manager, so `import -window <id>` cannot be trusted to grab one
 * client window (CI run 44086919439 got the whole 1600×1000 screen); with the
 * screen the size of the window, the browser filling it IS the capture, and the
 * run proves it filled it (`windowFillProblem`) before keeping the frame.
 */
export const XVFB_SCREEN = { width: WINDOW.width, height: WINDOW.height, depth: 24 } as const;

/**
 * Plausible bounds of a browser's top chrome, in logical px. A measurement
 * outside them means the capture or the viewport read is wrong (a dialog, a
 * fullscreen window, a missed resize), so it fails the run instead of shipping.
 */
export const CHROME_TOP_BOUNDS = { min: 30, max: 220 } as const;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Height in capture pixels of the browser chrome above the page: the capture's
 * height minus the viewport's. Both browsers put nothing below the viewport
 * (no status bar, no download shelf in a fresh profile), so the difference is
 * all top chrome. `scale` is capture px per CSS px (1 on Xvfb).
 */
export function chromeTopFromViewport(
  captureHeight: number,
  viewportCssHeight: number,
  scale = 1,
): number {
  return assertChromeTop(Math.round(captureHeight - viewportCssHeight * scale), scale);
}

/**
 * Safari: the web area's top edge relative to the window's, from the
 * accessibility frames (points), in capture pixels.
 */
export function chromeTopFromFrames(window: Rect, webArea: Rect, scale: number): number {
  return assertChromeTop(Math.round((webArea.y - window.y) * scale), scale);
}

function assertChromeTop(px: number, scale: number): number {
  const logical = px / scale;
  if (!(logical >= CHROME_TOP_BOUNDS.min && logical <= CHROME_TOP_BOUNDS.max)) {
    throw new Error(
      `browser chrome measured ${px}px (${logical.toFixed(1)} logical): outside ${CHROME_TOP_BOUNDS.min}–${CHROME_TOP_BOUNDS.max}, the capture is not a plain browser window`,
    );
  }
  return px;
}

/** How far a capture's px-per-pt may sit from a whole number (rounding in the window server). */
const SCALE_TOLERANCE = 0.01;

/** Capture px per logical px, from a capture and the window it shows; must be an exact 1× or 2×. */
export function captureScale(captureWidth: number, windowWidth: number): number {
  const scale = captureWidth / windowWidth;
  const rounded = Math.round(scale);
  if (rounded < 1 || Math.abs(scale - rounded) > SCALE_TOLERANCE) {
    throw new Error(
      `capture ${captureWidth}px wide for a ${windowWidth}pt window: not a 1× or 2× capture`,
    );
  }
  return rounded;
}

/** A capture must show exactly the sized window. */
export function assertCaptureSize(
  actual: { width: number; height: number },
  scale = 1,
  expected: { width: number; height: number } = WINDOW,
): void {
  const w = expected.width * scale;
  const h = expected.height * scale;
  if (actual.width !== w || actual.height !== h) {
    throw new Error(`capture is ${actual.width}x${actual.height}, expected the ${w}x${h} window`);
  }
}

/** Parse `xdotool getwindowgeometry --shell <id>` (WINDOW=, X=, Y=, WIDTH=, HEIGHT=). */
export function parseXdotoolGeometry(output: string): Rect & { id: number } {
  const field = (name: string): number => {
    const value = new RegExp(String.raw`^${name}=(-?\d+)$`, 'm').exec(output)?.[1];
    if (value === undefined) throw new Error(`xdotool geometry has no ${name}: ${output.trim()}`);
    return Number(value);
  };
  return {
    id: field('WINDOW'),
    x: field('X'),
    y: field('Y'),
    width: field('WIDTH'),
    height: field('HEIGHT'),
  };
}

/** The browser's main window: the largest of the visible top-level windows. */
export function largestWindow<T extends Rect>(windows: readonly T[]): T {
  const sorted = windows.toSorted((a, b) => b.width * b.height - a.width * a.height);
  const first = sorted[0];
  if (first === undefined) throw new Error('no visible browser window');
  return first;
}

/** The sidecar the framer reads next to `<id>.png`. */
export function sidecar(chromeTop: number): string {
  return `${JSON.stringify({ chromeTop })}\n`;
}
