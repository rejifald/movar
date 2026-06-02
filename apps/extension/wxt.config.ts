import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';
import { buildSync } from 'esbuild';
import tailwindcss from '@tailwindcss/vite';

// Opt-in via the `dev:firefox:installed` / `dev:chrome:installed` scripts:
// launches the browser against a persistent profile under `.firefox-profile/`
// or `.chromium-profile/` so storage, toolbar pin, and about:addons /
// chrome://extensions state survive between dev runs (mimics a real install).
// For Chrome, we also pre-seed `extensions.pinned_extensions` so the toolbar
// pin is present on first launch (no manual jigsaw-menu step).
const persistFirefoxProfile = process.env['MOVAR_FIREFOX_PERSIST'] === '1';
const persistChromiumProfile = process.env['MOVAR_CHROMIUM_PERSIST'] === '1';
const firefoxProfileDir = path.resolve(import.meta.dirname, '.firefox-profile');
const chromiumProfileDir = path.resolve(import.meta.dirname, '.chromium-profile');
const chromiumOutputDir = path.resolve(import.meta.dirname, '.output/chrome-mv3');
if (persistFirefoxProfile) {
  // web-ext requires the path to exist as a directory; otherwise it falls back
  // to treating it as a named profile and errors with "cannot be resolved to a
  // profile path". An empty dir is enough — FirefoxProfile populates it.
  mkdirSync(firefoxProfileDir, { recursive: true });
}
if (persistChromiumProfile) {
  // Chrome creates --user-data-dir on demand, but pre-creating it keeps the
  // first run symmetric with subsequent ones.
  mkdirSync(chromiumProfileDir, { recursive: true });
  // Log the expected extension ID so it can be compared against the ID Chrome
  // assigns at chrome://extensions — they must match for the pre-pin to apply.
  // Cheap diagnostic; only emitted under the opt-in env var.
  // eslint-disable-next-line no-console
  console.log(
    `[movar:chrome-persist] expected extension ID: ${chromeUnpackedExtensionId(chromiumOutputDir)} (from ${chromiumOutputDir})`,
  );
}

/**
 * Compute the extension ID Chrome assigns to an unpacked extension loaded from
 * `absExtensionDir`. Chrome derives it as SHA-256(path-bytes)[0:16] mapped
 * from hex (0-f) to letters (a-p); it normalises the input path via realpath
 * when the directory exists. We mirror that so the ID we pre-pin matches the
 * one Chrome computes at load time. Used only when `MOVAR_CHROMIUM_PERSIST=1`
 * — production builds never call this.
 */
function chromeUnpackedExtensionId(absExtensionDir: string): string {
  let canonical: string;
  try {
    canonical = realpathSync(absExtensionDir);
  } catch {
    canonical = absExtensionDir;
  }
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const A = 'a'.codePointAt(0) ?? 0;
  return Array.from(hash.slice(0, 32), (c) =>
    String.fromCodePoint(A + Number.parseInt(c, 16)),
  ).join('');
}

// Opt-in via the `preview:popup` / `preview:options` scripts: inlines the
// WebExtension API shim from `preview/preview-shim-entry.ts` (bundled to
// JS via esbuild at build time) into the built popup.html and options.html so
// they render under a static file server (no chrome.runtime). The shim is
// loaded *only* when this env is set — production builds for the store are
// untouched. See `preview/README.md`.
const previewShimEnabled = process.env['MOVAR_PREVIEW'] === '1';
const PREVIEW_HTML_TARGETS = ['popup.html', 'options.html'] as const;
const PREVIEW_SHIM_MARKER = '<!-- movar:preview-shim -->';
const PREVIEW_SHIM_ENTRY = path.resolve(import.meta.dirname, 'preview/preview-shim-entry.ts');

/**
 * Bundle the preview-shim entry into a self-contained IIFE string and
 * return its source. Synchronous esbuild call — the `build:done` hook
 * runs once per wxt build and the entry is tiny (≈2 KB minified). Format
 * is IIFE so the result can sit inside a classic `<script>` tag without
 * polluting globals beyond what the mock intentionally installs
 * (`globalThis.browser` / `globalThis.chrome`). `logLevel: 'warning'`
 * keeps wxt's build output readable when nothing went wrong.
 */
function bundlePreviewShim(): string {
  const bundled = buildSync({
    entryPoints: [PREVIEW_SHIM_ENTRY],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    write: false,
    minify: true,
    logLevel: 'warning',
  });
  const source = bundled.outputFiles[0]?.text;
  if (!source) {
    throw new Error('[movar:preview] esbuild produced no output for preview-shim-entry.ts');
  }
  return source;
}

/**
 * Inline a `<script>` block (the bundled preview shim) into an HTML file
 * just before `</head>`. Idempotent — the marker on the block prevents
 * a double-inline if the hook runs twice in a single build.
 *
 * Classic `<script>` (no `type=module`) so it runs synchronously before
 * the deferred entry module — modules evaluate after parsing completes,
 * so ordering is guaranteed even when this tag sits inside `<head>`.
 * Inline (not `<script src>`) so there's no second HTTP fetch and no
 * file in `.output/` that could be loaded by accident.
 */
function inlineShimIntoHtml(filePath: string, block: string): void {
  const html = readFileSync(filePath, 'utf8');
  if (html.includes(PREVIEW_SHIM_MARKER)) return;
  writeFileSync(filePath, html.replace('</head>', `${block}</head>`));
}

