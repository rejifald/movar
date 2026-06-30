/*
 * Watch-rebuild loop for the Safari dev workflow.
 *
 * WXT's normal dev server (`wxt -b safari`) writes popup.html and
 * options.html with `<script src="http://localhost:3001/...">` references
 * pointed at the Vite HMR endpoint. Chrome and Firefox load those fine;
 * Safari blocks them — Safari Web Extensions enforce App Transport
 * Security on extension pages, so `http://` requests are dropped and the
 * popup renders empty (`runners/safari.mjs` in WXT also doesn't actually
 * launch a browser, just logs a "load unpacked manually" warning).
 *
 * The fix is to skip the dev server entirely and produce self-contained
 * `.output/safari-mv3-dev/` builds via `wxt build --mode development`,
 * then rebuild on source changes. `wxt build` has no `--watch` flag, so
 * this script wraps the build in a `fs.watch` loop. Reload manually in
 * Safari (Develop → Web Extension Background Content → Reload) after a
 * rebuild — Safari has no HMR for Web Extensions.
 *
 * After each successful build we also rsync the output into the Xcode
 * project at `apps/extension/safari/Movar/Shared (Extension)/Resources/`
 * (see `sync-safari-resources.mts`). Without this, an Xcode build picks
 * up the snapshot the converter copied once at project-generation time
 * — divergent from the live wxt output the moment any source changes.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const CONFIG_FILE = path.join(ROOT, 'wxt.config.ts');

let current: ChildProcess | null = null;
let pendingRebuild = false;
let debounceTimer: NodeJS.Timeout | null = null;

function runBuild(): void {
  if (current) {
    // Coalesce: a build is in flight; mark that we need another after it.
    pendingRebuild = true;
    return;
  }
  pendingRebuild = false;
  process.stdout.write('\n[movar:safari-watch] wxt build -b safari --mode development\n');
  current = spawn('pnpm', ['exec', 'wxt', 'build', '-b', 'safari', '--mode', 'development'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  current.on('exit', (code) => {
    current = null;
    if (code !== 0 && code !== null) {
      process.stderr.write(`[movar:safari-watch] build exited with code ${code}\n`);
    } else {
      // Mirror the fresh output into the Xcode shell's Extension Resources so
      // an open Xcode session can rebuild the .appex from the latest JS.
      // Skipped on build failure to avoid clobbering a known-good Resources
      // dir with broken/missing files.
      const sync = spawn('pnpm', ['exec', 'tsx', 'scripts/sync-safari-resources.mts'], {
        cwd: ROOT,
        stdio: 'inherit',
      });
      sync.on('exit', (syncCode) => {
        if (syncCode !== 0 && syncCode !== null) {
          process.stderr.write(`[movar:safari-watch] sync exited with code ${syncCode}\n`);
        }
        // Regenerate the host-app shared-logic bundle (movar-app.js) too, so an
        // open Xcode session has a complete `Shared (App)/Resources/` — the file
        // is gitignored and absent on fresh checkouts. Cheap; depends only on the
        // workspace packages, so it's a no-op churn most rebuilds.
        const appBundle = spawn('pnpm', ['exec', 'tsx', 'scripts/build-app-bundle.mts'], {
          cwd: ROOT,
          stdio: 'inherit',
        });
        appBundle.on('exit', (bundleCode) => {
          if (bundleCode !== 0 && bundleCode !== null) {
            process.stderr.write(
              `[movar:safari-watch] app-bundle exited with code ${bundleCode}\n`,
            );
          }
          if (pendingRebuild) runBuild();
        });
      });
      return;
    }
    if (pendingRebuild) runBuild();
  });
}

function scheduleBuild(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  // Debounce so a save burst (editor writes + format-on-save + import sort)
  // doesn't fire three sequential rebuilds.
  debounceTimer = setTimeout(runBuild, 150);
}

watch(SRC_DIR, { recursive: true }, scheduleBuild);
watch(CONFIG_FILE, scheduleBuild);
runBuild();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    current?.kill(signal);
    process.exit(0);
  });
}
