import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin, Rollup } from 'vite';

/**
 * The engine's own build identity, baked in as `__MOVAR_ENGINE_VERSION__` and
 * read back by `src/version.ts` behind a `typeof` guard (so the define-less
 * unit-test config falls back cleanly).
 *
 * This is `@movar/audit-engine`'s OWN version, not the extension's product
 * version — `__MOVAR_VERSION__`, which `apps/safari-host-app/vite.config.ts`
 * bakes from `apps/extension/package.json`, answers a different question. A
 * `Report` carries an `EngineStamp` because it is a document a site owner may
 * re-adjudicate months later against a different build; what that reader needs
 * is which ENGINE produced the verdict, not which App Store release shipped it
 * (see docs/native-shells.md, "The contract").
 *
 * Read at config load because the bundle runs from `file://` under a strict CSP
 * in a WebView with no manifest, no network and no package metadata to ask at
 * runtime.
 */
const ENGINE_VERSION = (
  JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

/**
 * The global the IIFE hangs its exports on. The engine has no side-effecting
 * entry — a shell has to reach in and call `createEngine(...)` — so the bundle
 * needs a name to be reachable at all. `evaluateJavaScript` on the Apple side,
 * `evaluateJavascript` on Android and `ExecuteScriptAsync` on WebView2 all
 * address it identically.
 */
const GLOBAL_NAME = 'MovarAuditEngine';

/**
 * Vite build for `@movar/audit-engine` — the headless half of the native
 * shells (collector + `digest-dom` + `evaluate()`, no UI).
 *
 * Goal: emit exactly ONE JavaScript file, fully self-contained, that each
 * platform loads into an **offscreen WebView that never renders**.
 * `scripts/sync-engine.mts` then copies it into the Safari app's Resources.
 *
 * WHY THIS BUILD STEP EXISTS AT ALL — it is compliance, not convenience. All
 * three stores prohibit downloading and executing code at runtime (Apple
 * App Store Review Guideline 2.5.2; Google Play's device-and-network-abuse
 * policy; the Microsoft Store equivalent). The engine therefore has to ship
 * INSIDE the app bundle: a build that fetched it from a CDN would be a
 * violation on every platform, and it is precisely what makes an offscreen
 * WebView safe here where a remote one would not be. See
 * docs/native-shells.md, "Store constraints". Nothing in this file is a
 * packaging preference that can be traded for build speed.
 *
 * Modelled on `apps/safari-host-app/vite.config.ts`, which does the same job
 * for the React host bundle; the constraints below are the ones both share.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Bake the engine's build identity in (see `ENGINE_VERSION` above). The
  // global name is the contract with `src/version.ts`, whose `typeof` guard
  // means a rename here does not throw — it silently ships every report
  // stamped `dev`. Change it in both places or not at all.
  define: {
    __MOVAR_ENGINE_VERSION__: JSON.stringify(ENGINE_VERSION),
  },
  plugins: [noStylesheet()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Library build, not an app build: the entry is a module of named exports,
    // not an HTML page. There is no index.html and nothing to inject into one.
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      name: GLOBAL_NAME,
      // Classic script, not ESM: WKWebView on a real iOS device silently
      // fails to execute a module script loaded from a `file://` URL
      // (confirmed on-device for the host app — no console error, no network
      // error, the module simply never runs). Chromium-based WebViews don't
      // hit it, which is why it stays uncaught outside a device. `iife`
      // sidesteps it entirely: a plain script with none of the module
      // fetch/CORS/MIME semantics. The offscreen WebView has no <script> tag
      // either way — the native side injects the source — and an ES module
      // string is not what `evaluateJavaScript` evaluates.
      formats: ['iife'],
      // Stable, hashless name: `project.pbxproj` names resources literally
      // (that is why `host-app.js` is hashless too), and
      // `scripts/sync-engine.mts` copies by name.
      fileName: () => 'engine.js',
    },
    // Inline every asset as a data URI rather than emitting a sidecar file.
    // A second file would be a second thing to reference from the Xcode
    // project and a second thing to forget — the guarantee this build makes
    // is one file. Generous ceiling: the engine ships no assets today, so
    // this only ever fires if one sneaks in.
    assetsInlineLimit: 1024 * 1024,
    // Readable output. This bundle is read by store reviewers checking the
    // 2.5.2 claim above and by anyone diffing what actually shipped; a
    // minified blob is a poor trade for a few tens of kilobytes on a WebView
    // that renders nothing. Rollup still tree-shakes; we just skip mangling.
    minify: false,
    rollupOptions: {
      // Nothing is external. Every workspace dependency (`@movar/audit`,
      // `@movar/settings`, `@movar/lang-detect`) is consumed in source mode
      // and bundled in — the WebView runs under `default-src 'self'` from
      // `file://` and cannot resolve, let alone fetch, a bare specifier.
      external: [],
      output: {
        // Any dynamic import gets inlined rather than emitted as a chunk the
        // CSP-bound, `file://`-loaded engine could never fetch. (Rollup
        // implies this for `iife`; stated so a future format change can't
        // quietly reintroduce chunks.)
        inlineDynamicImports: true,
      },
    },
  },
});

/**
 * Guarantee the build stays one JS file with no stylesheet beside it.
 *
 * Vite's lib mode can emit an empty `style.css` even when nothing imported
 * CSS; this engine has no UI, so that file is noise — an extra artefact to
 * sync, reference from Xcode, and explain. Drop it.
 *
 * A NON-empty stylesheet is a different animal: it means something with UI
 * leaked into a bundle whose whole premise is that it never renders. That is
 * the boundary docs/native-shells.md draws, so fail the build rather than
 * quietly deleting the evidence.
 */
/** True when a stylesheet asset carries nothing but whitespace. */
function isEmptyStylesheet(source: string | Uint8Array): boolean {
  return typeof source === 'string' ? source.trim() === '' : source.length === 0;
}

/** The `.css` assets in a bundle, paired with their emitted source. */
function stylesheetsIn(
  bundle: Rollup.OutputBundle,
): readonly (readonly [string, string | Uint8Array])[] {
  return Object.entries(bundle).flatMap(([fileName, output]) =>
    output.type === 'asset' && fileName.endsWith('.css')
      ? ([[fileName, output.source]] as const)
      : [],
  );
}

function noStylesheet(): Plugin {
  return {
    name: 'movar:no-stylesheet',
    generateBundle(_options, bundle) {
      for (const [fileName, source] of stylesheetsIn(bundle)) {
        if (!isEmptyStylesheet(source)) {
          this.error(
            `${fileName} is not empty — UI code reached @movar/audit-engine, ` +
              `which runs in a WebView that never renders. Find the CSS import and remove it.`,
          );
        }
        Reflect.deleteProperty(bundle, fileName);
      }
    },
  };
}
