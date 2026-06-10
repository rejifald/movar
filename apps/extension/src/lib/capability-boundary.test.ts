/**
 * Static import-graph boundary guard.
 *
 * Asserts that the structural conceal chunk (`features/conceal.ts`) and the
 * page-content model entries (`sites/google/model.ts`) never reach presenter UI
 * modules (curtain / tooltip / i18n-content / page-mode observer/apply/detect /
 * content-presenter-factory) through their **value**-import graphs.
 *
 * Motivation: today the boundary holds only because the offending imports are
 * written as `import type`. Nothing enforces that. A dropped `type` keyword
 * would silently pull presenter bytes into the structural chunk, loading them
 * on every page even in hide mode. This test fails the moment such a regression
 * is introduced — before any build or runtime.
 *
 * Implementation: read each source file, extract its runtime (value) module
 * edges — `import … from` and re-exports `export … from`, excluding `import
 * type` / `export type` and all-type named blocks — resolve relative edges to
 * real `.ts` files and recurse. Bare specifiers (`@movar/*`, npm) are recorded
 * as leaves and checked by string. A pure re-export facade like `conceal.ts`
 * has ONLY re-export edges, so re-exports must be followed or the walker sees
 * an empty graph (the size sanity-check guards that false pass).
 */
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXTENSION_SRC = path.resolve(__dirname, '..');

/** Presenter-module substrings the structural chunks must never reach through a
 *  value edge — matched against both resolved file paths and bare specifiers. */
const FORBIDDEN_PATTERNS: readonly string[] = [
  '/curtain',
  '/tooltip',
  'content-presenter-factory',
  'page-mode/observer',
  'page-mode/apply',
  'page-mode/detect',
  'i18n/content',
];

/** Resolve a relative specifier from `fromFile` to a real `.ts` file, or null. */
function resolveRelative(specifier: string, fromFile: string): string | null {
  const fromDir = path.dirname(fromFile);
  const candidates = [
    path.resolve(fromDir, specifier),
    path.resolve(fromDir, `${specifier}.ts`),
    path.resolve(fromDir, `${specifier}/index.ts`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Extract runtime (value) module specifiers — imports and re-exports — while
 *  skipping `import type` / `export type` and named blocks that are all-type. */
function extractValueImports(source: string): string[] {
  const edgeRegex = /^[ \t]*(?:import|export)\s+(type\s+)?([\s\S]*?)\bfrom\s+['"]([^'"]+)['"]/gm;
  const specifiers: string[] = [];
  let match = edgeRegex.exec(source);
  while (match !== null) {
    const typeModifier = (match[1] ?? '').trim();
    const nameClause = (match[2] ?? '').trim();
    const specifier = match[3] ?? '';
    match = edgeRegex.exec(source);

    if (typeModifier === 'type') continue;
    const namedBlock = /^\{([^}]*)\}/.exec(nameClause);
    if (namedBlock !== null) {
      const names = (namedBlock[1] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      const hasValueName = names.some((name) => !/^type\s/.test(name));
      if (!hasValueName) continue;
    }
    if (specifier.length > 0) specifiers.push(specifier);
  }
  return specifiers;
}

interface GraphResult {
  resolvedFiles: Set<string>;
  bareSpecifiers: Set<string>;
}

/** Walk the transitive value-import graph from `entryFile`, recursing only into
 *  relative `.ts` edges; bare specifiers are recorded but not followed. */
function walkValueGraph(entryFile: string): GraphResult {
  const resolvedFiles = new Set<string>();
  const bareSpecifiers = new Set<string>();
  const queue: string[] = [entryFile];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || resolvedFiles.has(file)) continue;
    resolvedFiles.add(file);

    let source: string;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const specifier of extractValueImports(source)) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(specifier, file);
        if (resolved !== null && !resolvedFiles.has(resolved)) queue.push(resolved);
      } else {
        bareSpecifiers.add(specifier);
      }
    }
  }
  return { resolvedFiles, bareSpecifiers };
}

const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/');

/** Human-readable violation lines (empty ⇒ boundary intact). The returned array
 *  IS the assertion message: `expect(findViolations(...)).toEqual([])` prints
 *  the offending edges on failure. */
function findViolations(label: string, graph: GraphResult): string[] {
  const violations: string[] = [];
  const scan = (kind: string, values: Iterable<string>): void => {
    for (const value of values) {
      const haystack = normalizePath(value);
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (haystack.includes(pattern)) {
          violations.push(
            `[${label}] ${kind} "${haystack}" reaches forbidden presenter pattern "${pattern}" — ` +
              `change this import to "import type …" so it is erased and never bundled into the structural chunk`,
          );
        }
      }
    }
  };
  scan('file', graph.resolvedFiles);
  scan('specifier', graph.bareSpecifiers);
  return violations;
}

describe('capability chunk import-graph boundary', () => {
  it('features/conceal.ts value graph does not reach any presenter module', () => {
    const entry = path.resolve(EXTENSION_SRC, 'dynamic/features/conceal.ts');
    expect(fs.existsSync(entry)).toBe(true);
    const graph = walkValueGraph(entry);
    // Sanity: a broken walker that saw an empty graph would falsely pass.
    expect(graph.resolvedFiles.size).toBeGreaterThan(1);
    expect(findViolations('features/conceal.ts', graph)).toEqual([]);
  });

  it('sites/google/model.ts value graph does not reach any presenter module', () => {
    const entry = path.resolve(EXTENSION_SRC, 'sites/google/model.ts');
    expect(fs.existsSync(entry)).toBe(true);
    const graph = walkValueGraph(entry);
    // Sanity: google.ts imports at least one @movar/* package.
    expect(graph.bareSpecifiers.size).toBeGreaterThan(0);
    expect(findViolations('sites/google/model.ts', graph)).toEqual([]);
  });
});
