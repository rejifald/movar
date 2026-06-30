/*
 * Build a locally-installable, ad-hoc-signed macOS `Movar.app` from the Safari
 * Xcode wrapper — no Apple Developer account required.
 *
 * Pipeline:
 *   1. `pnpm build:safari` — WXT `-b safari` build + `sync-safari-resources.mts`,
 *      which populates the gitignored `Shared (Extension)/Resources/`. This MUST
 *      run before xcodebuild: a fresh checkout has empty Resources, so the
 *      compiled `.appex` would ship without a manifest and Safari would reject it.
 *   2. `xcodebuild build` of the shared `Movar (macOS)` scheme, ad-hoc signed
 *      (`CODE_SIGN_IDENTITY=-`), with the app version fed from package.json via
 *      `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` build-setting overrides.
 *      The targets use `GENERATE_INFOPLIST_FILE=YES`, so these flow into the
 *      synthesized Info.plist without mutating the committed `project.pbxproj`.
 *   3. Copy the product to `.output/safari/Movar.app` with `ditto` (bundle-safe:
 *      preserves the ad-hoc seal and any internal symlinks) and print the steps
 *      to load it into Safari.
 *
 * Ad-hoc signing is enough to RUN the app on this Mac, but Safari only loads an
 * unsigned/ad-hoc Web Extension after you enable Develop ▸ Allow Unsigned
 * Extensions. The release-grade *signed* build lives in the `release-safari` CI
 * job (.github/workflows/release.yml), not here.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJECT = path.join(ROOT, 'safari', 'Movar', 'Movar.xcodeproj');
const SCHEME = 'Movar (macOS)';
const DERIVED = path.join(ROOT, 'safari', 'build');
const PRODUCT = path.join(DERIVED, 'Build', 'Products', 'Release', 'Movar.app');
const OUT_DIR = path.join(ROOT, '.output', 'safari');
const OUT_APP = path.join(OUT_DIR, 'Movar.app');

function run(command: string, args: string[], cwd = ROOT): void {
  process.stdout.write(`\n[movar:safari-app] ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) {
    process.stderr.write(
      `[movar:safari-app] failed to spawn \`${command}\`: ${result.error.message}\n`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(
      `[movar:safari-app] \`${command}\` exited with code ${result.status ?? 'null (signal)'}\n`,
    );
    process.exit(result.status ?? 1);
  }
}

// 1. Web-extension build + resource sync (one source of truth for both).
run('pnpm', ['run', 'build:safari']);

// 1b. Host-app bundle + localized Main.html shells. The wrapper app's WKWebView
// loads the React host screen (Detector / Settings / About) from the gitignored
// `Shared (App)/Resources/host-app.{js,css}` + `*.lproj/Main.html` that
// `@movar/safari-host-app build` emits via scripts/sync-safari-app.mts. Like the
// extension Resources above, these are build output — a fresh checkout has none,
// so they MUST be (re)generated before xcodebuild's copy phase or the `.app`
// would ship the (now-deleted) static screen.
run('pnpm', ['--filter', '@movar/safari-host-app', 'build'], path.resolve(ROOT, '..', '..'));

// 2. Version from package.json → xcodebuild overrides (no project mutation).
const version = (
  JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;
const buildNumber = process.env['MOVAR_BUILD_NUMBER'] ?? '1';

run('xcodebuild', [
  '-project',
  PROJECT,
  '-scheme',
  SCHEME,
  '-configuration',
  'Release',
  '-derivedDataPath',
  DERIVED,
  '-destination',
  'generic/platform=macOS',
  `MARKETING_VERSION=${version}`,
  `CURRENT_PROJECT_VERSION=${buildNumber}`,
  'CODE_SIGN_STYLE=Manual',
  'CODE_SIGN_IDENTITY=-',
  'CODE_SIGNING_REQUIRED=YES',
  'CODE_SIGNING_ALLOWED=YES',
  'DEVELOPMENT_TEAM=',
  'build',
]);

// 3. Copy the bundle out with ditto (preserves the ad-hoc seal + symlinks).
rmSync(OUT_APP, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
run('ditto', [PRODUCT, OUT_APP]);

process.stdout.write(
  `\n[movar:safari-app] built Movar ${version} → ${path.relative(process.cwd(), OUT_APP)}\n\n` +
    `Load it into Safari:\n` +
    `  1. open "${OUT_APP}"   — run the app once so Safari registers the extension.\n` +
    `  2. Safari ▸ Settings ▸ Extensions — enable “Movar”.\n` +
    `  3. First run only: Safari ▸ Settings ▸ Advanced ▸ “Show features for web developers”,\n` +
    `     then Develop ▸ “Allow Unsigned Extensions” (this build is ad-hoc signed; the\n` +
    `     toggle resets on each Safari launch).\n`,
);
