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
    // Per-developer runtime junk that doesn't get committed (see .gitignore)
    // but does sit on disk under apps/* and would otherwise trip
    // browser-flavoured globals (e.g. Firefox prefs.js's `user_pref`).
    '**/.firefox-profile/**',
    '**/.wrangler/**',
  ],
};
