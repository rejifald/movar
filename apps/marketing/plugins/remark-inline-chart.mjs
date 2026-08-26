import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Inline article chart SVGs into the page instead of linking them.
 *
 * Markdown turns `![alt](./assets/x.svg)` into an `<img>`, and an SVG loaded
 * through `<img>` is an isolated document: it cannot see the page's fonts or
 * its CSS custom properties. For these scenes that is fatal twice over — they
 * are typeset in Manrope, which the page loads and the image context would
 * not, and their colours are `var(--chart-*)` so they can follow the reader
 * into dark mode. Inlined, the SVG is part of the document and inherits both.
 *
 * Only `.svg` images are touched, and only ones that resolve to a file beside
 * the post. Everything else — the screenshots in the other articles — keeps
 * the ordinary `<img>` path and Astro's image optimisation.
 *
 * The image's alt text moves onto the SVG's `aria-label`, so inlining does not
 * quietly drop the accessible name the Markdown author wrote.
 */
export function remarkInlineChart() {
  return transformer;
}

/** Hoisted rather than returned as a closure: it takes no plugin options, so
 *  there is nothing for an inner scope to capture. */
function transformer(tree, file) {
  const docPath = file.history?.[0] ?? file.path;
  if (typeof docPath !== 'string') return;
  inlineCharts(tree, path.dirname(docPath));
}

/**
 * Replace every paragraph that is nothing but a chart image.
 *
 * Walking paragraphs rather than images is what keeps this simple: a Markdown
 * image on its own line always lands as `paragraph > image`, so matching that
 * shape directly gives both the node to read and the node to replace. Hunting
 * the image first meant finding its paragraph again afterwards, which took a
 * second full-tree search and the branching that came with it.
 */
function inlineCharts(node, docDir) {
  const children = node.children;
  if (!Array.isArray(children)) return;

  for (const [index, child] of children.entries()) {
    const svg = chartSvgFor(child, docDir);
    if (svg === undefined) inlineCharts(child, docDir);
    else children[index] = { type: 'html', value: svg };
  }
}

/**
 * The lone chart image inside a paragraph, if that is what this node is.
 *
 * A Markdown image on its own line always lands as `paragraph > image`, so
 * matching that shape is the whole test — and keeping it separate from the
 * reading below leaves each half with a handful of branches instead of one
 * function carrying all of them.
 */
function chartImageIn(node) {
  const child = soleChildOf(node);
  return child !== undefined && isChartImage(child) ? child : undefined;
}

/** The single child of a paragraph, when it has exactly one. */
function soleChildOf(node) {
  if (node.type !== 'paragraph') return;
  const children = node.children;
  return Array.isArray(children) && children.length === 1 ? children[0] : undefined;
}

function isChartImage(node) {
  return node.type === 'image' && typeof node.url === 'string' && node.url.endsWith('.svg');
}

/**
 * The inlined SVG for such a paragraph, or `undefined` for anything else —
 * including an image whose file is missing, which stays an `<img>` so Astro
 * reports it rather than the figure vanishing silently.
 */
function chartSvgFor(node, docDir) {
  const image = chartImageIn(node);
  if (image === undefined) return;

  const svg = readFileIfPresent(path.resolve(docDir, image.url));
  return svg === undefined ? undefined : withAriaLabel(svg, image.alt);
}

/** Carry the Markdown alt text across, so inlining does not drop it. */
function withAriaLabel(svg, alt) {
  if (typeof alt !== 'string' || alt === '') return svg;
  return svg.replace('<svg ', `<svg aria-label="${escapeAttribute(alt)}" `);
}

function readFileIfPresent(target) {
  try {
    return readFileSync(target, 'utf8');
  } catch {
    return;
  }
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
