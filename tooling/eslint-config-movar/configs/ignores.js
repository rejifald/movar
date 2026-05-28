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
    // Storybook static build output — only present after
    // `pnpm build-storybook` (or the capture script) runs. Bundled
    // third-party code inside trips every modernisation rule in
    // unicorn / no-undef and is not lintable.
    '**/storybook-static/**',
    // Demo-video pipeline output — captured WebM and ffmpeg derivations.
    'apps/e2e/demo-results/**',
    'apps/e2e/src/demo/out/**',
    // Per-developer runtime junk that doesn't get committed (see .gitignore)
    // but does sit on disk under apps/* and would otherwise trip
    // browser-flavoured globals (e.g. Firefox prefs.js's `user_pref`).
    '**/.firefox-profile/**',
    '**/.wrangler/**',
  ],
};
