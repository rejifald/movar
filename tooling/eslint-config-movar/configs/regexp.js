// @ts-check
/**
 * Regex correctness via eslint-plugin-regexp (ota-meshi). Catches real regex
 * bugs — unused/duplicate capture groups, redundant or misleading quantifiers,
 * control-character mistakes, potential super-linear backtracking, etc.
 *
 * Composed by the regex-heavy packages only: lang-detect and the page-* model
 * packages (page-content / page-language / page-mode). Scoped to `src/**` per
 * the per-project sharding base.js documents (also where `projectService` is
 * available for the type-aware regexp rules).
 */
import * as regexpPlugin from 'eslint-plugin-regexp';
import { asErrors } from './_severity.js';

const recommended = regexpPlugin.configs['flat/recommended'];

/** @type {import("eslint").Linter.Config[]} */
export const regexp = [
  {
    files: ['src/**/*.{ts,tsx,mts}'],
    plugins: recommended.plugins,
    // recommended ships several rules at `warn`; promote to `error` so they're
    // ratcheted (workspace convention is error-or-off).
    rules: asErrors(recommended.rules),
  },
];
