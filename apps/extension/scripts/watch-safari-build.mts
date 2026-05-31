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
