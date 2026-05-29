// @ts-check
import { workspaceIgnores, base, quality, tests } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...tests,
  {
    ignores: ['playwright-report*/**', 'test-results/**', '.movar-e2e-profile/**'],
  },
  {
    // Playwright spec files are tests; loosen the same rules tests.js loosens
    // for *.test.ts so we don't fight no-console / magic-numbers in fixtures.
    files: [
      'src/**/*.spec.ts',
      'src/fixtures/**/*.ts',
      'src/sites/**/*.ts',
      'playwright.config.ts',
      'playwright.popup.config.ts',
      'playwright.offline.config.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
];
