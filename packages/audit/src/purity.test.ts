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

/** Every `.ts` under `src/`, collector included. */
function allSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = nodePath.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith('.ts')) found.push(full);
    }
  };
  walk(SRC);
  return found;
}

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

/**
 * The collector modules a **browser** runtime reuses.
 *
 * `digest-dom.ts` and `assemble.ts` are the halves of collection that are not
 * Node-specific: the host app's `WKWebView` imports them directly, digesting a
 * `DOMParser` document and letting Swift/`URLSession` do the fetching. That
 * only works while their module graph stays free of `jsdom` and `node:*` — one
 * convenience import of `JSDOM` in `digest-dom.ts` would pull a ~2 MB HTML
 * parser into a bundle whose whole point is one self-contained file, and one
 * `node:crypto` would break the build outright.
 *
 * Neither failure shows up in this package's own tests, which run under Node
 * and would keep passing. So it is asserted here, where the cost of the mistake
 * is visible, rather than discovered in an Xcode build.
 */
describe('browser-reusable collector modules', () => {
  const BROWSER_SAFE = ['collect/digest-dom.ts', 'collect/assemble.ts'];
  /** `node:` catches every builtin at once; `jsdom` is the bundle-size one. */
  const NOT_IN_A_BUNDLE = ['jsdom', 'node:'];

  it.each(BROWSER_SAFE)('%s imports nothing a browser bundle cannot take', (relative) => {
    const source = readFileSync(nodePath.join(SRC, relative), 'utf8');
    const imported = [...source.matchAll(/from '([^']+)'/gu)].map(
      ([, specifier]) => specifier ?? '',
    );
    expect(
      imported.filter((specifier) =>
        NOT_IN_A_BUNDLE.some((forbidden) => specifier.startsWith(forbidden)),
      ),
    ).toEqual([]);
  });
});

/**
 * Stray control characters have twice slipped into a template literal in this
 * package — a NUL where a space belonged, in a key-building expression. It
 * survives every other check: it compiles, it lints, the tests pass, and the
 * key still works because a NUL separates as well as a space does. What it
 * breaks is the reader, the diff, and any claim that two files use "the same
 * separator". Cheaper to assert than to notice.
 */
describe('source hygiene', () => {
  /** Tab, newline and carriage return are the only control characters source may hold. */
  const ALLOWED = new Set([9, 10, 13]);
  const LOWEST_PRINTABLE = 32;

  /** The 1-based line of the first stray control character, or `null`. */
  function strayControlLine(source: string): number | null {
    const lines = source.split('\n');
    for (const [index, line] of lines.entries()) {
      for (const character of line) {
        const code = character.codePointAt(0) ?? 0;
        if (code < LOWEST_PRINTABLE && !ALLOWED.has(code)) return index + 1;
      }
    }
    return null;
  }

  it.each(allSources())('%s carries no stray control characters', (file) => {
    const line = strayControlLine(readFileSync(file, 'utf8'));
    expect(line === null ? null : `${nodePath.relative(SRC, file)}:${line}`).toBeNull();
  });
});
