import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `sideEffects` is a **promise made to a bundler**, and only a bundler can
 * falsify it — so these two cases are real bundles rather than an assertion
 * about a field in `package.json`. Restating the declaration back to itself
 * would pass just as happily against the declaration that caused the bug.
 *
 * `esbuild` on purpose: it is what `tsup` runs, and `tsup` is what the publish
 * milestone bundles this package with.
 *
 * The shape that bites is **not** the CLI as a bundle entry point: esbuild and
 * rollup were both measured keeping an entry point's module-scope statements
 * whatever the flag says. What `"sideEffects": false` licenses is dropping a
 * module that is imported and whose exports go unused — and a module imported
 * purely for its import-time effect is exactly that. `import './cli.ts'` used
 * to bundle to the empty string: guard, `runCli`, the whole file. So the
 * declaration did not merely misdescribe the package, it booby-trapped the one
 * restructure the publish and `bin` work both want — a thin executable wrapper
 * importing a quiet module — into a binary that exits 0 having audited nothing.
 */

/** Bundle a module imported for its import-time effect alone. */
async function bundleBareImportOf(module: string): Promise<string> {
  const target = fileURLToPath(new URL(module, import.meta.url));
  const result = await build({
    stdin: {
      contents: `import ${JSON.stringify(target)};\n`,
      resolveDir: nodePath.dirname(target),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

describe('the sideEffects declaration', () => {
  it('keeps the CLI, whose import-time guard is the whole point of the module', async () => {
    expect(await bundleBareImportOf('collect/cli.ts')).toContain('isProcessEntryPoint');
  });

  /**
   * The other half of the truth, and the reason the flag is here at all: the
   * kernel really is inert on import, and a consumer that reaches for one rule
   * must not be handed the ruleset, the artifact renderer and the classifier
   * seam with it. Deleting the flag, or widening it to `true`, would fix the
   * lie above by telling a bigger one.
   */
  it('still lets the kernel barrel be dropped when nothing imports from it', async () => {
    expect((await bundleBareImportOf('index.ts')).trim()).toBe('');
  });
});
