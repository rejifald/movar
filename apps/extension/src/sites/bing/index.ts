import type { SiteRule } from '../types';

// Bing exposes `setlang` for the interface; `mkt` would also bound results
// but combines language with a country code we don't have. setlang is the
// honest, safe knob — interface aligned, results biased without forcing.
// Path-gated to /search so non-SERP surfaces (maps, images) are left alone.
export const bingRule: SiteRule = {
  match: 'bing.com',
  enforce: true,
  strategy: {
    type: 'searchParams',
    onlyOnPath: '/search',
    onlyWhenParam: 'q',
    params: [{ name: 'setlang' }],
  },
};
