// @ts-check
/**
 * Movar-specific boundary rules — keep platform side effects behind typed
 * wrappers so refactors don't have to chase a dozen call sites and so the
 * type narrowing the wrappers add (MovarSettings, PauseState, etc.) is
 * load-bearing rather than optional.
 *
 * Implemented with `no-restricted-syntax` rather than a bespoke plugin
 * because the predicates are simple AST shapes — adding a separate plugin
 * for two rules would be ceremony.
 *
 * Path conventions: this preset is consumed from `apps/extension/eslint.config.mjs`
 * which runs ESLint with cwd at `apps/extension/`. Globs here are therefore
 * relative to that cwd (e.g. `src/lib/settings.ts`, not the full repo path).
 */

const STORAGE_SYNC_SELECTOR =
  "MemberExpression[object.object.object.name='browser'][object.object.property.name='storage'][object.property.name='sync']";

const STORAGE_LOCAL_SELECTOR =
  "MemberExpression[object.object.object.name='browser'][object.object.property.name='storage'][object.property.name='local']";

const SETTINGS_MESSAGE =
  'Direct `browser.storage.sync.*` is restricted. Go through `src/lib/settings.ts` so settings access stays typed (MovarSettings).';

const LOCAL_MESSAGE =
  'Direct `browser.storage.local.*` is restricted. Wrap reads/writes in the appropriate module under `src/lib/` (settings.ts / pause.ts / events.ts).';

/** @type {import("eslint").Linter.Config[]} */
export const boundaries = [
  // Default: ban direct storage access for every TS file in the consumer
  // project. Applied without a `files` filter so the parent config's existing
  // include set narrows the scope.
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: STORAGE_SYNC_SELECTOR, message: SETTINGS_MESSAGE },
        { selector: STORAGE_LOCAL_SELECTOR, message: LOCAL_MESSAGE },
      ],
    },
  },
  // The wrapper modules themselves are the one allowed escape hatch.
  // native-settings.ts is the Safari App-Group bridge: it owns the device-local
  // `movar:nativeRev` reconcile cursor, so it needs the same direct-storage hatch.
  {
    files: [
      'src/lib/settings.ts',
      'src/lib/pause.ts',
      'src/lib/events.ts',
      'src/lib/native-settings.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  // Production code must not import test helpers. `*.test-utils.{ts,tsx}` are
  // testkit-only — pulling them into app code would drag mock implementations
  // into a real build.
  {
    ignores: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/*.test-utils.{ts,tsx}',
      '**/__tests__/**',
      '**/test-helpers/**',
      '**/test-utils/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*.test-utils', '**/test-utils/*', '**/test-helpers/*'],
              message:
                'Production code may not import test helpers. Move shared logic out of `*.test-utils` into a real module.',
            },
          ],
        },
      ],
    },
  },
];
