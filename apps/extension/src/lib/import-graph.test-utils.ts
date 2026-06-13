/**
 * Shared static import-graph walker for the architecture-boundary contract
 * tests. Single source of truth for:
 *
 *   • `FORBIDDEN_PATTERNS` — the presenter/i18n/singleton substrings a pure
 *     graph must never reach. Mirrored by the `modelPurity` ESLint preset
 *     (`tooling/eslint-config-movar/configs/model-purity.js`) so the lint guard
 *     and the value-graph tests stay aligned.
 *   • `walkValueGraph` — follow runtime (value) edges from an entry file:
 *     static `import … from` / re-exports `export … from`, AND **dynamic**
 *     `import(...)`, skipping `import type` / `export type` and all-type named
 *     blocks. Relative `.ts` edges are resolved and recursed; bare specifiers
 *     are recorded as leaves (and, for `@movar/*`, optionally resolved to the
 *     package source so the graph crosses package boundaries).
 *   • `findViolations` — string-match the walked files + bare specifiers against
 *     `FORBIDDEN_PATTERNS`.
 *
 * Consumers: `capability-boundary.test.ts` (extension chunks), `model-purity.test.ts`
 * (the four pure-model packages' src graphs incl. dynamic imports), and
 * `apps/diagnostics`'s contract test (the diagnostics reuse graph across `@movar/*`).
 *
 * This is a `.test-utils` module — production code must not import it (the
 * `boundaries` preset forbids that). The walker is plain Node fs/regex; it does
 * not depend on a bundler, so it runs identically in every package's vitest.
 */
import path from 'node:path';
import fs from 'node:fs';

/** Presenter/i18n/singleton substrings a pure graph must never reach — matched
 *  against both resolved file paths and bare specifiers. `page-mode/detect` is
 *  intentionally absent: the pure detectors are the one allowed page-mode leaf.
 *  Keep this list in sync with `model-purity.js`'s ban globs. */
export const FORBIDDEN_PATTERNS: readonly string[] = [
  '/curtain',
  '/tooltip',
  'content-presenter-factory',
  'content-presenter',
  'page-mode/observer',
  'page-mode/apply',
  'page-mode/context',
  'page-mode/registry',
  'i18n/content',
  'i18n/messages',
];

/** Resolve a relative specifier from `fromFile` to a real `.ts`/`.tsx` file, or null. */
function resolveRelative(specifier: string, fromFile: string): string | null {
  const fromDir = path.dirname(fromFile);
  const candidates = [
    path.resolve(fromDir, specifier),
    path.resolve(fromDir, `${specifier}.ts`),
    path.resolve(fromDir, `${specifier}.tsx`),
    path.resolve(fromDir, `${specifier}/index.ts`),
    path.resolve(fromDir, `${specifier}/index.tsx`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Extract runtime (value) module specifiers — static imports, re-exports, and
 *  dynamic `import(...)` — while skipping `import type` / `export type` and
 *  named blocks that are all-type. */
export function extractValueImports(source: string): string[] {
  const specifiers: string[] = [];

  // Static `import … from '…'` and re-export `export … from '…'`.
  const edgeRegex = /^[ \t]*(?:import|export)\s+(type\s+)?([\s\S]*?)\bfrom\s+['"]([^'"]+)['"]/gm;
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

  // Bare `import '…'` side-effect imports (no `from`), e.g. `import '@movar/page-content/google'`.
  const sideEffectRegex = /^[ \t]*import\s+['"]([^'"]+)['"]/gm;
  let sideEffect = sideEffectRegex.exec(source);
  while (sideEffect !== null) {
    const specifier = sideEffect[1] ?? '';
    if (specifier.length > 0) specifiers.push(specifier);
    sideEffect = sideEffectRegex.exec(source);
  }

  // Dynamic `import('…')` — always a runtime (value) edge; a model package could
  // smuggle an impure dep past the static guards via `import()`.
  const dynamicRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let dynamic = dynamicRegex.exec(source);
  while (dynamic !== null) {
    const specifier = dynamic[1] ?? '';
    if (specifier.length > 0) specifiers.push(specifier);
    dynamic = dynamicRegex.exec(source);
  }

  return specifiers;
}

export interface GraphResult {
  resolvedFiles: Set<string>;
  bareSpecifiers: Set<string>;
}

/** Map a `@movar/<pkg>[/sub]` bare specifier to its package source file, mirroring
 *  the workspace `exports` (`.` → `src/index.ts`, `./*` → `src/*.ts`). Returns
 *  null for non-`@movar` specifiers or unresolvable subpaths. `packagesRoot`
 *  points at the `packages/` directory. */
export function resolveMovarSpecifier(specifier: string, packagesRoot: string): string | null {
  const movar = /^@movar\/([^/]+)(?:\/(.+))?$/.exec(specifier);
  if (movar === null) return null;
  const pkg = movar[1] ?? '';
  const sub = movar[2];
  const srcRoot = path.join(packagesRoot, pkg, 'src');
  const candidates =
    sub === undefined
      ? [path.join(srcRoot, 'index.ts')]
      : [
          path.join(srcRoot, `${sub}.ts`),
          path.join(srcRoot, `${sub}.tsx`),
          path.join(srcRoot, sub, 'index.ts'),
          path.join(srcRoot, sub, 'index.tsx'),
        ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export interface WalkOptions {
  /** When set, `@movar/*` bare specifiers are resolved to package sources under
   *  this `packages/` dir and recursed into — so the graph crosses package
   *  boundaries (used by the cross-package diagnostics contract test). When
   *  unset, all bare specifiers are recorded as leaves and not followed. */
  packagesRoot?: string;
}

/** Walk the transitive value-import graph from `entryFile`, recursing into
 *  relative `.ts`/`.tsx` edges (and, when `packagesRoot` is set, resolved
 *  `@movar/*` package sources). Bare specifiers that are not followed are
 *  recorded for string-checking. */
export function walkValueGraph(entryFile: string, options: WalkOptions = {}): GraphResult {
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
        continue;
      }
      // Always record the bare specifier so the string check sees it…
      bareSpecifiers.add(specifier);
      // …and, when asked, follow `@movar/*` into the package source.
      if (options.packagesRoot !== undefined) {
        const resolved = resolveMovarSpecifier(specifier, options.packagesRoot);
        if (resolved !== null && !resolvedFiles.has(resolved)) queue.push(resolved);
      }
    }
  }
  return { resolvedFiles, bareSpecifiers };
}

const normalizePath = (filePath: string): string => filePath.replace(/\\/g, '/');

/** Human-readable violation lines (empty ⇒ boundary intact). The returned array
 *  IS the assertion message: `expect(findViolations(...)).toEqual([])` prints
 *  the offending edges on failure. */
export function findViolations(label: string, graph: GraphResult): string[] {
  const violations: string[] = [];
  const scan = (kind: string, values: Iterable<string>): void => {
    for (const value of values) {
      const haystack = normalizePath(value);
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (haystack.includes(pattern)) {
          violations.push(
            `[${label}] ${kind} "${haystack}" reaches forbidden presenter/i18n/singleton ` +
              `pattern "${pattern}" — a pure graph must never pull this. If the edge is ` +
              `type-only, write it as "import type …"; otherwise it is a real boundary break`,
          );
        }
      }
    }
  };
  scan('file', graph.resolvedFiles);
  scan('specifier', graph.bareSpecifiers);
  return violations;
}
