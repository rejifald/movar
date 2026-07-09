import { browser } from 'wxt/browser';
import type { MovarSettings } from '@movar/settings';
import { GOOGLE_REQUEST_DOMAINS } from '@movar/host-match';
import type { LanguageCode } from '@movar/lang-detect';
import { buildAcceptLanguage } from './accept-language';
import { encodedValue } from '../sites/types';
import { GS_FAMILY_PARAMS, googleSearchStrategy } from '../sites/google';

/** A non-empty priority list, the same shape `applyStrategy` narrows to. */
type NonEmptyTargets = readonly [LanguageCode, ...LanguageCode[]];

/** The exact value a `searchParams` param writes for `targets`. MIRRORS the
 *  inline computation in `applySearchParams` (lib/strategy.ts) rather than
 *  importing a shared helper: this module is background-only while
 *  strategy.ts rides in every page's size-budgeted content bundle, and an
 *  extraction shared between them would bill its bytes to every page load
 *  for a background-only consumer. The two copies are pinned together by
 *  the dnr.test.ts parity test ("computes the same URL the content-script
 *  searchParams fallback navigates to"), which fails if either side drifts.
 *  `joinPreferences: true` pipe-joins every preference (Google's `lr`
 *  accepts `lang_uk|lang_en`); otherwise the top preference alone. */
function searchParamValue(
  param: (typeof googleSearchStrategy)['params'][number],
  targets: NonEmptyTargets,
): string {
  const [top] = targets;
  return param.joinPreferences === true
    ? targets.map((t) => (param.prefix ?? '') + encodedValue(param.values, t)).join('|')
    : (param.prefix ?? '') + encodedValue(param.values, top);
}

/** Stable id for our single dynamic Accept-Language rule. */
const ACCEPT_LANGUAGE_RULE_ID = 1;

/** Stable id for the Google /search pre-request language-rewrite rule. */
const GOOGLE_SEARCH_RULE_ID = 2;

/** The exact Rule shape the installed `browser` types expect. */
type DnrRule = NonNullable<
  Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]['addRules']
>[number];

/**
 * Install (or remove) a declarativeNetRequest rule that rewrites the
 * Accept-Language header on top-level and sub-frame navigations, so servers
 * serve the user's preferred language. Driven entirely by settings + active
 * state. See movar-spec.md §5.1.
 */
export async function syncAcceptLanguageRule(
  settings: MovarSettings,
  active: boolean,
  /** Hosts currently snoozed (a timed per-site break). Excluded from the rule
   *  for the snooze window, on top of the permanent `settings.allowlist`. */
  snoozedHosts: readonly string[] = [],
): Promise<void> {
  const removeRuleIds = [ACCEPT_LANGUAGE_RULE_ID];

  // No-op states: extension off, paused, or nothing to prefer.
  if (!active || !settings.enabled || settings.priority.length === 0) {
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }

  // Allowlist (permanent) + snoozed hosts (timed) both exempt a domain; dedupe
  // so a host on both isn't listed twice.
  const excluded = [...new Set([...settings.allowlist, ...snoozedHosts])];

  const rule: DnrRule = {
    id: ACCEPT_LANGUAGE_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'Accept-Language',
          operation: 'set',
          value: buildAcceptLanguage(settings.priority),
        },
      ],
    },
    condition: {
      resourceTypes: ['main_frame', 'sub_frame'],
      ...(excluded.length > 0 ? { excludedRequestDomains: excluded } : {}),
    },
  };

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [rule] });
}

/** Escape a literal for embedding in an RE2-compatible `regexFilter`. RE2's
 *  metacharacters are a subset of JS RegExp's, so JS-style escaping is safe. */
function escapeRegexLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Build the Google /search redirect rule for `priority`.
 *
 * This is the prevention layer for the empty-SERP session pin
 * (docs/google-search-url-params.md): the content-script `searchParams`
 * rewrite acts only AFTER the raw entry request — carrying Chrome's opaque
 * `gs_lcrp` omnibox token and no `lr` — has already been served, which both
 * wastes a page load on every entry search and lets the poisoned request seed
 * a server-side pinned candidate set that can zero out results under the `lr`
 * filter. A DNR redirect rewrites the URL BEFORE the request leaves the
 * browser, so the poisoned request never reaches Google: no pin seeding, no
 * double load, one render per search.
 *
 * Everything is derived from `googleSearchStrategy` — the same object the
 * content-script fallback applies — so the two layers cannot drift:
 *   - condition: `onlyOnPath` ('/search' path prefix) + `onlyWhenParam`
 *     (`q` present), host-gated to every google.* ccTLD via
 *     {@link GOOGLE_REQUEST_DOMAINS}. `/maps` and other non-/search paths
 *     never match; a q-less homepage never matches.
 *   - action: `queryTransform` with `addOrReplaceParams` for the language
 *     params (`hl`, pipe-joined `lr` via {@link searchParamValue}) and
 *     `removeParams` for the strip + scrub tiers. The two tiers collapse
 *     here deliberately: at the network layer a redirect costs no page load,
 *     so the strip-vs-scrub trigger-cost distinction that shapes the
 *     content-script rule has nothing to price. `scrubPrefixes` cannot be
 *     expressed (removeParams is exact-name only) — the enumerated
 *     {@link GS_FAMILY_PARAMS} stand in, and the content-script fallback
 *     still prefix-scrubs anything new.
 *
 * Idempotence / loop safety: the transform is a fixed point after one
 * application — addOrReplaceParams writes the same values and removeParams
 * finds nothing left — so re-evaluating the rule against its own output
 * computes an identical URL, and DNR skips redirects whose target equals the
 * request URL. An already-rewritten SERP-internal navigation (pagination,
 * refinement with `hl`/`lr` intact and no removable token) is likewise a
 * same-URL no-op: the rule matches, the redirect is skipped, nothing loads
 * twice.
 */
