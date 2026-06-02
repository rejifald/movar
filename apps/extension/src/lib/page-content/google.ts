/**
 * Google SERP PageExtractor — produces { kind: 'result', hideMode: 'hide' }
 * nodes for Google search result pages.
 *
 * Text is serialized with serializeElementText (whole-card textContent) because
 * SERP cards have no single reliable inner selector — matching the original
 * filterContentByLanguage approach.
 *
 * This module registers itself on import. Importers only need:
 *   import './page-content/google';
 */
import type { ContentNode, PageContentModel, PageExtractor } from './types';
import { serializeElementText } from './serialize';
import { registerExtractor } from './registry';

// ─── Selector constants ───────────────────────────────────────────────────

/**
 * Selectors for Google SERP result cards. `div.g` covers organic desktop and
 * mobile results; `div[data-snhf]` appears on news/featured-snippet variants.
 * Source: was GOOGLE_SERP_SELECTORS in content-filter.ts.
 */
const GOOGLE_SERP_SELECTORS: readonly string[] = ['div.g', 'div[data-snhf]'];

// ─── Domain list ──────────────────────────────────────────────────────────

/**
 * Google domains whose SERPs this extractor handles.
 * Inlined from GOOGLE_DOMAINS in packages/rules/src/index.ts (not exported).
 * Keep in sync with that list when adding ccTLDs.
 */
const GOOGLE_DOMAINS: readonly string[] = [
  'google.com',
  'google.com.ua',
  'google.de',
  'google.fr',
  'google.co.uk',
  'google.pl',
  'google.com.au',
];

// ─── Extractor implementation ─────────────────────────────────────────────

function extractGoogle(root: ParentNode): PageContentModel {
  const nodes: ContentNode[] = [];
  const sel = GOOGLE_SERP_SELECTORS.join(', ');

  for (const el of root.querySelectorAll<HTMLElement>(sel)) {
    // Use whole-card text — SERP blocks have no reliable inner title selector.
    const text = serializeElementText(el);
    nodes.push({
      el,
      kind: 'result',
      hideMode: 'hide',
      text,
    });
  }

  return { extractor: 'google', nodes };
}

export const GOOGLE_EXTRACTOR: PageExtractor = {
  id: 'google',
  matches(host: string): boolean {
    return GOOGLE_DOMAINS.includes(host) || GOOGLE_DOMAINS.some((d) => host.endsWith(`.${d}`));
  },
  extract: extractGoogle,
};

// Self-register on import so `import './page-content/google'` is all a
// caller needs to activate this extractor.
registerExtractor(GOOGLE_EXTRACTOR);
