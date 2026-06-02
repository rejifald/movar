/*
 * Mirror `.output/safari-mv3/` into the Xcode project's Extension Resources.
 *
 * The Safari Web Extension lives inside an Xcode app shell at
 * `apps/extension/safari/`. The shell's "Movar Extension" target bundles
 * everything under `Movar/Shared (Extension)/Resources/` — that's the
 * directory Safari actually loads at runtime. The Xcode project references
 * `chunks/`, `content-scripts/`, `_locales/`, `icon/`, and `assets/` as
 * folder references (`lastKnownFileType = folder`), so any file inside
 * gets picked up automatically on the next Xcode build. Top-level files
 * (`manifest.json`, `popup.html`, `options.html`, `background.js`,
 * `icon.svg`) have stable names, so the per-file references in
 * `Movar.xcodeproj/project.pbxproj` stay valid across rebuilds.
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
import { existsSync } from 'node:fs';
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

if (!existsSync(TARGET)) {
  process.stderr.write(
    `[movar:safari-sync] missing ${TARGET}\n` +
      `The Xcode shell hasn't been generated. See deployment-checklist.md.\n`,
  );
  process.exit(1);
}

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
