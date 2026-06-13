import type { SiteRule } from '../types';

// Ukrainian e-commerce. RU is the default at the root path; UA lives under
// /ua/. The site publishes <link rel="alternate" hreflang="..."> on every
// page, so we follow that for the navigation — no per-URL guesswork. The
// cookie is set first as a hint to any server-side preference logic.
//
// This is the worked example in ../CONTRIBUTING-A-SITE.md — start there to add
// a new site rule.
export const electricaRule: SiteRule = {
  match: 'electrica-shop.com.ua',
  strategy: {
    type: 'compound',
    steps: [{ type: 'cookie', name: 'lang', values: { uk: 'ua' } }, { type: 'hreflang' }],
  },
};
