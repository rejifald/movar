// @ts-check
/**
 * Test file relaxations. Tests are allowed to console.log freely, use empty
 * mocks, and assert non-null on DOM nodes they just scaffolded — the alternative
 * is verbose `if (el) ...` ladders that obscure the intent of the test.
 */

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
    rules: {
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
