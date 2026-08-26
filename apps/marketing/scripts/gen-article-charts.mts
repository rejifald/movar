/*
 * Render every article chart to an SVG file.
 *
 * Replaces the old Storybook-plus-headless-Chromium capture. That pipeline
 * built a Storybook, served it, opened a browser and screenshotted each scene,
 * which made the committed image a function of the machine that ran it — its
 * Chromium build, its font rasterisation, its OS. Two contributors could
 * regenerate the same unchanged data and get different bytes.
 *
 * This does not render anything. `renderToStaticMarkup` turns each component
 * into a string, and that string is a pure function of the figures in
 * `src/lib/article-figures.ts`. Same input, same bytes, anywhere — which is
 * why `article-figures.test.ts` can simply re-render and compare against the
 * committed files instead of hashing a digest and hoping.
 *
 * The output is inlined into the page by `plugins/remark-inline-chart.mjs`,
 * not referenced with `<img src>` — see `src/article-assets/chartKit.tsx` for
 * why that distinction is load-bearing.
 *
 * Run: `pnpm --filter @movar/marketing gen:charts`
 */

import { mkdir, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SCENES, renderSceneToSvg } from '../src/article-assets/scenes.ts';

import { assetsDir, postsDir, sceneSvgPath } from './scene-paths.mts';

async function main(): Promise<void> {
  await mkdir(assetsDir, { recursive: true });

  const changed: string[] = [];
  for (const name of Object.keys(SCENES)) {
    const svg = renderSceneToSvg(name);
    const outPath = sceneSvgPath(name);
    const previous = await readFile(outPath, 'utf8').catch(() => '');
    await writeFile(outPath, svg, 'utf8');
    if (previous !== svg) changed.push(name);
    const kb = (Buffer.byteLength(svg, 'utf8') / 1024).toFixed(1);
    console.log(`  🖉 ${name}.svg (${kb} kB)${previous === svg ? '' : ' — changed'}`);
  }

  await touchPostsReferencing(changed);
  console.log(
    `✓ ${Object.keys(SCENES).length} scenes written to ${path.relative(process.cwd(), assetsDir)}`,
  );
}

/**
 * Bump the mtime of any post embedding a scene that just changed.
 *
 * The dev server caches the Markdown → HTML transform, and the SVG is pulled in
 * during that transform by `plugins/remark-inline-chart.mjs`. Astro has no idea
 * the post depends on the file, so regenerating a chart would leave the running
 * page showing the previous one — silently, and for as long as the post itself
 * stayed untouched. Touching the post is what tells the watcher to re-transform.
 *
 * Harmless in a cold build, where nothing is cached to begin with.
 */
async function touchPostsReferencing(changed: readonly string[]): Promise<void> {
  if (changed.length === 0) return;

  const entries = await readdir(postsDir, { withFileTypes: true });
  const now = new Date();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const postPath = path.resolve(postsDir, entry.name);
    const body = await readFile(postPath, 'utf8');
    if (!changed.some((name) => body.includes(`${name}.svg`))) continue;
    await utimes(postPath, now, now);
    console.log(`  ↻ touched ${entry.name} so the dev server re-reads its charts`);
  }
}

await main();
