/*
 * Where article scenes live on disk.
 *
 * Shared by `gen-article-charts.mts` and `check-article-charts.mts`, which
 * otherwise resolved the same two directories from `import.meta.url` in
 * identical prologues — and a check pointed at a different directory than the
 * generator would pass while proving nothing.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const marketingRoot = path.resolve(here, '..');

/** Committed SVG scenes, beside the posts that embed them. */
export const assetsDir = path.resolve(marketingRoot, 'src', 'content', 'blog', 'assets');
/** The posts themselves. */
export const postsDir = path.resolve(marketingRoot, 'src', 'content', 'blog');

/** On-disk path of one scene's committed SVG. */
export function sceneSvgPath(name: string): string {
  return path.resolve(assetsDir, `${name}.svg`);
}
