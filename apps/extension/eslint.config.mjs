// @ts-check
/**
 * Extension ESLint config — WXT + React 19 + TypeScript. Layers the workspace
 * `base` (TS + type-aware rules) and `react` (hooks + a11y) presets, then
 * relaxes a few rules that don't fit a browser-extension content-script
 * world.
 */
import { workspaceIgnores, base, boundaries, quality, react, tests } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...react,
  ...boundaries,
  ...tests,
  // Content scripts run in arbitrary page contexts; `console.warn` for
  // diagnostics is the standard escape hatch when debug logging matters.
  // Keep `error` on direct `console.log` so prod builds stay quiet.
  {
    files: ['src/entrypoints/**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
];
