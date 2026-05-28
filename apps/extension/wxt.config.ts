import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// Opt-in via the `dev:firefox:installed` script: launches Firefox against a
// persistent profile under `.firefox-profile/` so storage, toolbar pin, and
// about:addons state survive between dev runs (mimics a real install).
const persistFirefoxProfile = process.env['MOVAR_FIREFOX_PERSIST'] === '1';
const firefoxProfileDir = path.resolve(import.meta.dirname, '.firefox-profile');
if (persistFirefoxProfile) {
  // web-ext requires the path to exist as a directory; otherwise it falls back
  // to treating it as a named profile and errors with "cannot be resolved to a
  // profile path". An empty dir is enough — FirefoxProfile populates it.
  mkdirSync(firefoxProfileDir, { recursive: true });
}

// Opt-in via the `preview:popup` / `preview:options` scripts: inlines the
// WebExtension API shim from `preview/preview-shim.js` into the built
// popup.html and options.html so they render under a static file server (no
// chrome.runtime). The shim is loaded *only* when this env is set — production
// builds for the store are untouched. See `preview/README.md`.
const previewShimEnabled = process.env['MOVAR_PREVIEW'] === '1';
const PREVIEW_HTML_TARGETS = ['popup.html', 'options.html'] as const;
const PREVIEW_SHIM_MARKER = '<!-- movar:preview-shim -->';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react'],
  ...(persistFirefoxProfile && {
    webExt: {
      firefoxProfile: firefoxProfileDir,
      keepProfileChanges: true,
    },
  }),
  // Force MV3 on every target (WXT defaults Firefox to MV2 otherwise).
  // Drops Firefox < 109 (Jan 2023); the realistic AMO audience is well past that.
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
    // plus the explicit floor matching the MV3 decision above.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'movar@movar.fyi',
          // 113 is the floor for the `declarativeNetRequest` permission on
          // Firefox + Firefox for Android (AMO linter:
          // PERMISSION_FIREFOX_UNSUPPORTED_BY_MIN_VERSION). MV3 itself works
          // from 109, but the extension would silently fail on 109–112
          // because dNR wouldn't be available.
          strict_min_version: '113.0',
          // Required for new AMO submissions (announced Dec 2024 — see
          // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
          // Movar collects nothing: no telemetry, no remote requests with
          // user content, no off-device storage — matches the privacy
          // policy at https://movar.fyi/privacy and the permission
          // justifications in deployment-checklist.md.
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    }),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  hooks: {
    // Inline `preview/preview-shim.js` into the static popup/options HTML so
    // the bundled module — which evaluates `browser.i18n.getUILanguage()`
    // inside React render — has a usable WebExtension surface. Runs after
    // wxt finishes its own HTML output, so we patch the on-disk files
    // directly rather than fighting Vite's transformIndexHtml lifecycle.
    'build:done': (wxt) => {
      if (!previewShimEnabled) return;
      const shimSource = readFileSync(
        path.resolve(import.meta.dirname, 'preview/preview-shim.js'),
        'utf8',
      );
      // Inline (not <script src>) so there's no second HTTP fetch and no
      // file in `.output/` that could be loaded by accident. Classic script
      // (no type=module) so it runs synchronously before the deferred
      // entry module — modules are evaluated after parsing completes, so
      // ordering is guaranteed even when this tag sits inside <head>.
      const block = `${PREVIEW_SHIM_MARKER}\n    <script>${shimSource}</script>\n  `;
      for (const htmlFile of PREVIEW_HTML_TARGETS) {
        const filePath = path.resolve(wxt.config.outDir, htmlFile);
        const html = readFileSync(filePath, 'utf8');
        if (html.includes(PREVIEW_SHIM_MARKER)) continue; // idempotent
        writeFileSync(filePath, html.replace('</head>', `${block}</head>`));
      }
      wxt.logger.warn(
        `[movar:preview] inlined preview-shim.js into ${PREVIEW_HTML_TARGETS.join(' + ')} — do NOT publish this build`,
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
