import type { LangValues, SiteRule } from '../types';

/** DuckDuckGo region code per target language. DDG's `kl` param combines
 *  region + language (e.g. ua-uk = Ukraine, Ukrainian). For users whose top
 *  priority is `en`, default to UK English so we never bias toward US results
 *  for a user whose region we don't know. */
const DDG_REGION: LangValues = {
  uk: 'ua-uk',
  en: 'uk-en',
  de: 'de-de',
  fr: 'fr-fr',
  es: 'es-es',
  it: 'it-it',
  pl: 'pl-pl',
};

// DuckDuckGo's `kl` is the language+region selector. The DDG_REGION map
// picks a sensible region per target language; unknown targets fall through
// to the bare code, which DDG ignores rather than mishandling. No path
// gate — DDG serves SERP at the root (`/?q=…`).
export const rule: SiteRule = {
  match: 'duckduckgo.com',
  enforce: true,
  strategy: {
    type: 'searchParams',
    onlyWhenParam: 'q',
    params: [{ name: 'kl', values: DDG_REGION }],
  },
};
