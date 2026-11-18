import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISTING } from '../src/render/listing.config.js';
import { place, storeName } from '../src/publish/place.js';

async function framedSet(root: string, set: string, locale: string, webp: boolean): Promise<void> {
  const dir = path.join(root, set, locale);
  await mkdir(path.join(dir, 'screens'), { recursive: true });
  for (const shot of LISTING) {
    await writeFile(path.join(dir, `${shot.id}.png`), shot.id);
    if (webp) await writeFile(path.join(dir, 'screens', `${shot.id}.webp`), shot.id);
  }
}

describe('place', () => {
  it('names shots in listing order', () => {
    expect(LISTING.map((shot) => storeName(shot.id))).toEqual([
      '01-search.png',
      '02-site-no-modal.png',
      '03-site-menu.png',
      '04-youtube.png',
    ]);
  });

  it('places framed sets, keeps the Mac host-app shots and skips sets not framed', async () => {
    const framed = await mkdtemp(path.join(tmpdir(), 'framed-'));
    const repo = await mkdtemp(path.join(tmpdir(), 'repo-'));
    await framedSet(framed, 'safari', 'uk', false);
    await framedSet(framed, 'iphone', 'en', true);
    const mac = path.join(repo, 'apps/extension/store-assets/screenshots/app-store/mac/uk');
    await mkdir(mac, { recursive: true });
    await writeFile(path.join(mac, '05-detector.png'), 'host app');
    await writeFile(path.join(mac, '01-search.png'), 'stale');

    const notes = await place(framed, repo);

    expect(await readdir(mac)).toEqual([
      '01-search.png',
      '02-site-no-modal.png',
      '03-site-menu.png',
      '04-youtube.png',
      '05-detector.png',
    ]);
    const site = path.join(repo, 'apps/marketing/public/listing/iphone/en');
    expect((await readdir(site)).length).toBe(LISTING.length);
    expect(notes).toContain('placed safari/uk');
    expect(notes).toContain('skip chrome/uk: not framed in this run');
  });

  it('fails on a framed folder missing a shot', async () => {
    const framed = await mkdtemp(path.join(tmpdir(), 'framed-'));
    const repo = await mkdtemp(path.join(tmpdir(), 'repo-'));
    await mkdir(path.join(framed, 'firefox', 'uk'), { recursive: true });
    await expect(place(framed, repo)).rejects.toThrow(/ENOENT/);
  });
});
