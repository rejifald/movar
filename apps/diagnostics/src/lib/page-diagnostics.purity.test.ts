/**
 * Diagnostics reuse-boundary contract test — the machine version of ADR
 * decision 7's "soft boundary" (`docs/diagnostics-devtools-panel.md`).
 *
 * Diagnostics reuses the product's **pure model packages as library code** and
 * must never reach into the product's *rendering* (conceal/curtain/tooltip/i18n)
 * or any `apps/extension/**` source. The historical `@product` source alias is
 * gone; the reuse is now plain `@movar/*` workspace deps. This test statically
 * walks the value-import graph from the real reuse entry (`page-diagnostics.ts`)
 * across resolved `@movar/*` package sources and asserts:
 *
 *   1. it touches ONLY the allowed surface — the four pure-model packages
 *      (`page-content`, `lang-pickers`, `page-language`, `page-mode`) plus
 *      `@movar/lang-detect`(+`/franc`), `@movar/settings`, `@movar/host-match`;
 *   2. it NEVER reaches a forbidden presenter/i18n/singleton pattern
 *      (curtain/tooltip/content-presenter/i18n / page-mode observer·apply·
 *      context·registry) — the same `FORBIDDEN_PATTERNS` the extension's
 *      `capability-boundary.test.ts` and `model-purity.test.ts` enforce.
 *
 * The walker + patterns are imported from the extension's shared
 * `import-graph.test-utils` so all three boundary guards agree (DoD: "share the
 * resolver"). That cross-app *test* import is intentional and harmless: the
 * boundary this test asserts is about the walked **production** graph below, not
 * about a test file pulling a Node-fs walker.
 */
import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walkValueGraph, findViolations } from '../../../extension/src/lib/import-graph.test-utils';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PACKAGES_ROOT = path.join(REPO_ROOT, 'packages');
const ENTRY = path.resolve(__dirname, 'page-diagnostics.ts');

/** The only `@movar/*` packages the diagnostics reuse graph is allowed to reach. */
const ALLOWED_PACKAGES = new Set([
  'page-content',
  'lang-pickers',
  'page-language',
  'page-mode',
  'lang-detect',
  'settings',
  'host-match',
]);

const movarPackageOf = (specifier: string): string | null => {
  const match = /^@movar\/([^/]+)/.exec(specifier);
  return match === null ? null : (match[1] ?? null);
};

describe('diagnostics reuse-boundary contract', () => {
  it('page-diagnostics.ts value graph touches only pure model files', () => {
    expect(fs.existsSync(ENTRY)).toBe(true);
    const graph = walkValueGraph(ENTRY, { packagesRoot: PACKAGES_ROOT });

    // Sanity: a broken walker that saw an empty graph would falsely pass. The
    // entry pulls several @movar packages and recurses into their sources.
    expect(graph.bareSpecifiers.size).toBeGreaterThan(0);
    expect(graph.resolvedFiles.size).toBeGreaterThan(5);

    // (1) No forbidden presenter/i18n/singleton edge anywhere in the graph.
    expect(findViolations('diagnostics:page-diagnostics.ts', graph)).toEqual([]);

    // (2) No reachable file lives under apps/extension — diagnostics reuses
    // packages, never the product app source.
    const extensionFiles = [...graph.resolvedFiles]
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.includes('/apps/extension/'));
    expect(extensionFiles).toEqual([]);

    // (3) Every @movar/* specifier reached resolves to an allowed package.
    const disallowed = [...graph.bareSpecifiers]
      .map(movarPackageOf)
      .filter((pkg): pkg is string => pkg !== null && !ALLOWED_PACKAGES.has(pkg));
    expect(disallowed).toEqual([]);
  });
});
