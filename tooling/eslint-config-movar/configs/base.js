// @ts-check
/**
 * Base TypeScript rules — applies to every `.ts` / `.tsx` file across the
 * workspace. Stricter rules live in the `react` preset that layers on top.
 *
 * Type-aware rules are enabled via `projectService: true` — each package's
 * tsconfig.json is discovered automatically. Cost is ~2–3× slower lint;
 * payoff is `no-floating-promises`, `no-misused-promises`, `await-thenable`,
 * etc., which catch real bugs around async/event handlers.
 *
 * The workspace exposes two flavours of the base preset:
 *   - `baseWithProjectService` — for code with a discoverable tsconfig
 *     (everything under `apps/` and `packages/`). Gets the full
 *     `strictTypeChecked + stylisticTypeChecked` rule set including the
 *     type-aware family.
 *   - `baseWithoutProjectService` — for loose `.ts` files at workspace
 *     root with no tsconfig (none today, reserve slot). Gets only the
 *     non-type-aware `strict + stylistic` rules so the parser doesn't
 *     try to load type information that isn't there.
 */
import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

// Each typescript-eslint preset is an array of configs; rules live on the
// entry whose `name` ends in `:rules`. Pluck and merge instead of spreading
// the whole preset so `files` and `languageOptions` stay under our control.
const tsRulesFrom = (preset) => preset.reduce((acc, c) => ({ ...acc, ...c.rules }), {});

const strictRules = {
  ...tsRulesFrom(tseslint.configs.strict),
  ...tsRulesFrom(tseslint.configs.stylistic),
};

const strictTypeCheckedRules = {
  ...tsRulesFrom(tseslint.configs.strictTypeChecked),
  ...tsRulesFrom(tseslint.configs.stylisticTypeChecked),
};

const workspaceOverrides = {
  'no-console': 'error',
  // Core `no-unused-vars` misfires on TS-only constructs (interface method
  // parameters, type-assertion shapes). Disable it and delegate to the
  // TS-aware variant which understands type contexts.
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
    },
  ],
  // Flag calls to symbols marked `@deprecated` — surfaces stale call sites
  // when a dependency or internal module removes an API.
  '@typescript-eslint/no-deprecated': 'error',
  // Tune type-aware rules where the defaults are noisy for movar's surface.
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
  '@typescript-eslint/restrict-template-expressions': [
    'error',
    { allowNumber: true, allowBoolean: true, allowNullish: true },
  ],
};

const tsPlugins = { '@typescript-eslint': tseslint.plugin };

/** @type {import("eslint").Linter.Config} */
const baseWithProjectService = {
  files: ['apps/**/*.{ts,tsx,mts}', 'packages/**/*.{ts,tsx,mts}'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, ecmaFeatures: { jsx: true } },
  },
  plugins: tsPlugins,
  rules: { ...strictTypeCheckedRules, ...workspaceOverrides },
};

/** @type {import("eslint").Linter.Config} */
const baseWithoutProjectService = {
  files: ['**/*.{ts,tsx,mts,cts}'],
  ignores: ['apps/**', 'packages/**'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: tsPlugins,
  // Drop the type-aware-only overrides (they're a no-op without projectService
  // but typescript-eslint still complains they're enabled).
  rules: {
    ...strictRules,
    'no-console': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  },
};

/** @type {import("eslint").Linter.Config[]} */
export const base = [
  js.configs.recommended,
  baseWithProjectService,
  baseWithoutProjectService,
  prettierConfig,
];
