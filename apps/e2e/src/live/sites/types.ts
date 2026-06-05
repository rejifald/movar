/**
 * `SiteFixture` is the single contract every test target conforms to. The
 * parameterised spec at `src/live/sites.spec.ts` iterates the registry; adding
 * a 4th, 5th, … site is one file under `sites/`, then a re-export from
 * `sites/index.ts`.
 *
 * Three categories of expectation:
 *
 *   - `initial`: what the page looks like to a Russian-speaking visitor
 *     before Movar acts. Asserted in the `cleanContext` (no extension).
 *   - `afterMovar`: what changes once Movar's content script applies.
 *     Asserted in `movarContext` after `waitForMovarSettled` returns.
 *   - `correction`: the {fromLang, toLang, mechanism} tuple Movar should
 *     log to its correction-event store. Asserted by reading
 *     `chrome.storage.local['movar:events']` via the service worker.
 *
 * The `kind` distinguishes redirect-driven flows (electrica, uamade, …)
 * from search-engine enforce-mode (google, youtube, bing, ddg, where the
 * URL doesn't change "languages" but params get rewritten). The spec uses
 * `kind` to pick the right assertion path; both share the same shape so
 * the registry stays homogeneous.
 */
import type { CyrillicLanguage, LanguageCode } from '@movar/lang-detect';
import type { CorrectionEvent } from '@movar/events';

export interface InitialExpectations {
  /** Permitted `<html lang>` prefixes. We allow either the BCP47 form
   *  (`ru-RU`) or the bare code (`ru`). Empty string is allowed too,
   *  for sites that ship no `lang` attribute (then we trust body-text
   *  detection). Must be non-empty (at least one entry required). */
  htmlLangPrefix: readonly [LanguageCode | '', ...(LanguageCode | '')[]];
  /** What `@movar/lang-detect` should report for the body text. Single
   *  value or list of acceptable readings. Use 'unknown' explicitly when
   *  the body text is too short to disambiguate but we're OK with that. */
  bodyDetected: CyrillicLanguage | CyrillicLanguage[];
  /** Minimum `ruScore` (count of `ы`/`ё`) we expect. Loose floor; a
   *  search-engine SERP with mostly chrome won't pass `>0` reliably, so
   *  set to 0 for those. */
  minRuScore?: number;
}

export interface AfterMovarExpectations {
  /** URL must match after Movar redirects. For enforce-mode (search
   *  engines) this is usually the same path with extra query params. */
  url?: RegExp;
  /** Acceptable `<html lang>` after the redirect lands. Must be non-empty
   *  when provided — an empty array would silently pass every lang check.
   *  Empty string is allowed per element (sites with no `lang` attribute). */
  htmlLangPrefix?: readonly [LanguageCode | '', ...(LanguageCode | '')[]];
  /** Body-text detection after the redirect. */
  bodyDetected?: CyrillicLanguage | CyrillicLanguage[];
  /** At least N elements marked `data-movar-hidden`. 0 = picker-filter
   *  is not the subject of this fixture (search-engine redirect tests). */
  minHiddenLinks?: number;
  /** At least N elements marked with a content-filter blur curtain. */
  minContentBlur?: number;
  /** Specific selectors that must be hidden after Movar runs (sanity:
   *  the picker option for a blocked language is gone from the DOM). */
  hiddenSelectors?: string[];
  /** Specific selectors that must STILL be visible (sanity: Movar
   *  didn't over-hide). */
  visibleSelectors?: string[];
}

export interface CorrectionExpectations {
  /** At least one event with `fromLang === from && toLang === to`.
   *  Allow empty string for search-engine SERP fixtures where body
   *  detection is ambiguous and Movar may record `pageLang ?? target`
   *  as `''` (see content.ts ~line 302). */
  fromLang: LanguageCode | '';
  toLang: LanguageCode;
  /** Permitted mechanism strings. `'redirect'` for hreflang/picker
   *  fallbacks; rule-specific values for cookie/localStorage/search. */
  mechanism: readonly CorrectionEvent['mechanism'][];
}

export type SiteKind = 'site' | 'search';

export interface SiteFixture {
  /** Stable id used as the test name. */
  id: string;
  /** Human label; shown in console + report. */
  label: string;
  /** 'site' = generic site rule / heuristic. 'search' = enforce-mode
   *  rule (Google, YouTube, etc.). */
  kind: SiteKind;
  /** The URL to visit to start in a Russian-defaulted state. For
   *  `'search'`, the SERP URL whose results would otherwise bleed RU. */
  startUrl: string;
  /** Host as it will appear in `CorrectionEvent.domain` (no www., the
   *  way `location.hostname` reports it for the start URL). */
  hostname: string;
  /** HTTP headers applied to both `movarContext` and `cleanContext`
   *  before the first navigation. We almost always want
   *  `Accept-Language: ru` so the site serves its Russian default. */
  extraHeaders?: Record<string, string>;
  /** Cookies pre-set in both contexts before the first navigation —
   *  used to coax sites whose RU starting state needs a session hint. */
  preCookies?: {
    name: string;
    value: string;
    domain: string;
    path?: string;
  }[];
  initial: InitialExpectations;
  afterMovar: AfterMovarExpectations;
  correction: CorrectionExpectations;
  /** Skip this site entirely if the env var is set. Useful for sites
   *  that frequently fail anti-bot (YouTube/Google CAPTCHAs). */
  skipIfEnv?: string;
}
