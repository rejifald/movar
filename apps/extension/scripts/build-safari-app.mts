/*
 * Build a locally-installable, development-signed macOS `Movar.app` from the
 * Safari Xcode wrapper.
 *
 * THIS NEEDS AN APPLE DEVELOPER ACCOUNT, and used not to. The script signed
 * ad-hoc (`CODE_SIGN_IDENTITY=-`, `DEVELOPMENT_TEAM=`) on the premise that
 * running the app on this Mac needs no team — true, until #171 gave both macOS
 * targets the `group.fyi.movar.safari` App Group. An App Group is a
 * profile-restricted entitlement: ad-hoc has no profile to carry it, so
 * xcodebuild refuses the build outright ("requires a provisioning profile"),
 * for the app and the appex alike. It had been failing that way since.
 *
 * Dropping the entitlement instead would have kept the promise and broken the
 * thing being tested: the App Group IS the settings bridge between the
 * extension and the host app, so a local build without it runs a Movar whose
 * popup and Settings tab no longer see the same record. Better to need an
 * account than to ship a local build that behaves differently from the real
 * one.
 *
 * So signing is simply left to the project (`CODE_SIGN_STYLE = Automatic`,
 * `DEVELOPMENT_TEAM` in `project.pbxproj`) rather than overridden here, and
 * `-allowProvisioningUpdates` lets Xcode fetch or refresh the profile. The
 * release-grade *distribution* build still lives in CI, which signs manually
 * against its own certificates (`docs/`, `.github/workflows/release.yml`).
 *
 * Pipeline:
 *   1. `pnpm build:safari` — WXT `-b safari` build + `sync-safari-resources.mts`,
 *      which populates the gitignored `Shared (Extension)/Resources/`. This MUST
 *      run before xcodebuild: a fresh checkout has empty Resources, so the
 *      compiled `.appex` would ship without a manifest and Safari would reject it.
 *   2. `xcodebuild build` of the shared `Movar (macOS)` scheme, signed by the
 *      project's own automatic settings, with the app version fed from
 *      package.json via `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`
 *      build-setting overrides. The targets use `GENERATE_INFOPLIST_FILE=YES`,
 *      so these flow into the synthesized Info.plist without mutating the
 *      committed `project.pbxproj`.
 *   3. Copy the product to `.output/safari/Movar.app` with `ditto` (bundle-safe:
 *      preserves the signature seal and any internal symlinks) and print the
 *      steps to load it into Safari.
 *
 * A development signature is enough to RUN the app on this Mac, but Safari only
 * loads a Web Extension that is not distribution-signed after you enable
 * Develop ▸ Allow Unsigned Extensions.
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

// 1c. Audit engine bundle. The headless `engine.js` an offscreen WebView runs;
// built and synced here for the same reason as 1b — it is build output a fresh
// checkout does not have — and for one more that is not negotiable: every store
// forbids downloading and executing code at runtime (Apple 2.5.2, Play's
// device-and-network-abuse policy), so the bundle has to be inside the `.app`
// before the copy phase. Fetching it later would be a violation, not an
// optimisation (docs/native-shells.md, "Store constraints").
run('pnpm', ['--filter', '@movar/audit-engine', 'build'], path.resolve(ROOT, '..', '..'));

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
  // No signing overrides: the project already declares automatic signing and
  // the team, and overriding either is what broke this build (see the header).
  // `-allowProvisioningUpdates` lets Xcode create or refresh the App Group
  // profile without a trip through the Signing & Capabilities editor.
  '-allowProvisioningUpdates',
  'build',
]);

// 3. Copy the bundle out with ditto (preserves the signature seal + symlinks).
rmSync(OUT_APP, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
run('ditto', [PRODUCT, OUT_APP]);

process.stdout.write(
  `\n[movar:safari-app] built Movar ${version} → ${path.relative(process.cwd(), OUT_APP)}\n\n` +
    `Load it into Safari:\n` +
    `  1. open "${OUT_APP}"   — run the app once so Safari registers the extension.\n` +
    `  2. Safari ▸ Settings ▸ Extensions — enable “Movar”.\n` +
    `  3. First run only: Safari ▸ Settings ▸ Advanced ▸ “Show features for web developers”,\n` +
    `     then Develop ▸ “Allow Unsigned Extensions” (this build is development-signed,\n` +
    `     not distribution-signed; the toggle resets on each Safari launch).\n`,
);
