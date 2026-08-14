import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import nodePath from 'node:path';

/**
 * The kernel's purity is a **claim in a published document**: a report replays
 * years later because `evaluate()` does no I/O, reads no DOM, and consults no
 * clock. That claim decays the moment someone reaches for `fetch` inside a rule
 * because it was convenient, so it is asserted here rather than trusted.
 *
 * The collector is the deliberate exception. It lives under `src/collect/`,
 * behind the `@movar/audit/collect-node` subpath, exactly as
 * `@movar/lang-detect` keeps its franc-free barrel with an opt-in `/franc`
 * subpath. Importing the main barrel must never pull `jsdom` or a socket.
 */

const SRC = new URL('.', import.meta.url).pathname;

/** Everything reachable from the main barrel — i.e. all of `src/` bar the collector. */
function kernelSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = nodePath.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'collect') walk(full);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      if (entry.endsWith('.test.ts')) continue;
      found.push(full);
    }
  };
  walk(SRC);
  return found;
}

/** Modules that would make `evaluate()` impure, non-replayable, or DOM-bound. */
const FORBIDDEN = [
  'jsdom',
  'node:fs',
  'node:http',
  'node:https',
  'node:net',
  'node:child_process',
  'undici',
  'playwright',
  '@movar/lang-pickers',
];

/** `Date.now()` / `Math.random()` would make the same bundle produce two reports. */
const FORBIDDEN_CALLS = ['Date.now(', 'Math.random(', 'new Date('];

describe('kernel purity', () => {
  const sources = kernelSources();

  it('finds the kernel sources it means to check', () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.some((file) => file.includes('evaluate.ts'))).toBe(true);
  });

  it('excludes the collector, which is the deliberate exception', () => {
    expect(sources.some((file) => file.includes(`${nodePath.sep}collect${nodePath.sep}`))).toBe(
      false,
    );
  });

  it.each(FORBIDDEN)('never imports %s outside src/collect/', (module) => {
    const offenders = sources.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        source.includes(`from '${module}'`) ||
        source.includes(`from "${module}"`) ||
        source.includes(`require('${module}')`)
      );
    });
    expect(offenders.map((file) => nodePath.relative(SRC, file))).toEqual([]);
  });

  it.each(FORBIDDEN_CALLS)('never calls %s — the same bundle must replay identically', (call) => {
    const offenders = sources.filter((file) => readFileSync(file, 'utf8').includes(call));
    expect(offenders.map((file) => nodePath.relative(SRC, file))).toEqual([]);
  });
});
