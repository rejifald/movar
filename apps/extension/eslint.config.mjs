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
  // The preview shim is a classic browser script (no module imports, no TS,
  // no extension APIs at parse time) inlined into popup.html / options.html
  // when `MOVAR_PREVIEW=1`. The workspace `base` preset only configures
  // browser globals for .ts/.tsx, so .js here needs its own block. Globals
  // are enumerated rather than pulling in `globals/browser` because this is
  // the only .js file in the package — a transitive dep just for ~6 names
  // isn't worth it.
  {
    files: ['preview/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        console: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        queueMicrotask: 'readonly',
        // `globalThis` is in es2020 lib defaults, but flat-config doesn't
        // ship them automatically when `globals` is omitted entirely.
        globalThis: 'readonly',
      },
    },
    rules: {
      // Dev-only diagnostics are the whole point of the shim — log freely.
      'no-console': 'off',
    },
  },
  // Build/release helpers under `scripts/` are Node ESM modules invoked by
  // shell scripts (e.g. scripts/verify-release.sh). They legitimately use
  // `process` and `console`, and they never run inside the extension itself.
  {
    files: ['scripts/**/*.mjs'],
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
