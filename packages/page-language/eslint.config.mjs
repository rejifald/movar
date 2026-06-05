// @ts-check
import { workspaceIgnores, base, quality, tests } from '@movar/eslint-config';

/** @type {import("eslint").Linter.Config[]} */
export default [workspaceIgnores, ...base, ...quality, ...tests];
