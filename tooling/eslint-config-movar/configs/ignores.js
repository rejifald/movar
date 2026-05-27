// @ts-check
/**
 * Workspace-wide ignore patterns. Every consumer config should spread this
 * first so generated output, build artefacts, and WXT scratch end up
 * outside lint.
 */
export const workspaceIgnores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.output/**',
    '**/.wxt/**',
    '**/.firefox-profile/**',
    '**/.wrangler/**',
    '**/.nx/**',
    '**/coverage/**',
    '**/*.tsbuildinfo',
  ],
};
