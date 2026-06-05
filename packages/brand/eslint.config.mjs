// @ts-check
import { workspaceIgnores, base, quality, tests, ukrainian } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [workspaceIgnores, ...base, ...quality, ...tests, ...ukrainian];
