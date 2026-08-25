/*
 * Publish the built audit-engine bundle into the Safari wrapper app's Xcode
 * project.
 *
 * `vite build` (see `../vite.config.ts`) emits exactly one file into
 * `packages/audit-engine/dist/`:
 *   - `engine.js` — one self-contained IIFE, not ESM (`@movar/audit` +
 *                   `@movar/settings` + `@movar/lang-detect` + this package,
 *                   nothing external). Classic script, not `type="module"`:
 *                   WKWebView on a real iOS device silently fails to execute
 *                   a module script loaded from `file://` (confirmed
 *                   on-device for the host app — no console error, no network
 *                   error, the module just never runs).
 *
 * This script copies it into the App target's Resources, next to `host-app.js`.
 *
 * THIS STEP IS COMPLIANCE, NOT CONVENIENCE. All three stores prohibit
 * downloading and executing code at runtime (Apple App Store Review Guideline
 * 2.5.2; Google Play's device-and-network-abuse policy), so the engine has to
 * be inside the shipped app bundle. Fetching it from a CDN at first run would
 * be a violation on every platform — and it is exactly what makes an offscreen
 * WebView safe here where a remote one would not be. See
 * docs/native-shells.md, "Store constraints".
 *
 * Unlike `apps/safari-host-app/scripts/sync-safari-app.mts`, this writes NO
 * HTML shell. Nothing loads the engine in a visible page: the native side
 * creates a `WKWebView` that is never added to a view hierarchy and hands it
 * the source directly. There is no document to reference the bundle from, so
 * there is nothing to generate.
 *
 * Output layout (relative to `Shared (App)/Resources/`):
 *   engine.js
 *
 * The filename is stable (no content hash) because `project.pbxproj` names
 * resources literally: `host-app.js` is hashless for exactly this reason, and
 * a content-hashed engine would need the Xcode reference rewritten on every
 * rebuild.
 *
 * The chain is complete: `project.pbxproj` references `engine.js`, both Safari
 * build paths (`apps/extension/scripts/build-safari-app.mts` and
 * `scripts/prepare-safari-build.sh`) run this package's `build` first, and
 * `EngineHost.swift` loads the result into an offscreen `WKWebView`. A bare
 * `xcodebuild` skips all of that and copies whatever is already sitting in
 * Resources — so when iterating on the engine, rebuild it explicitly or an old
 * bundle silently ships into the running app. An engine that predates a request
 * kind the shell sends produces no event at all, which surfaces as a feature
 * that is simply absent rather than as an error.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
/** `packages/audit-engine` → repo root → the App target's Resources. */
const RESOURCES = path.resolve(
  ROOT,
  '..',
  '..',
  'apps',
  'extension',
  'safari',
  'Movar',
  'Shared (App)',
  'Resources',
);

const BUNDLE_NAME = 'engine.js';

function fail(message: string): never {
  process.stderr.write(`[movar:audit-engine-sync] ${message}\n`);
  // eslint-disable-next-line unicorn/no-process-exit -- a missing bundle must stop the Xcode/pnpm build with a non-zero code; throwing would bury a one-line "run the build first" under a stack trace.
  process.exit(1);
}

const bundleSrc = path.join(DIST, BUNDLE_NAME);
if (!existsSync(bundleSrc)) {
  fail(
    `missing build output ${BUNDLE_NAME} in ${DIST}\n` +
      `Run \`pnpm --filter @movar/audit-engine build:bundle\` first.`,
  );
}

// Resources/ exists in the committed project, but create defensively so a fresh
// checkout / CI runner doesn't trip over a missing dir.
mkdirSync(RESOURCES, { recursive: true });

copyFileSync(bundleSrc, path.join(RESOURCES, BUNDLE_NAME));
process.stdout.write(
  `[movar:audit-engine-sync] copied ${BUNDLE_NAME} (${statSync(bundleSrc).size} bytes) → ${RESOURCES}\n`,
);
