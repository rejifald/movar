// @ts-check
/**
 * Marketing-site ESLint config. Layers the workspace `base` + `quality`
 * presets for any TypeScript that lives outside of .astro files. The
 * .astro files themselves are type-checked by `astro check` (the
 * `typecheck` target); ESLint doesn't see them.
 */
import { workspaceIgnores, base, quality } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  {
    ignores: ['**/*.astro', 'dist/**', '.astro/**'],
  },
];
