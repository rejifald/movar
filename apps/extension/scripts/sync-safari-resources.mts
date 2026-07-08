/*
 * Mirror `.output/safari-mv3/` into the Xcode project's Extension Resources.
 *
 * The Safari Web Extension lives inside an Xcode app shell at
 * `apps/extension/safari/`. The shell's "Movar Extension" target bundles
 * everything under `Movar/Shared (Extension)/Resources/` — that's the
 * directory Safari actually loads at runtime. The Xcode project references
 * `chunks/`, `content-scripts/`, `features/`, `models/`, `_locales/`, `icon/`,
 * and `assets/` as folder references (`lastKnownFileType = folder`), so any
 * file inside gets picked up automatically on the next Xcode build. Top-level
 * files (`manifest.json`, `popup.html`, `options.html`, `background.js`,
 * `icon.svg`) have stable names, so the per-file references in
 * `Movar.xcodeproj/project.pbxproj` stay valid across rebuilds.
 *
 * `features/` and `models/` (the dynamic capability chunks the content script
 * imports via `runtime.getURL`) were missing from that list until it silently
 * broke concealment on iOS — Xcode never copied them into the `.appex`, so the
 * import 404'd on-device and capability-loader swallowed the error. The
 * post-sync guard below now fails the build if any emitted output directory
 * lacks a folder reference, so that class of drift can't recur unnoticed.
 *
 * Strategy: rsync with `--delete` so removed chunks vanish from the Xcode
 * tree. This is idempotent and survives Storybook/Vite hash rotations.
 *
 * Caller order: `wxt build -b safari` first, then this script. Wire'd
 * into the `build:safari` pnpm script and into the dev watcher
 * (`watch-safari-build.mts`) so the Xcode project always reflects the
 * latest JS build.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, '.output', 'safari-mv3');
const TARGET = path.join(ROOT, 'safari', 'Movar', 'Shared (Extension)', 'Resources');

if (!existsSync(SOURCE)) {
  process.stderr.write(
    `[movar:safari-sync] missing ${SOURCE}\n` +
      `Run \`pnpm --filter @movar/extension build:safari\` first.\n`,
  );
  process.exit(1);
}

// Resources/ is gitignored (sync target) and absent on fresh checkouts /
// CI runners. Create it on demand — rsync needs the destination to exist;
// it doesn't depend on Xcode having ever run.
mkdirSync(TARGET, { recursive: true });

// Trailing slash on SOURCE so rsync copies the *contents* of the build dir
// into TARGET, not the dir itself. `--delete` removes stale chunks. `-a`
// preserves perms/timestamps; `-v` keeps the output skimmable when run by
// the dev watcher. No `--checksum` — mtime comparison is fine for our
// post-build sync since wxt rewrites every output on each build.
const args = ['-av', '--delete', `${SOURCE}/`, TARGET];
process.stdout.write(`[movar:safari-sync] rsync ${args.join(' ')}\n`);

const result = spawnSync('rsync', args, { stdio: 'inherit' });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Guard: every top-level DIRECTORY the build emits must be wired into the Xcode
// project as a folder reference, or Xcode silently omits it from the built
// `.appex`. The file still lands in Resources/ on disk (the rsync above) but
// never ships — which is exactly how the dynamic capability chunks regressed:
// `features/` and `models/` were emitted + synced but unreferenced, so the
// content script's `import(runtime.getURL('features/conceal.js'))` 404'd
// on-device and capability-loader's `.catch(() => null)` turned it into a silent
// no-op — concealment dead on iOS while everything statically bundled worked.
//
// Checked on directories, not files: the capability-chunk class is always a
// directory, and files like `onboarding.html` are deliberately emitted-but-
// unbundled on Safari (background.ts gates onboarding to non-Safari), which a
// file-level check would flag as a false positive. Dot-dirs (e.g. Vite's
// metadata) are build scratch, never bundled.
const PBXPROJ = path.join(ROOT, 'safari', 'Movar', 'Movar.xcodeproj', 'project.pbxproj');
const pbxproj = readFileSync(PBXPROJ, 'utf8');
const emittedDirs = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => entry.name);
// Folder refs read `path = Resources/<name>;`, or quoted when the name has a
// hyphen: `path = "Resources/content-scripts"`. Match on the trailing delimiter
// (`;` or `"`) so `icon` doesn't spuriously satisfy the check for `icon.svg`.
const unreferenced = emittedDirs.filter(
  (name) => !pbxproj.includes(`Resources/${name};`) && !pbxproj.includes(`Resources/${name}"`),
);
if (unreferenced.length > 0) {
  const plural = unreferenced.length === 1 ? 'y is' : 'ies are';
  process.stderr.write(
    `[movar:safari-sync] ${unreferenced.length} build-output director${plural} not referenced in\n` +
      `  ${path.relative(ROOT, PBXPROJ)}:\n` +
      unreferenced.map((name) => `    - ${name}/\n`).join('') +
      `\nXcode only bundles referenced folders, so these would be MISSING from the built\n` +
      `.appex and any runtime.getURL('${unreferenced[0]}/…') would 404 on-device (silently —\n` +
      `capability-loader.ts swallows the import failure). Add each as a folder reference to\n` +
      `both "Movar Extension" targets — mirror how 'chunks' is wired in project.pbxproj (a\n` +
      `PBXFileReference with lastKnownFileType = folder, a Resources group child, and a\n` +
      `PBXBuildFile per target in each Copy Bundle Resources phase).\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `[movar:safari-sync] OK — all ${emittedDirs.length} emitted resource dirs referenced in the Xcode project\n`,
);
