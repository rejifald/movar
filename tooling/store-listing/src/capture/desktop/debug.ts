/* eslint-disable no-console -- prints where the evidence went */
/**
 * What a failed desktop capture leaves behind for the next look, written into
 * the run's debug dir (uploaded as a CI artifact) BEFORE anything is closed: the
 * step it failed in and why, a full-screen screenshot, and on Linux the X window
 * tree. Best effort: evidence never masks the failure itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { failureReport, failureStem } from './decisions';
import { out } from '../sh';
import { grabScreen, windowTree } from './x11';

const evidenced = new WeakSet<object>();

function attempt(what: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.error(`  (no ${what}: ${error instanceof Error ? error.message : String(error)})`);
  }
}

/** True the first time an error object is seen: a rethrown error is evidenced once. */
function firstSighting(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;
  const fresh = !evidenced.has(error);
  evidenced.add(error);
  return fresh;
}

/** The whole screen, plus (X11) every window on it. */
function screenEvidence(base: string): void {
  if (process.platform === 'darwin') {
    attempt('screenshot', () => out('screencapture', ['-x', `${base}.png`]));
    return;
  }
  if ((process.env['DISPLAY'] ?? '') === '') return;
  attempt('screenshot', () => {
    grabScreen(`${base}.png`);
  });
  attempt('window tree', () => {
    writeFileSync(`${base}-xwininfo.txt`, windowTree());
  });
}

/** Write the evidence for `error` into `debugDir`, once. */
export function writeFailureEvidence(debugDir: string, step: string, error: unknown): void {
  if (!firstSighting(error)) return;
  const base = path.join(debugDir, failureStem(step));
  attempt('debug dir', () => {
    mkdirSync(debugDir, { recursive: true });
    writeFileSync(`${base}.txt`, failureReport(step, error));
  });
  screenEvidence(base);
  console.error(`  failure evidence: ${base}.*`);
}
