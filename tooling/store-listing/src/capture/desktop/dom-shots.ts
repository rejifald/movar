/* eslint-disable @typescript-eslint/no-magic-numbers -- poll intervals and settle times are inline on purpose */
/**
 * Drives one phase (before or after) of a desktop shot in a browser whose page
 * we can script (Firefox over WebDriver BiDi, Chrome over Playwright): open the
 * URL, wait for the asserted state, click, wait again, re-verify, then capture
 * the whole browser WINDOW and measure its chrome.
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { assertCaptureSize, chromeTopFromViewport, sidecar } from './geometry';
import { OUTER_GEOMETRY_JS, windowFillProblem } from './decisions';
import { finalChecks } from './plan';
import type { DesktopBrowser, DesktopPhase, DomCheck } from './plan';

/** What the shot runner needs from a scriptable browser. */
export interface DomDriver {
  readonly browser: DesktopBrowser;
  /** Version string for the manifest. */
  readonly version: string;
  goto(url: string): Promise<void>;
  /** Evaluate `expression` in the page; its value must be JSON-serialisable. */
  evaluate<T>(expression: string): Promise<T>;
  /** A real pointer click at viewport CSS coordinates. */
  clickAt(x: number, y: number): Promise<void>;
  /** Local mechanics check only: the page viewport, no browser chrome. */
  screenshotViewport(file: string): Promise<void>;
  close(): Promise<void>;
}

/** Captures the browser's whole window (toolbar included) to a PNG. */
export interface WindowCapturer {
  capture(file: string): Promise<void>;
}

export interface PhaseResult {
  readonly width: number;
  readonly height: number;
  /** Null for a viewport-only (local) capture. */
  readonly chromeTop: number | null;
}

const POLL_MS = 200;
const STATE_TIMEOUT_MS = 30_000;
const SETTLE_MS = 900;

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/** A check that throws (a missing node, a page mid-navigation) reads as failing. */
function guarded(js: string): string {
  return `(() => { try { return Boolean(${js}); } catch { return false; } })()`;
}

/** Every check plus the URL pattern, as one expression → the labels that fail. */
export function failingChecksJs(checks: readonly DomCheck[], urlPattern: string): string {
  const urlLabel = JSON.stringify(`URL matches /${urlPattern}/`);
  const urlTest = `new RegExp(${JSON.stringify(urlPattern)}).test(location.href)`;
  const parts = [
    `[${urlLabel}, ${urlTest}]`,
    ...checks.map((c) => `[${JSON.stringify(c.label)}, ${guarded(c.js)}]`),
  ];
  return `[${parts.join(',')}].filter(([, ok]) => !ok).map(([label]) => label)`;
}

async function failing(
  driver: DomDriver,
  checks: readonly DomCheck[],
  urlPattern: string,
): Promise<string[]> {
  try {
    return await driver.evaluate<string[]>(failingChecksJs(checks, urlPattern));
  } catch (error) {
    // A navigation in flight (Movar's redirect) tears the realm down: not yet.
    return [`page not scriptable yet (${error instanceof Error ? error.message : String(error)})`];
  }
}

async function waitForState(
  driver: DomDriver,
  checks: readonly DomCheck[],
  urlPattern: string,
  what: string,
): Promise<void> {
  const deadline = Date.now() + STATE_TIMEOUT_MS;
  let last: string[] = [];
  while (Date.now() < deadline) {
    last = await failing(driver, checks, urlPattern);
    if (last.length === 0) return;
    await sleep(POLL_MS);
  }
  const href = await driver.evaluate<string>('location.href').catch(() => '?');
  throw new Error(`${what}: state not reached at ${href}: ${last.join('; ')}`);
}

const CENTER_OF = (target: string): string => `(() => { const el = (${target});
  if (el === null || el === undefined) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`;

/** Run one phase and capture it to `file`; throws on any wrong state. */
export async function capturePhase(opts: {
  driver: DomDriver;
  capturer: WindowCapturer | null;
  phase: DesktopPhase;
  file: string;
  what: string;
}): Promise<PhaseResult> {
  const { driver, capturer, phase, file, what } = opts;
  await driver.goto(phase.url);
  await waitForState(driver, phase.ready, phase.urlPattern, `${what} (before any click)`);
  if (phase.click !== undefined) {
    const point = await driver.evaluate<{ x: number; y: number } | null>(
      CENTER_OF(phase.click.target),
    );
    if (point === null) throw new Error(`${what}: nothing to ${phase.click.label}`);
    await driver.clickAt(point.x, point.y);
    await waitForState(
      driver,
      phase.after ?? [],
      phase.urlPattern,
      `${what} (after: ${phase.click.label})`,
    );
  }
  await driver.evaluate('document.fonts.ready.then(() => true)');
  await sleep(SETTLE_MS);
  // Re-verify right before the shutter: a late mutation must not slip into the frame.
  const late = await failing(driver, finalChecks(phase), phase.urlPattern);
  if (late.length > 0)
    throw new Error(`${what}: state lost before the shutter: ${late.join('; ')}`);

  if (capturer === null) {
    await driver.screenshotViewport(file);
    const meta = await sharp(file).metadata();
    return { width: meta.width, height: meta.height, chromeTop: null };
  }
  await capturer.capture(file);
  const meta = await sharp(file).metadata();
  const size = { width: meta.width, height: meta.height };
  assertCaptureSize(size);
  // The capture is the screen; it is the window only if the browser filled it.
  const fill = windowFillProblem(await driver.evaluate<number[]>(OUTER_GEOMETRY_JS));
  if (fill !== null) throw new Error(`${what}: ${fill}`);
  const viewport = await driver.evaluate<number>('window.innerHeight');
  return { ...size, chromeTop: chromeTopFromViewport(size.height, viewport) };
}

export function writeSidecar(file: string, chromeTop: number): void {
  writeFileSync(file, sidecar(chromeTop));
}
