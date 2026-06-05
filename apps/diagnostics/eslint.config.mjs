// @ts-check
/**
 * Diagnostics dev-extension ESLint config. Same workspace presets as
 * `apps/extension`, minus the storybook/preview/scripts carve-outs this app
 * doesn't have. This extension is never published — `console` IS a primary
 * surface here (the structured group output in `src/lib/diagnostics.ts` and the
 * relay/content tracing), so `no-console` is relaxed across the app rather than
 * fought file by file.
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
  // Dev tool: the console is the secondary diagnostics surface (the panel is
  // the primary one). Log freely in entrypoints and the recorder module.
  {
    files: ['src/entrypoints/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
];
