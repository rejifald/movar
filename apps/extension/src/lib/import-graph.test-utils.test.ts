import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FORBIDDEN_PATTERNS,
  extractValueImports,
  findViolations,
  resolveMovarSpecifier,
  walkValueGraph,
} from './import-graph.test-utils';

// Covers the architecture-boundary graph walker (import-graph.test-utils.ts).
// The boundary tests (capability-boundary / model-purity / diagnostics purity)
// only exercise the high-level walkValueGraph + findViolations; this suite
// pins the parsing/resolution helpers directly so the value-edge classification
// (the thing the whole guard rests on) can't silently regress.

describe('extractValueImports', () => {
  it('captures static imports and re-exports as value edges', () => {
    const src = [
      `import { a } from './a';`,
      `import b from './b';`,
      `import * as c from './c';`,
      `export { d } from './d';`,
    ].join('\n');
    expect(extractValueImports(src)).toEqual(['./a', './b', './c', './d']);
  });

  it('skips `import type` / `export type` and all-type named blocks', () => {
    const src = [
      `import type { T } from './types';`,
      `export type { U } from './u';`,
      `import { type OnlyType } from './only-type';`,
      `import { type Mixed, value } from './mixed';`,
    ].join('\n');
    // type-only edges dropped; the mixed block keeps its value binding.
    expect(extractValueImports(src)).toEqual(['./mixed']);
  });

  it('captures side-effect and dynamic imports (the smuggling vectors)', () => {
    const src = [
      `import '@movar/page-content/google';`,
      `const m = await import('./lazy');`,
      `void import("../other");`,
    ].join('\n');
    expect(extractValueImports(src)).toEqual(['@movar/page-content/google', './lazy', '../other']);
  });

  it('returns nothing for a source with no imports', () => {
    expect(extractValueImports('export const x = 1;\n')).toEqual([]);
  });
});

describe('resolveMovarSpecifier', () => {
  const packagesRoot = path.resolve(__dirname, '../../../../packages');

  it('maps a bare @movar package to its src/index.ts', () => {
    const resolved = resolveMovarSpecifier('@movar/lang-detect', packagesRoot);
    expect(resolved).not.toBeNull();
    expect(resolved !== null && fs.existsSync(resolved)).toBe(true);
    expect(resolved?.endsWith(path.join('lang-detect', 'src', 'index.ts'))).toBe(true);
  });

  it('maps a @movar subpath to its src file', () => {
    const resolved = resolveMovarSpecifier('@movar/lang-detect/franc', packagesRoot);
    expect(resolved?.endsWith(path.join('lang-detect', 'src', 'franc.ts'))).toBe(true);
  });

  it('returns null for non-@movar specifiers and unresolvable subpaths', () => {
    expect(resolveMovarSpecifier('react', packagesRoot)).toBeNull();
    expect(resolveMovarSpecifier('@movar/lang-detect/does-not-exist', packagesRoot)).toBeNull();
  });
});

describe('walkValueGraph', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movar-graph-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const write = (rel: string, body: string): string => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    return full;
  };

  it('recurses relative edges, records bare leaves, and is cycle-safe', () => {
    const entry = write('entry.ts', `import './a';\nimport 'bare-pkg';`);
    write('a.ts', `import './b';\nimport './entry';`); // cycle back to entry
    write('b.ts', `export const b = 1;`);

    const { resolvedFiles, bareSpecifiers } = walkValueGraph(entry);
    const names = [...resolvedFiles].map((f) => path.basename(f)).toSorted();
    expect(names).toEqual(['a.ts', 'b.ts', 'entry.ts']);
    expect([...bareSpecifiers]).toEqual(['bare-pkg']);
  });

  it('does not follow @movar specifiers without packagesRoot', () => {
    const entry = write('entry.ts', `import '@movar/page-content';`);
    const { resolvedFiles, bareSpecifiers } = walkValueGraph(entry);
    expect(resolvedFiles.size).toBe(1); // entry only
    expect([...bareSpecifiers]).toEqual(['@movar/page-content']);
  });

  it('tolerates an unreadable edge target (records nothing, no throw)', () => {
    const entry = write('entry.ts', `import './missing';`);
    expect(() => walkValueGraph(entry)).not.toThrow();
    const { resolvedFiles } = walkValueGraph(entry);
    expect([...resolvedFiles].map((f) => path.basename(f))).toEqual(['entry.ts']);
  });
});

describe('findViolations', () => {
  it('flags a forbidden pattern in a resolved file or bare specifier', () => {
    const graph = {
      resolvedFiles: new Set(['/x/src/lib/curtain.ts']),
      bareSpecifiers: new Set(['@movar/extension/i18n/messages']),
    };
    const violations = findViolations('demo', graph);
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('/curtain');
    expect(violations[1]).toContain('i18n/messages');
  });

  it('returns [] when the graph reaches nothing forbidden', () => {
    const graph = {
      resolvedFiles: new Set(['/x/src/lib/classify.ts']),
      bareSpecifiers: new Set(['@movar/lang-detect', 'franc']),
    };
    expect(findViolations('clean', graph)).toEqual([]);
  });

  it('exposes the forbidden-pattern source of truth', () => {
    expect(FORBIDDEN_PATTERNS).toContain('/curtain');
    expect(FORBIDDEN_PATTERNS).toContain('i18n/messages');
    expect(FORBIDDEN_PATTERNS).not.toContain('page-mode/detect'); // the allowed leaf
  });
});