/**
 * Refuse to finish a build whose emitted manifest is missing
 * `background.type === 'module'`. Chrome stable from late 2025 onward
 * rejects an ESM service worker without it ("Missing field moduleType"),
 * and the popup never initialises if the SW never registers. The fix
 * lives in `src/entrypoints/background.ts` (object-form `defineBackground`
 * with `type: 'module'`); a function-form refactor or a WXT default
 * change would silently drop it. This guard validates the emitted artifact
 * — the actual thing the browser reads — so neither path can ship.
 *
 * Scope: MV3 builds with a `background` block. We don't currently target
 * MV2, and the validator skips the block-less case so unrelated config
 * shifts don't trip it.
 */
function assertBackgroundModuleType(outDir: string): void {
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    manifest_version?: number;
    background?: { type?: string };
  };
  if (manifest.manifest_version !== 3 || !manifest.background) return;
  if (manifest.background.type !== 'module') {
    throw new Error(
      `[movar:manifest-guard] ${manifestPath}: background.type must be "module" ` +
        `(got ${JSON.stringify(manifest.background.type)}). ` +
        `Check src/entrypoints/background.ts uses the object-form defineBackground ` +
        `with type: 'module'. See https://github.com/wxt-dev/wxt and PR #30.`,
    );
  }
}

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react'],
  ...((persistFirefoxProfile || persistChromiumProfile) && {
    webExt: {
      ...(persistFirefoxProfile && { firefoxProfile: firefoxProfileDir }),
      ...(persistChromiumProfile && {
        chromiumProfile: chromiumProfileDir,
        // Pre-pin the dev extension to the Chrome toolbar by seeding
        // `extensions.pinned_extensions` in the profile's Preferences before
        // launch. chrome-launcher writes prefs into
        // `<userDataDir>/Default/Preferences` every run, so the pin survives
        // user unpins (re-pinned on next launch) — exactly what "installed
        // mode" wants. The ID is computed from the unpacked output dir; if you
        // move `.output/chrome-mv3` the ID changes and the pre-pin no longer
        // matches.
        chromiumPref: {
          'extensions.pinned_extensions': [chromeUnpackedExtensionId(chromiumOutputDir)],
        },
      }),
      keepProfileChanges: true,
    },
  }),
  // Force MV3 on every target (WXT defaults Firefox to MV2 otherwise).
  // The Firefox floor is set below in `browser_specific_settings` — 140 on
  // desktop / 142 on Android — to match where `data_collection_permissions`
  // was introduced. That's well above the older `declarativeNetRequest` MV3
  // floor of 113 (May 2023), which is now moot. Without these floors AMO
  // warns that the data-collection declaration is silently ignored on the
  // older versions covered by `strict_min_version`.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'declarativeNetRequest', 'alarms', 'tabs'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    // Firefox-only: stable add-on identity for AMO + self-hosted updates,
    // and the data-collection declaration AMO now requires on all new
    // uploads (see https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
    // `required: ['none']` is the explicit "this extension transmits no data
    // off-device" sentinel — matches deployment-checklist.md §Permission
    // justifications ("nothing is synced or sent off-device").
    //
    // Floors are pinned to where `data_collection_permissions` shipped:
    // Firefox 140 (desktop) and Firefox for Android 142. Going lower makes
    // the declaration silently ignored on older versions, which AMO flags
    // with `KEY_FIREFOX_*_UNSUPPORTED_BY_MIN_VERSION` warnings on submission.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'movar@movar.fyi',
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    }),
  }),
  vite: () => ({
    // `@tailwindcss/vite`'s own types are pinned to whatever copy of
    // `vite` got hoisted at install time. With Storybook installed in
    // this package, two `vite` versions co-exist in the workspace —
    // 7.x for wxt itself and 8.x for `@storybook/builder-vite`. The
    // plugin's plugins[] satisfies the runtime contract of both but
    // declares against the newer; cast to wxt's expected shape so
    // strict typecheck is happy. The runtime call is identical.
    plugins: [tailwindcss() as unknown as never],
  }),
  hooks: {
    // Bundle `preview/preview-shim-entry.ts` (which imports the shared
    // `src/test/browser-mock.ts` and calls `installBrowserMock`) into a
    // self-contained IIFE and inline it into the built popup/options HTML.
    // The bundle path is the single source of "static-serve preview shares
    // the same WebExtension mock as Storybook stories" — `installBrowserMock`
    // lives in exactly one place and is exercised through both surfaces.
    //
    // Runs after wxt finishes its own HTML output, so we patch the on-disk
    // files directly rather than fighting Vite's transformIndexHtml lifecycle.
    'build:done': (wxt) => {
      assertBackgroundModuleType(wxt.config.outDir);
      if (!previewShimEnabled) return;
      const shimSource = bundlePreviewShim();
      const block = `${PREVIEW_SHIM_MARKER}\n    <script>${shimSource}</script>\n  `;
      for (const htmlFile of PREVIEW_HTML_TARGETS) {
        inlineShimIntoHtml(path.resolve(wxt.config.outDir, htmlFile), block);
      }
      wxt.logger.warn(
        `[movar:preview] inlined preview-shim into ${PREVIEW_HTML_TARGETS.join(' + ')} — do NOT publish this build`,
      );
      // serve's default cleanUrls redirects `/popup.html?locale=uk` to
      // `/popup` and drops the query in the process. We chose not to fight
      // that — see preview/README.md for the canonical URLs.
    },
    // Belt-and-braces guard: refuse to zip a build that has the shim baked
    // in. Stops a forgetful `MOVAR_PREVIEW=1 pnpm zip` from publishing a
    // store-ready artifact with the dev shim still inlined.
    'zip:start': () => {
      if (!previewShimEnabled) return;
      throw new Error(
        '[movar:preview] refusing to zip with MOVAR_PREVIEW=1 — preview shim is inlined into popup.html/options.html. Rebuild without the env var first.',
      );
    },
  },
});
