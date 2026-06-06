// @ts-check
import {
  workspaceIgnores,
  base,
  strictPackages,
  regexp,
  quality,
  tests,
} from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [workspaceIgnores, ...base, ...strictPackages, ...regexp, ...quality, ...tests];
