// @ts-check
import {
  workspaceIgnores,
  base,
  strictPackages,
  security,
  quality,
  tests,
  ukrainian,
} from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [
  workspaceIgnores,
  ...base,
  ...strictPackages,
  ...security,
  ...quality,
  ...tests,
  ...ukrainian,
];
