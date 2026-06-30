// @ts-check
/**
 * Safari wrapper onboarding-screen ESLint config — React 19 + TypeScript,
 * bundled by Vite. Layers the workspace `base` (TS + type-aware) and `react`
 * (hooks + a11y) presets, plus `security` for the `window`/native-bridge
 * touch points and `ukrainian` for the Cyrillic UI copy. Type-aware rules find
 * this app's `tsconfig.json` automatically (its `include` covers `src/**`).
 */
import {
  workspaceIgnores,
  base,
  quality,
  react,
  security,
  tests,
  ukrainian,
} from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...react,
  ...security,
  ...tests,
  ...ukrainian,
  // Vite build output — generated, never lint.
  { ignores: ['dist/**'] },
  // The build/sync helper under `scripts/` is a Node ESM module invoked via
  // tsx from the `build` script. It legitimately uses `process` + `console`
  // and never runs inside the shipped WebView bundle. `process.exit()` is the
  // standard way to surface a non-zero code to the calling shell.
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
      'unicorn/no-process-exit': 'off',
    },
  },
];
