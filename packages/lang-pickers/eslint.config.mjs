// @ts-check
import {
  workspaceIgnores,
  base,
  strictPackages,
  quality,
  tests,
  ukrainian,
  modelPurity,
} from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...strictPackages,
  ...quality,
  ...tests,
  ...ukrainian,
  ...modelPurity,
];
