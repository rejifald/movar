/**
 * Model-package purity contract — the value-graph counterpart to the
 * `modelPurity` ESLint preset.
 *
 * The preset (`tooling/eslint-config-movar/configs/model-purity.js`) bans
 * overlay/i18n/singleton *static* imports by specifier glob. This test closes
 * the two gaps a lint specifier-ban can't: it follows the transitive value
 * graph (so an impure dep pulled in transitively is caught), and — via the
 * shared walker's `import(...)` extraction — it catches **dynamic** imports a
 * model package could use to smuggle a presenter dep past the static guards.
 *
 * For each of the four pure-model packages it walks `src/index.ts` and every
 * non-test `src/*.ts` leaf (the `./*` export surface), asserting the reachable
 * graph never touches `FORBIDDEN_PATTERNS` (curtain/tooltip/content-presenter/
 * i18n / page-mode observer·apply·context·registry). The patterns are the same
 * object the extension's `capability-boundary.test.ts` uses, so chunk guards
 * and package guards can never drift apart.
 *
 * Lives in `apps/extension` (not the packages) so it can reach across every
 * package source from one place and reuse the extension's walker without adding
 * a cross-package test-util dependency to the pure packages themselves.
 */
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walkValueGraph, findViolations } from './import-graph.test-utils';

const PACKAGES_ROOT = path.resolve(__dirname, '../../../../packages');

const MODEL_PACKAGES = ['page-content', 'lang-pickers', 'page-language', 'page-mode'] as const;

/** Every non-test `.ts` file directly under `<pkg>/src` — the `./*` export
 *  surface plus the barrel. These are the entries a consumer can import. */
function entryFilesFor(pkg: string): string[] {
  const srcDir = path.join(PACKAGES_ROOT, pkg, 'src');
  return fs
    .readdirSync(srcDir)
    .filter(
      (name) =>
        name.endsWith('.ts') &&
        !name.endsWith('.test.ts') &&
        !name.endsWith('.test-utils.ts') &&
        name !== 'test-setup.ts',
    )
    .map((name) => path.join(srcDir, name));
}

describe('pure-model package import-graph purity', () => {
  for (const pkg of MODEL_PACKAGES) {
    it(`${pkg} value graph (incl. dynamic import) reaches no presenter/i18n/singleton`, () => {
      const entries = entryFilesFor(pkg);
      // Sanity: the package must actually expose entries; a glob that found
      // nothing would falsely pass.
      expect(entries.length).toBeGreaterThan(0);

      const violations: string[] = [];
      let totalFiles = 0;
      for (const entry of entries) {
        // Resolve @movar/* across packages too, so an impure dep reached via a
        // sibling package (e.g. page-language → lang-pickers) is still walked.
        const graph = walkValueGraph(entry, { packagesRoot: PACKAGES_ROOT });
        totalFiles += graph.resolvedFiles.size;
        violations.push(...findViolations(`${pkg}:${path.basename(entry)}`, graph));
      }
      // Sanity: a broken walker that saw empty graphs would falsely pass.
      expect(totalFiles).toBeGreaterThan(entries.length);
      expect(violations).toEqual([]);
    });
  }
});
