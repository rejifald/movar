/**
 * Static import-graph boundary guard.
 *
 * Asserts that the structural conceal chunk (`features/conceal.ts`) and the
 * page-content model entries (`sites/google/model.ts`) never reach presenter UI
 * modules (curtain / tooltip / i18n-content / page-mode observer/apply/context/
 * registry / content-presenter-factory) through their **value**-import graphs.
 *
 * Motivation: today the boundary holds only because the offending imports are
 * written as `import type`. Nothing enforces that. A dropped `type` keyword
 * would silently pull presenter bytes into the structural chunk, loading them
 * on every page even in hide mode. This test fails the moment such a regression
 * is introduced — before any build or runtime.
 *
 * The walker (`walkValueGraph`) and the `FORBIDDEN_PATTERNS` it checks now live
 * in `./import-graph.test-utils`, shared with `model-purity.test.ts` and the
 * diagnostics contract test so all three boundary guards agree on the same
 * forbidden surface (and the `modelPurity` ESLint preset mirrors that list).
 */
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walkValueGraph, findViolations } from './import-graph.test-utils';

const EXTENSION_SRC = path.resolve(__dirname, '..');

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
