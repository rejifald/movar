// @ts-check
/**
 * Workspace-root ESLint config. Covers root-level `.mjs` / `.cjs` / `.js`
 * scripts (eslint.config.mjs itself, commitlint config, etc.). Per-area
 * configs live alongside the code they govern:
 *   - apps/extension/eslint.config.mjs   — WXT + React
 *   - packages/<name>/eslint.config.mjs  — Node TypeScript
 *
 * Shared presets live in tooling/eslint-config-movar/configs/.
 */
import { workspaceIgnores, base, quality, scripts, tests, ukrainian } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...scripts,
  ...tests,
  ...ukrainian,
  // Root-level scripts and configs are CLI-shaped — `console.*` is their job.
  {
    files: ['*.{mjs,cjs,js,mts,cts}'],
    rules: {
      'no-console': 'off',
    },
  },
];
