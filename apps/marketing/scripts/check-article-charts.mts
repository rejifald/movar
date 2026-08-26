/*
 * Fail if any committed article chart is stale.
 *
 * The scenes are SVG rendered from `src/lib/article-figures.ts`, so a chart is
 * a pure function of its data — which makes the freshness check trivial and
 * total: render again, compare bytes. One assertion catches a changed figure,
 * an edited scene, and a forgotten regeneration alike.
 *
 * This lives beside `gen:charts` rather than in vitest on purpose. Vitest
 * would have to transform the `.tsx` scenes, and the app's tsconfig sets
 * `jsx: "preserve"` for Astro's sake, which Vite refuses to transform through.
 * Running under the same `tsx --tsconfig tsconfig.scripts.json` as the
 * generator also means the check exercises the exact pipeline that produces
 * the files, not a re-implementation of it.
 *
 * Run: `pnpm --filter @movar/marketing check:charts`
 */

import { readFile } from 'node:fs/promises';

import { SCENES, renderSceneToSvg } from '../src/article-assets/scenes.ts';

import { sceneSvgPath } from './scene-paths.mts';

const stale: string[] = [];

for (const name of Object.keys(SCENES)) {
  const fresh = renderSceneToSvg(name);

  // Determinism first: if a render varied between calls, "stale" would prove
  // nothing about the committed file.
  if (renderSceneToSvg(name) !== fresh) {
    throw new Error(`${name}: renders differ between two calls — the scene is not deterministic.`);
  }

  const committed = await readFile(sceneSvgPath(name), 'utf8').catch(() => '');
  if (committed !== fresh) stale.push(name);
}

if (stale.length > 0) {
  throw new Error(
    `${stale.length} chart(s) out of date: ${stale.join(', ')}. ` +
      'Re-run: pnpm --filter @movar/marketing gen:charts',
  );
}

console.log(`✓ all ${Object.keys(SCENES).length} article charts match a fresh render.`);
