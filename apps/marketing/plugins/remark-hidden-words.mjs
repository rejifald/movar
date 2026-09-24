import { isHiddenWordsListId, renderHiddenWordsBlock } from '../src/lib/hidden-words.ts';

/**
 * Replace a ` ```hidden-words <id>` ` fenced code block with the rendered
 * "words to hide" widget it names — the single-source markup from
 * `src/lib/hidden-words.ts`. A guide page's body is one Markdown file with no
 * seam for a component, so the fence is the seam: same pattern as
 * `./remark-inline-chart.mjs`, which does the equivalent swap for chart SVGs.
 *
 * Imports the TS module directly, extension and all. That works regardless
 * of which Node this runs under, because of how Astro loads its own config:
 * `loadConfigWithVite` first tries a native Node `import()` of
 * `astro.config.mjs`, and falls back to Vite's TS-transpiling `ssrLoadModule`
 * whenever that throws. Node below 22.18/23.6 rejects the `.ts` import
 * outright; newer Node strips types from a single file but still does not
 * resolve the extensionless sibling imports inside `hidden-words.ts` and
 * `guide.ts` (`./guide`, not `./guide.ts`) the way a bundler does — so the
 * native import fails either way, for a different reason depending on the
 * Node version, and Astro's fallback picks it up regardless.
 * `hidden-words.ts` itself imports nothing Astro-specific (no
 * `astro:content`, no browser globals) precisely so it survives being loaded
 * this early, before the content-collection machinery exists.
 *
 * Unlike the chart plugin, there is no silent fallback for a bad id. A
 * missing chart image degrades to a plain `<img>` that at least shows it
 * failed to load; a `hidden-words` fence with a missing or misspelled id has
 * nothing to degrade to — the fence marks a spot that must carry a real list,
 * so a bad id throws with the file path and the id it found, rather than
 * shipping a guide page with a silently empty step.
 */
export function remarkHiddenWords() {
  return transformer;
}

/** Hoisted rather than returned as a closure, for the same reason
 *  `remark-inline-chart.mjs`'s transformer is: it takes no plugin options. */
function transformer(tree, file) {
  const docPath = file.history?.[0] ?? file.path ?? '(unknown file)';
  replaceHiddenWordsBlocks(tree, docPath);
}

/** The lone test for "is this node a fence this plugin owns", split out so
 *  the walker below reads as one branch rather than a compound condition —
 *  same move as `isChartImage` in `remark-inline-chart.mjs`. */
function isHiddenWordsFence(node) {
  return node.type === 'code' && node.lang === 'hidden-words';
}

/**
 * Walk the tree and swap every `hidden-words` fenced code block in place.
 * Manual recursion over `children`, matching `remark-inline-chart.mjs`,
 * rather than pulling in `unist-util-visit` for a walk this shallow.
 */
function replaceHiddenWordsBlocks(node, docPath) {
  const children = node.children;
  if (!Array.isArray(children)) return;

  for (const [index, child] of children.entries()) {
    if (isHiddenWordsFence(child)) {
      children[index] = { type: 'html', value: renderForFence(child, docPath) };
    } else {
      replaceHiddenWordsBlocks(child, docPath);
    }
  }
}

function renderForFence(node, docPath) {
  const id = typeof node.meta === 'string' ? node.meta.trim() : '';

  if (!isHiddenWordsListId(id)) {
    throw new Error(
      `${docPath}: unknown \`hidden-words\` list id ${JSON.stringify(id)} — expected one of ` +
        'the ids in HIDDEN_WORDS_LISTS (src/lib/hidden-words.ts), e.g. ```hidden-words threads',
    );
  }

  return renderHiddenWordsBlock(id);
}
