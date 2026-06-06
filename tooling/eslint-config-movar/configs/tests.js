// @ts-check
/**
 * Test file relaxations + Vitest lint rules. Tests are allowed to console.log
 * freely, use empty mocks, and assert non-null on DOM nodes they just
 * scaffolded — the alternative is verbose `if (el) ...` ladders that obscure
 * the intent of the test. On top of the relaxations, @vitest/eslint-plugin's
 * recommended set catches Vitest API misuse, and `no-focused-tests` is forced
 * to `error` so a stray `.only` can never silently shrink the CI suite.
 */
import vitest from '@vitest/eslint-plugin';
import { asErrors } from './_severity.js';

const TEST_GLOBS = [
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
  '**/__tests__/**/*.{ts,tsx}',
  '**/test-helpers/**/*.{ts,tsx}',
  '**/test-utils/**/*.{ts,tsx}',
  '**/*.test-utils.{ts,tsx}',
];

/** @type {import("eslint").Linter.Config[]} */
export const tests = [
  {
    files: TEST_GLOBS,
    plugins: { vitest },
    rules: {
      // recommended ships `no-disabled-tests` at `warn`; promote (error-or-off).
      // A justified skip can still use `// eslint-disable-next-line … -- why`.
      ...asErrors(vitest.configs.recommended.rules),
      // A committed `.only` / `describe.only` silently skips the rest of the
      // suite in CI — never allow it.
      'vitest/no-focused-tests': 'error',
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
];
