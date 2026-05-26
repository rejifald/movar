// @ts-check
/**
 * Plain Node ESM/CJS scripts — `.mjs` / `.cjs` / `.js` files. These aren't
 * TypeScript, so the `base` preset's TS plugin doesn't apply. We still
 * want basic correctness, just not the TS-specific machinery.
 *
 * `no-console` is off here: these are CLI scripts whose job is to print.
 */
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

/** @type {import("eslint").Linter.Config[]} */
export const scripts = [
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
  },
  prettierConfig,
];
