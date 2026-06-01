// @ts-check
/**
 * Extension ESLint config — WXT + React 19 + TypeScript. Layers the workspace
 * `base` (TS + type-aware rules) and `react` (hooks + a11y) presets, then
 * relaxes a few rules that don't fit a browser-extension content-script
 * world.
 */
import {
  workspaceIgnores,
  base,
  boundaries,
  quality,
  react,
  tests,
  ukrainian,
} from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...react,
  ...boundaries,
  ...tests,
  ...ukrainian,
  // Content scripts run in arbitrary page contexts; `console.warn` for
  // diagnostics is the standard escape hatch when debug logging matters.
  // Keep `error` on direct `console.log` so prod builds stay quiet.
  {
    files: ['src/entrypoints/**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // The preview shim entry is a TS file bundled by esbuild at wxt
  // `build:done` and inlined into popup.html / options.html when
  // `MOVAR_PREVIEW=1`. Dev-only diagnostics through `console.*` are the
  // whole point of the shim — log freely here.
  {
    files: ['preview/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Build/release helpers under `scripts/` are Node ESM modules invoked by
  // shell scripts (e.g. scripts/verify-release.sh). They legitimately use
  // `process` and `console`, and they never run inside the extension itself.
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
  // Storybook config + scene stories. Layout-only React, no extension APIs;
  // the stories use the popup as a real consumer but the `browser.*` calls
  // they trigger go through the `withBrowserMock` decorator. The decorator
  // and the stories live outside `src/`, so we re-target the React preset's
  // file globs explicitly here.
  {
    files: ['.storybook/**/*.{ts,tsx}', 'store-assets/storyboards/**/*.{ts,tsx}'],
    rules: {
      // Story files render React markup at module top-level via the
      // `render` field — no console usage expected, but if a future
      // decorator logs for diagnostics we don't want to wrestle eslint.
      'no-console': 'off',
    },
  },
];
