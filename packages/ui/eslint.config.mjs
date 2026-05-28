// @ts-check
import { workspaceIgnores, base, quality, tests } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...quality,
  ...tests,
  // Storybook build artefacts — generated, never lint.
  { ignores: ['storybook-static/**'] },
  // Story files behave like tests: example-shaped code where repetition is the
  // point and a few production-grade hygiene rules just add noise. Layer the
  // same relaxations the `tests` preset already applies to *.test.tsx, plus a
  // couple sonarjs/unicorn relaxations specific to the demo-code shape.
  {
    files: ['**/*.stories.{ts,tsx}'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
    },
  },
];
