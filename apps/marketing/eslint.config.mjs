// @ts-check
/**
 * Marketing-site ESLint config. Layers the workspace `base` + `quality`
 * presets for any TypeScript that lives outside of .astro files. The
 * .astro files themselves are type-checked by `astro check` (the
 * `typecheck` target); ESLint doesn't see them.
 */
import { workspaceIgnores, base, quality, ukrainian } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...ukrainian,
  {
    ignores: ['**/*.astro', 'dist/**', '.astro/**'],
  },
  // Build/capture helpers under `scripts/` are Node ESM modules invoked
  // via tsx (e.g. `pnpm capture:og`). They legitimately use `process`
  // and `console` for progress output, and they never run inside the
  // shipped marketing bundle.
  {
    files: ['scripts/**/*.{mjs,mts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
