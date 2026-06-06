// @ts-check
/**
 * React preset — layered on `base`. Built around @eslint-react (the modern,
 * type-aware React plugin), with eslint-plugin-react kept only for the couple
 * of rules @eslint-react doesn't provide, react-hooks' latest flat config, and
 * jsx-a11y in strict mode.
 *
 * Scoping (mind the per-project sharding documented in base.js — see the
 * `files` globs below for exact patterns):
 *   1. eslint-plugin-react + jsx-a11y are NOT type-aware, so they run on every
 *      `.tsx` file — including stories/demos that live outside `src`.
 *   2. @eslint-react `strict-type-checked` IS type-aware, so it's scoped to
 *      `.tsx` under `src` only, matching base's `projectService` scope (outside
 *      src there's no type info and it would error). Its companion
 *      `disable-conflict-eslint-plugin-react` ruleset is folded in so the
 *      eslint-plugin-react rules it supersedes don't double-report. Both ship
 *      the `@eslint-react` plugin, so their rules are merged into ONE config
 *      object — registering the plugin twice would throw "Cannot redefine".
 *   3. react-hooks `recommended-latest` (flat) runs on `.tsx` plus the `.ts`
 *      custom-hook patterns (`hooks/` dirs and `use-*` files).
 *
 * eslint-plugin-react is deliberately KEPT (not removed): `disable-conflict`
 * references `react/...` rule ids, which requires the `react` plugin to stay
 * registered, and it still carries `no-unescaped-entities` + `self-closing-comp`
 * that @eslint-react has no equivalent for.
 */
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import eslintReact from '@eslint-react/eslint-plugin';
import { asErrors } from './_severity.js';

const reactXStrict = eslintReact.configs['strict-type-checked'];
const reactXDisableConflict = eslintReact.configs['disable-conflict-eslint-plugin-react'];
const reactHooksLatest = reactHooksPlugin.configs.flat['recommended-latest'];

/** @type {import("eslint").Linter.Config[]} */
export const react = [
  // 1. eslint-plugin-react + jsx-a11y (strict) — non-type-aware, every .tsx.
  {
    files: ['**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...asErrors(reactPlugin.configs.recommended.rules),
      ...asErrors(reactPlugin.configs['jsx-runtime'].rules),
      ...asErrors(jsxA11yPlugin.flatConfigs.strict.rules),
      // TypeScript covers prop typing — react/prop-types is noise here.
      'react/prop-types': 'off',
      // High-signal a11y rules kept explicit at error.
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      // Extras @eslint-react has no equivalent for — stay on everywhere.
      'react/no-unescaped-entities': 'error',
      'react/self-closing-comp': 'error',
      // These overlap @eslint-react. On `src/**` the disable-conflict ruleset
      // (config 2) turns the react/ versions off in favour of @eslint-react's;
      // on non-src .tsx (stories) these stay the active implementation.
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/no-array-index-key': 'error',
    },
  },
  // 2. @eslint-react strict + type-checked — src/** only (needs base's
  //    projectService). disable-conflict folded in (one @eslint-react reg).
  {
    files: ['src/**/*.tsx'],
    plugins: reactXStrict.plugins,
    settings: reactXStrict.settings,
    rules: {
      ...asErrors(reactXStrict.rules),
      ...reactXDisableConflict.rules,
    },
  },
  // 3. react-hooks latest flat config — .tsx plus .ts custom-hook files. Hook
  //    rules only fire on actual hook calls, so the wider .ts globs are free.
  {
    files: ['**/*.tsx', '**/hooks/**/*.ts', '**/use-*.ts'],
    plugins: reactHooksLatest.plugins,
    rules: {
      ...asErrors(reactHooksLatest.rules),
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