export function buildGoogleSearchRedirectRule(
  priority: NonEmptyTargets,
  excludedDomains: readonly string[] = [],
): DnrRule {
  const { onlyOnPath, onlyWhenParam, stripParams, scrubParams } = googleSearchStrategy;
  const removeParams = [...new Set([...stripParams, ...scrubParams, ...GS_FAMILY_PARAMS])];
  return {
    id: GOOGLE_SEARCH_RULE_ID,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: googleSearchStrategy.params.map((p) => ({
              key: p.name,
              value: searchParamValue(p, priority),
            })),
            removeParams,
          },
        },
      },
    },
    condition: {
      // Path prefix + "`q` param present", mirroring the content-script
      // gates. RE2-compatible (no lookaround): `q` must directly follow the
      // `?` or a `&`, so `oq=`/`aqs=` can't satisfy the gate.
      regexFilter: String.raw`^https?://[^/?]+${escapeRegexLiteral(onlyOnPath)}[^?#]*\?(?:[^#]*&)?${escapeRegexLiteral(onlyWhenParam)}=`,
      requestDomains: [...GOOGLE_REQUEST_DOMAINS],
      // main_frame only: the content-script rewrite acts on top-level
      // documents, and a framed google.* /search embed is not a surface the
      // user searched from.
      resourceTypes: ['main_frame'],
      ...(excludedDomains.length > 0 ? { excludedRequestDomains: [...excludedDomains] } : {}),
    },
  };
}

/**
 * Install (or remove) the Google /search pre-request redirect rule. Gated and
 * regenerated exactly like {@link syncAcceptLanguageRule} — same settings,
 * pause, allowlist, and snooze inputs — so both dynamic rules always tell the
 * same story about whether Movar is active for a host.
 *
 * The content-script `searchParams` rewrite stays installed regardless: it is
 * the functional fallback wherever this rule can't act — platforms whose DNR
 * lacks `redirect`/`queryTransform` support (the install below tolerates a
 * rejection), and requests DNR never sees. Redundancy is harmless by
 * construction: on a DNR-rewritten URL the fallback computes a no-op.
 */
export async function syncGoogleSearchRedirectRule(
  settings: MovarSettings,
  active: boolean,
  /** Hosts currently snoozed (a timed per-site break). Excluded from the rule
   *  for the snooze window, on top of the permanent `settings.allowlist`. */
  snoozedHosts: readonly string[] = [],
): Promise<void> {
  const removeRuleIds = [GOOGLE_SEARCH_RULE_ID];

  // Safari is compile-time excluded: its DNR nominally accepts `transform`
  // from 17 but queryTransform handling has verified open bugs, and a rule
  // that rewrites URLs *wrong* is worse than the content-script fallback
  // (which stays active there). Chrome/Firefox both implement the transform
  // and the same-URL no-op this rule's loop safety rests on (Firefox
  // documents it verbatim: a redirect action "does not redirect the request
  // when … the action does not change the request").
  // Destructuring gives the type-level non-empty proof `settings.priority`
  // (a plain array) can't carry: `top == null` IS the empty-priority check.
  const [top, ...restPriority] = settings.priority;
  const noOpStates =
    import.meta.env['BROWSER'] === 'safari' || !active || !settings.enabled || top == null;
  if (noOpStates) {
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }

  const excluded = [...new Set([...settings.allowlist, ...snoozedHosts])];
  const rule = buildGoogleSearchRedirectRule([top, ...restPriority], excluded);

  try {
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [rule] });
  } catch {
    // DNR redirect/queryTransform support varies by browser (Safari lags
    // Chrome/Firefox). A platform that rejects the rule shape keeps the
    // content-script searchParams rewrite as the only layer — same params,
    // one visible reload later. Sweep any stale copy so a rejecting platform
    // never serves a rule from an older build.
    try {
      await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    } catch {
      // Removal is best-effort on a platform that rejects even that.
    }
  }
}

/**
 * Suspend the Google /search redirect rule (remove rule 2 only; the
 * Accept-Language rule is untouched). The empty-results retry calls this — via
 * a background message — right before it navigates to the same query with `lr`
 * dropped to escape a server-side session pin. Without it, this redirect rule
 * would re-add `lr` pre-request and bounce the retry back to the pinned URL:
 * the rule can't see the content-script loop-guard that already stops the
 * *content* rewrite from re-adding it. The background schedules a timed alarm
 * to re-install the rule shortly after (via {@link syncGoogleSearchRedirectRule}),
 * so a dropped rule always comes back even if the retrying tab never reports in.
 */
export async function suspendGoogleSearchRedirectRule(): Promise<void> {
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GOOGLE_SEARCH_RULE_ID],
  });
}
