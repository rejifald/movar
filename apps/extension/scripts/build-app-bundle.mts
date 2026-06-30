/*
 * Bundle the host app's shared logic into `Shared (App)/Resources/movar-app.js`.
 *
 * The Safari *host* app (the native wrapper users see before enabling the
 * extension) renders a hand-authored HTML/CSS/JS screen in a WKWebView under a
 * `default-src 'self'` CSP. Two real features on that screen — the standalone
 * UA/RU language-check tool and the settings panel — need code that already
 * lives in `@movar/lang-detect` and `@movar/settings`. Rather than re-implement
 * (and let it drift), we esbuild those packages into one self-hosted IIFE that
 * attaches to `window.Movar`. See `scripts/app-bundle/entry.ts`.
 *
 * Output is gitignored and regenerated here. Wire order mirrors the extension
 * Resources sync: every xcodebuild path (`build:safari:app`, the `release-safari`
 * CI job) runs `build:safari` first, and `build:safari` runs this — so the file
 * referenced by `project.pbxproj` always exists before Xcode's copy phase.
 */
import { build } from 'esbuild';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENTRY = path.join(ROOT, 'scripts', 'app-bundle', 'entry.ts');
const OUT = path.join(ROOT, 'safari', 'Movar', 'Shared (App)', 'Resources', 'movar-app.js');

await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  format: 'iife',
  // Exposed as the global `Movar` — the host page reads `window.Movar.*`. esbuild
  // declares `var Movar = (() => { ... })()` at script top level, i.e. a global.
  globalName: 'Movar',
  platform: 'browser',
  // iOS 15 / macOS 11 are the project's Safari Web Extension floor (see the
  // availability guards in SafariWebExtensionHandler.swift).
  target: ['safari15'],
  minify: true,
  // Source is tiny; a sourcemap would be dead weight in the app bundle.
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});

process.stdout.write(`[movar:app-bundle] wrote ${path.relative(ROOT, OUT)}\n`);
