// @ts-check
/**
 * Safari wrapper host-app ESLint config — React 19 + TypeScript, bundled by
 * Vite. Layers the workspace `base` (TS + type-aware) and `react` (hooks +
 * a11y) presets, plus `security` for the `window`/native-bridge touch points
 * and `ukrainian` for the Cyrillic UI copy. Type-aware rules find this app's
 * `tsconfig.json` automatically (its `include` covers `src/**`).
 *
 * Mirrors `apps/safari-onboarding/eslint.config.mjs`; the two Safari WebView
 * apps share the same constraints (CSP-safe bundle, native bridge, bilingual
 * UI), so they share a lint shape.
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
  // Phase-B STUBS: the three tab bodies under `src/tabs/` declare the props
  // the shell already wires (so the shell→tab contract is type-checked now),
  // but render only a TODO marker — Phase C consumes those props when it
  // implements the tab contents. Until then `no-unused-props` would fire on
  // each declared-but-unread prop. This override is intentionally narrow (the
  // stub files only) and is removed when Phase C fills the tabs in.
  {
    files: ['src/tabs/*.tsx'],
    rules: {
      '@eslint-react/no-unused-props': 'off',
    },
  },
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
