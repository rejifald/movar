/*
 * The tiny HTML-string toolkit the mockups are built from.
 *
 * The mockups render to strings rather than to React or Astro components
 * because they have to appear, pixel-identically, in two surfaces that can't
 * share a component: the extension's React onboarding page and the Astro
 * marketing site (which has no React integration). A string is the one
 * representation both can mount — `dangerouslySetInnerHTML` on one side,
 * `set:html` on the other.
 *
 * Everything here is static, decorative markup built from our own catalogue —
 * no user input reaches it — but labels still go through `esc` so a future
 * label carrying an apostrophe or angle bracket can't break the markup.
 */

import type { IconNode } from 'lucide';

/** HTML-escape a text node / attribute value. */
export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Serialise a lucide `IconNode` to an inline `<svg>` string.
 *
 * lucide ships each icon as a flat list of child elements (`[tag, attrs][]`)
 * with no root `<svg>` — the framework bindings add it. This is that root, with
 * lucide's own default attributes, so a glyph rendered here is identical to the
 * same glyph rendered by `lucide-react` in the extension or `lucide-astro` on
 * the marketing site.
 *
 * `stroke-width` is a parameter because the browser chrome these mockups
 * imitate draws its glyphs lighter than lucide's default 2 — Chrome's toolbar
 * icons in particular read as hairlines at 16px.
 */
export function icon(node: IconNode, className: string, strokeWidth = 2): string {
  const children = node
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([key, value]) => `${key}="${esc(String(value))}"`)
          .join(' ')} />`,
    )
    .join('');

  return [
    `<svg class="${esc(className)}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"`,
    ` fill="none" stroke="currentColor" stroke-width="${strokeWidth}"`,
    ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`,
  ].join('');
}

/** Join markup fragments, dropping the falsy ones, so builders can inline
 *  conditional rows without a stray `false` reaching the output. */
export function join(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string').join('');
}
