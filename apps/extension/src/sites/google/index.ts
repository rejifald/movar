import { isGoogleHost } from '@movar/host-match';
import type { SiteModel, SiteRule } from '../types';

// Google SERP: a Cyrillic query like `яблуко` (or even `картина`, which
// is identical in UA & RU) routinely surfaces Russian-language results
// because Google has no language hint and falls back to the larger
// Russian corpus. Accept-Language alone doesn't constrain results —
// `lr=lang_<code>` does. `hl` aligns the interface so the picker,
// sidebar, related searches etc. also match. Path-gated to /search
// because /maps and /images interpret `lr` differently (Maps can
// outright break). Enforce-mode because the interface can be Ukrainian
// while results are Russian — page-language alone wouldn't trigger.
//
// Known trade-off: `lr=lang_<code>` can over-filter for queries where
// Google's per-page language classifier hasn't tagged the bilingual
// Ukrainian sites' UA pages — e.g. "Реле напруги", "рецепт борщу" can
// return zero organic results. The cost of strict filtering is
// accepted here because the most common Cyrillic queries on
// google.com.ua benefit from the filter, and the alternative
// (interface-only via `hl`) provides no measurable result-language
// lift. A smarter implementation that detects the empty-SERP state
// and retries without `lr` is tracked separately.
// One rule covers every google.* ccTLD via the shared predicate — the SERP
// rewrite is identical across ccTLDs — so `match` is only a label here.
export const googleRule: SiteRule = {
  match: 'google',
  matchHost: isGoogleHost,
  enforce: true,
  strategy: {
    type: 'searchParams',
    onlyOnPath: '/search',
    onlyWhenParam: 'q',
    // `lr` pipe-joins every preferred language (`lang_uk|lang_en`) so a
    // user with `[uk, en]` priority sees results in either language —
    // English speakers with Ukrainian #1 otherwise lose every English
    // result. `hl` stays single-valued (interface = one language). The
    // `lang_` prefix is uniform, so it rides `prefix` rather than a values map.
    params: [{ name: 'hl' }, { name: 'lr', prefix: 'lang_', joinPreferences: true }],
    // `sei` is Google's opaque session-event token. It carries prior-session
    // locale bias forward and can pull subsequent results back toward the
    // earlier language even with `hl=uk&lr=lang_uk` set. Drop it on every
    // rewrite so each query is judged on its own signals.
    stripParams: ['sei'],
  },
};

export const googleModel: SiteModel = { chunk: 'models/google.js', matches: isGoogleHost };
