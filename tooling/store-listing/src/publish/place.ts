/**
 * Copies a framed run into the repo's store folders, so one dispatch of the
 * store-listing workflow can land fresh screenshots as a PR (`propose` job).
 *
 *   tsx src/publish/place.ts --framed <dir> --repo <repo root>
 *
 * `<framed>` holds the frame CLI's outputs as `<set>/<locale>/` (sets below).
 * A set or locale folder that is missing is skipped with a note; a folder that
 * exists but lacks a shot fails, so a half-framed set never lands.
 */
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { LISTING } from '../render/listing.config.js';

export interface PlacedSet {
  /** Folder under the framed root. */
  readonly framed: string;
  /** Store folder for `<id>.png`, relative to the repo root; `{locale}` is substituted. */
  readonly store: string;
  /** Marketing drum WebPs (`screens/<id>.webp`), when the set has them. */
  readonly site?: string;
}

const STORE = 'apps/extension/store-assets/screenshots';
const SITE = 'apps/marketing/public/listing';

const PLACED_SETS: readonly PlacedSet[] = [
  {
    framed: 'iphone',
    store: `${STORE}/app-store/iphone-6.9/{locale}`,
    site: `${SITE}/iphone/{locale}`,
  },
  { framed: 'ipad', store: `${STORE}/app-store/ipad-13/{locale}`, site: `${SITE}/ipad/{locale}` },
  { framed: 'firefox', store: `${STORE}/firefox/{locale}` },
  { framed: 'chrome', store: `${STORE}/chrome/{locale}` },
  { framed: 'safari', store: `${STORE}/app-store/mac/{locale}` },
];

const LOCALES = ['uk', 'en'] as const;

/** `01-search.png`, … in listing order: the stores show files in name order. */
export function storeName(id: string): string {
  const index = LISTING.findIndex((shot) => shot.id === id);
  if (index === -1) throw new Error(`unknown shot id ${id}`);
  return `${String(index + 1).padStart(2, '0')}-${id}.png`;
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

/** Removes the previous run's listing shots (`NN-<id>.png`), keeping any other file (the Mac host-app shots). */
async function clearShots(dir: string): Promise<void> {
  if (!(await exists(dir))) return;
  const names = new Set(LISTING.map((shot) => storeName(shot.id)));
  for (const name of await readdir(dir)) {
    if (names.has(name)) await rm(path.join(dir, name));
  }
}

/** Copies one framed `<set>/<locale>` folder into its store (and site) folder. */
async function placeOne(from: string, set: PlacedSet, locale: string, repoRoot: string) {
  const storeDir = path.join(repoRoot, set.store.replace('{locale}', locale));
  await clearShots(storeDir);
  await mkdir(storeDir, { recursive: true });
  for (const shot of LISTING) {
    await copyFile(path.join(from, `${shot.id}.png`), path.join(storeDir, storeName(shot.id)));
  }
  if (set.site === undefined) return;
  const siteDir = path.join(repoRoot, set.site.replace('{locale}', locale));
  await mkdir(siteDir, { recursive: true });
  for (const shot of LISTING) {
    await copyFile(
      path.join(from, 'screens', `${shot.id}.webp`),
      path.join(siteDir, `${shot.id}.webp`),
    );
  }
}

export async function place(framedRoot: string, repoRoot: string): Promise<string[]> {
  const notes: string[] = [];
  for (const set of PLACED_SETS) {
    for (const locale of LOCALES) {
      const from = path.join(framedRoot, set.framed, locale);
      if (await exists(from)) {
        await placeOne(from, set, locale, repoRoot);
        notes.push(`placed ${set.framed}/${locale}`);
      } else {
        notes.push(`skip ${set.framed}/${locale}: not framed in this run`);
      }
    }
  }
  return notes;
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const { values } = parseArgs({
    options: { framed: { type: 'string' }, repo: { type: 'string' } },
  });
  if (values.framed === undefined || values.repo === undefined) {
    throw new Error('usage: place.ts --framed <dir> --repo <repo root>');
  }
  for (const note of await place(path.resolve(values.framed), path.resolve(values.repo))) {
    process.stdout.write(`${note}\n`);
  }
}
