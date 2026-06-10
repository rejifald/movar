import { isYouTubeHost } from '@movar/host-match';
import type { LangValues, SiteModel, SiteRule } from '../types';

/** ISO 3166-1 country code per language for YouTube's `gl` param. A best-guess
 *  pairing — YouTube uses it as a recommendation/region hint, not a strict
 *  filter, so a reasonable default is enough. */
const YT_GL: LangValues = {
  uk: 'UA',
  en: 'US',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
};

// YouTube has no equivalent of Google's `lr=lang_<code>` — there's no URL
// knob that strictly filters out Russian-language videos. `hl` + `gl` are
// the honest knobs: interface language + region hint. They nudge the
// recommendation algorithm and the search ranking but don't strictly
// bound results, so Russian videos can still leak through (the DOM-level
// result-filter in lib/result-filter.ts is the actual filter).
// Path-gated to /results so /watch, /shorts, etc. aren't rewritten —
// YouTube's polymer router strips unknown params on those surfaces and
// would otherwise drive a redirect loop.
export const youtubeRule: SiteRule = {
  match: 'youtube.com',
  enforce: true,
  strategy: {
    type: 'searchParams',
    onlyOnPath: '/results',
    onlyWhenParam: 'search_query',
    params: [{ name: 'hl' }, { name: 'gl', values: YT_GL }],
  },
};

export const youtubeModel: SiteModel = { chunk: 'models/youtube.js', matches: isYouTubeHost };
