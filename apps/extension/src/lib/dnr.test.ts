import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { LanguageCode } from '@movar/lang-detect';
import { buildAcceptLanguage } from './accept-language';
import { applyStrategy } from './strategy';
import { googleRule } from '../sites/google';
import {
  buildGoogleSearchRedirectRule,
  syncAcceptLanguageRule,
  syncGoogleSearchRedirectRule,
} from './dnr';

/** Spy on the one API this module drives. We assert on the exact argument
 *  object so both the add (install) and remove-only (uninstall) shapes are
 *  pinned. */
function spyUpdate(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(browser.declarativeNetRequest, 'updateDynamicRules').mockResolvedValue();
}

/** wxt's fakeBrowser has no in-memory declarativeNetRequest store (it throws
 *  "not implemented"), so to assert the *cumulative* effect of a sequence of
 *  calls we replay the recorded add/remove operations into a tiny local map
 *  ourselves — the same bookkeeping Chrome does internally. */
function rulesAfter(update: ReturnType<typeof vi.spyOn>): unknown[] {
  const store = new Map<number, unknown>();
  for (const call of update.mock.calls) {
    const arg = call[0] as {
      removeRuleIds?: number[];
      addRules?: { id: number }[];
    };
    for (const id of arg.removeRuleIds ?? []) store.delete(id);
    for (const rule of arg.addRules ?? []) store.set(rule.id, rule);
  }
  return [...store.values()];
}

/** `ACCEPT_LANGUAGE_RULE_ID` is an internal constant in `dnr.ts` (not
 *  exported — it's an implementation detail). We parse it from the source
 *  text rather than making it public. This mirrors what the original e2e
 *  drift test did (russian-browser-lang.spec.ts), but runs in the extension's
 *  vitest suite where the source files are directly accessible via `__dirname`,
 *  avoiding the cross-package filesystem gymnastics the e2e package needed.
 *
 *  If `ACCEPT_LANGUAGE_RULE_ID` is ever promoted to a named export, replace
 *  the regex approach with a direct import and update this test. */
describe('ACCEPT_LANGUAGE_RULE_ID', () => {
  it('is 1 (stable DNR contract — changing this breaks users mid-session)', () => {
    const src = readFileSync(path.resolve(__dirname, 'dnr.ts'), 'utf8');
    const match = /ACCEPT_LANGUAGE_RULE_ID\s*=\s*(\d+)/.exec(src);
    const ruleId = match ? Number(match[1]) : null;

    // The pinned value is 1. If this test fails it means dnr.ts changed the
    // constant — Chrome's declarativeNetRequest keyed any in-flight rules to
    // that id, so bumping it orphans existing rules until the next SW restart.
    // Any change must be intentional and paired with a migration strategy.
    expect(ruleId).toBe(1);
  });
});

describe('GOOGLE_SEARCH_RULE_ID', () => {
  it('is 2 (stable DNR contract, same migration caveat as rule 1)', () => {
    const src = readFileSync(path.resolve(__dirname, 'dnr.ts'), 'utf8');
    const match = /GOOGLE_SEARCH_RULE_ID\s*=\s*(\d+)/.exec(src);
    const ruleId = match ? Number(match[1]) : null;
    expect(ruleId).toBe(2);
  });
});

describe('syncAcceptLanguageRule', () => {
  // The single dynamic rule's id (pinned to 1 by the contract test above);
  // updateDynamicRules always names it in removeRuleIds before re-adding, so
  // an in-flight rule is replaced atomically rather than duplicated.
  const RULE_ID = 1;

  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs a modifyHeaders rule for the active, enabled, non-empty case', async () => {
    const update = spyUpdate();
    const settings = { ...defaultSettings, priority: ['uk', 'en'], allowlist: [] };
    await syncAcceptLanguageRule(settings, true);

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0] as Parameters<
      typeof browser.declarativeNetRequest.updateDynamicRules
    >[0];
    // The stale rule is always swept before the fresh one lands.
    expect(arg.removeRuleIds).toEqual([RULE_ID]);
    expect(arg.addRules).toHaveLength(1);
    const rule = arg.addRules![0]!;
    expect(rule.id).toBe(RULE_ID);
    expect(rule.action.type).toBe('modifyHeaders');
    // The header value is delegated to buildAcceptLanguage — assert it matches
    // rather than re-deriving the q-value format here.
    expect(rule.action.requestHeaders).toEqual([
      { header: 'Accept-Language', operation: 'set', value: buildAcceptLanguage(['uk', 'en']) },
    ]);
    // Only navigations get the rewrite — never sub-resource requests.
    expect(rule.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
  });

  it('excludes allowlisted domains from the rule condition', async () => {
    const update = spyUpdate();
    await syncAcceptLanguageRule(
      { ...defaultSettings, priority: ['uk'], allowlist: ['example.com', 'foo.test'] },
      true,
    );
    const rule = (update.mock.calls[0]![0].addRules ?? [])[0]!;
    expect(rule.condition.excludedRequestDomains).toEqual(['example.com', 'foo.test']);
  });

  it('omits excludedRequestDomains entirely when the allowlist is empty', async () => {
    // An empty `excludedRequestDomains: []` would be a meaningless key; the
    // rule should not carry it at all.
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk'], allowlist: [] }, true);
    const rule = (update.mock.calls[0]![0].addRules ?? [])[0]!;
    expect('excludedRequestDomains' in rule.condition).toBe(false);
  });

  it('excludes snoozed hosts (timed) alongside the allowlist (permanent), deduped', async () => {
    const update = spyUpdate();
    await syncAcceptLanguageRule(
      { ...defaultSettings, priority: ['uk'], allowlist: ['example.com'] },
      true,
      ['news.example.com', 'example.com'], // overlaps the allowlist → deduped
    );
    const rule = (update.mock.calls[0]![0].addRules ?? [])[0]!;
    expect(rule.condition.excludedRequestDomains).toEqual(['example.com', 'news.example.com']);
  });

  it('excludes a snoozed host even when the allowlist is empty', async () => {
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk'], allowlist: [] }, true, [
      'snoozed.example.com',
    ]);
    const rule = (update.mock.calls[0]![0].addRules ?? [])[0]!;
    expect(rule.condition.excludedRequestDomains).toEqual(['snoozed.example.com']);
  });

  it('removes the rule (no addRules) when inactive — paused / toggled off at runtime', async () => {
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk', 'en'] }, false);

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0];
    expect(arg.removeRuleIds).toEqual([RULE_ID]);
    // The remove-only path must NOT add a rule back.
    expect('addRules' in arg).toBe(false);
  });

  it('removes the rule when the extension is disabled (settings.enabled=false)', async () => {
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, enabled: false, priority: ['uk'] }, true);
    const arg = update.mock.calls[0]![0];
    expect(arg.removeRuleIds).toEqual([RULE_ID]);
    expect('addRules' in arg).toBe(false);
  });

  it('removes the rule when there is nothing to prefer (empty priority)', async () => {
    // With an empty priority list there is no Accept-Language to assert, so the
    // header rewrite must be torn down rather than installed with a bogus value.
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: [] }, true);
    const arg = update.mock.calls[0]![0];
    expect(arg.removeRuleIds).toEqual([RULE_ID]);
    expect('addRules' in arg).toBe(false);
  });

  it('a remove-then-install sequence leaves exactly one rule registered (no duplication)', async () => {
    // Deactivate (removes), then activate (re-adds). Because every call sweeps
    // RULE_ID first, replaying the operations yields a single rule, never two —
    // an install never stacks on top of a stale copy.
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk'] }, false);
    expect(rulesAfter(update)).toHaveLength(0);
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk'] }, true);
    const rules = rulesAfter(update) as { id: number }[];
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(RULE_ID);
  });

  it('re-installing while already active still leaves exactly one rule (idempotent install)', async () => {
    // Two consecutive active syncs (e.g. a settings change re-running the
    // sync): each names RULE_ID in removeRuleIds, so the second replaces the
    // first in place instead of producing a duplicate.
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk'] }, true);
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk', 'en'] }, true);
    expect(rulesAfter(update)).toHaveLength(1);
  });
});

/** The queryTransform shape buildGoogleSearchRedirectRule emits. Narrowed
 *  locally — the installed browser types keep these keys optional. */
interface QueryTransform {
  addOrReplaceParams: { key: string; value: string }[];
  removeParams: string[];
}

function queryTransformOf(rule: ReturnType<typeof buildGoogleSearchRedirectRule>): QueryTransform {
  const redirect = rule.action.redirect as {
    transform?: { queryTransform?: QueryTransform };
  };
  const transform = redirect.transform?.queryTransform;
  if (!transform) throw new Error('rule carries no queryTransform');
  return transform;
}

/** Reference implementation of DNR queryTransform semantics (remove listed
 *  params, then add-or-replace), used to assert what the browser would compute
 *  for a given URL — including the fixed-point property the rule's loop
 *  safety rests on (a transform whose output equals its input is a skipped
 *  redirect, per Chrome behaviour and Firefox's documented no-op). */
function applyQueryTransform(url: string, transform: QueryTransform): string {
  const next = new URL(url);
  for (const name of transform.removeParams) next.searchParams.delete(name);
  for (const { key, value } of transform.addOrReplaceParams) next.searchParams.set(key, value);
  return next.toString();
}

/** A realistic omnibox entry URL: Chrome mints `gs_lcrp`/`aqs`/`sourceid`/
 *  `ie`/`oq` before any extension code can run, and no entry surface emits
 *  `hl`/`lr` (docs/google-search-url-params.md, finding #2). */
const OMNIBOX_URL =
  'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5&oq=rele&gs_lcrp=EgZjaHJvbWU&aqs=chrome..69i57&sourceid=chrome&ie=UTF-8';

/** Priority the Google-rule tests build against. */
const PRIORITY: [LanguageCode, ...LanguageCode[]] = ['uk', 'en'];

/** The rule's regexFilter, compiled as a JS RegExp. The e2e spec exercises
 *  the filter through Chrome's real matcher; the tests using this pin the
 *  regex semantics themselves — RE2 accepts this pattern's grammar (no
 *  lookaround), so a JS RegExp evaluates it identically. */
function ruleRegex(): RegExp {
  const { regexFilter } = buildGoogleSearchRedirectRule(PRIORITY).condition;
  if (regexFilter == null) throw new Error('rule carries no regexFilter');
  return new RegExp(regexFilter);
}

describe('buildGoogleSearchRedirectRule', () => {
  it('emits a main_frame redirect rule with id 2, host-gated to the google.* domain list', () => {
    const rule = buildGoogleSearchRedirectRule(PRIORITY);
    expect(rule.id).toBe(2);
    expect(rule.action.type).toBe('redirect');
    expect(rule.condition.resourceTypes).toEqual(['main_frame']);
    // Spot-check the derived domain list (full parity with isGoogleHost is
    // pinned in @movar/host-match's own tests and sites/coverage.test.ts).
    expect(rule.condition.requestDomains).toContain('google.com');
    expect(rule.condition.requestDomains).toContain('google.com.ua');
    expect(rule.condition.requestDomains).toContain('google.co.uk');
    expect('excludedRequestDomains' in rule.condition).toBe(false);
  });

  it('writes hl from the top preference and a pipe-joined lr from the full priority', () => {
    const transform = queryTransformOf(buildGoogleSearchRedirectRule(PRIORITY));
    expect(transform.addOrReplaceParams).toEqual([
      { key: 'hl', value: 'uk' },
      { key: 'lr', value: 'lang_uk|lang_en' },
    ]);
  });

  it('removes the strip tier, the scrub tier, and the enumerated gs_* family (deduped)', () => {
    const transform = queryTransformOf(buildGoogleSearchRedirectRule(PRIORITY));
    // Order-free set compare; gs_lcrp sits in BOTH stripParams and the gs_*
    // family enumeration and must appear once. `oq` is strip-listed (a
    // wrong-layout `oq` poisons the SERP), so it sheds pre-request here too.
    expect(transform.removeParams.toSorted()).toEqual([
      'aqs',
      'gs_l',
      'gs_lcrp',
      'gs_lp',
      'gs_ssp',
      'oq',
      'rlz',
      'sei',
    ]);
    const dupes = transform.removeParams.filter((p, i, all) => all.indexOf(p) !== i);
    expect(dupes).toEqual([]);
  });

  it('lists user-provided excluded domains (allowlist/snooze) when present', () => {
    const rule = buildGoogleSearchRedirectRule(PRIORITY, ['google.de']);
    expect(rule.condition.excludedRequestDomains).toEqual(['google.de']);
  });

  describe('condition regexFilter (derived from onlyOnPath + onlyWhenParam)', () => {
    it.each([
      OMNIBOX_URL,
      'https://www.google.com/search?q=test',
      'https://google.com.ua/search?tbm=isch&q=%D1%8F%D0%B1%D0%BB%D1%83%D0%BA%D0%BE',
      'http://google.de/search?q=x',
    ])('matches the SERP URL %s', (url) => {
      expect(ruleRegex().test(url)).toBe(true);
    });

    it.each([
      // Non-/search paths stay untouched — /maps interprets lr differently.
      'https://www.google.com/maps?q=kyiv',
      'https://www.google.com/imghp?q=x',
      // Homepage / q-less surfaces.
      'https://www.google.com/',
      'https://www.google.com/search?tbm=isch',
      // `oq` must not satisfy the `q` gate.
      'https://www.google.com/search?oq=test',
    ])('does not match %s', (url) => {
      expect(ruleRegex().test(url)).toBe(false);
    });
  });

  describe('transform semantics', () => {
    it('rewrites an omnibox entry URL: language params on, session tokens off', () => {
      const transform = queryTransformOf(buildGoogleSearchRedirectRule(PRIORITY));
      const out = new URL(applyQueryTransform(OMNIBOX_URL, transform));
      expect(out.searchParams.get('hl')).toBe('uk');
      expect(out.searchParams.get('lr')).toBe('lang_uk|lang_en');
      expect(out.searchParams.get('gs_lcrp')).toBeNull();
      expect(out.searchParams.get('aqs')).toBeNull();
      // User-facing params survive; `oq` does not — it's strip-listed now (a
      // wrong-keyboard-layout `oq` poisons the SERP under `lr`).
      expect(out.searchParams.get('q')).toBe('реле');
      expect(out.searchParams.get('oq')).toBeNull();
      expect(out.searchParams.get('sourceid')).toBe('chrome');
    });

    it('is a fixed point after one application (the loop-safety invariant)', () => {
      const transform = queryTransformOf(buildGoogleSearchRedirectRule(PRIORITY));
      const once = applyQueryTransform(OMNIBOX_URL, transform);
      // Re-evaluating the rule against its own redirect output must compute
      // an identical URL — that is what makes the browser skip the redirect
      // instead of looping.
      expect(applyQueryTransform(once, transform)).toBe(once);
    });

    it('no-ops byte-for-byte on an already-clean SERP-internal URL (pagination stays put)', () => {
      const transform = queryTransformOf(buildGoogleSearchRedirectRule(PRIORITY));
      const internal =
        'https://www.google.com/search?q=test&hl=uk&lr=lang_uk%7Clang_en&start=10&udm=14';
      expect(applyQueryTransform(internal, transform)).toBe(internal);
    });

    it('computes the same URL the content-script searchParams fallback navigates to', () => {
      // THE drift guard: if the two layers ever compute different URLs, the
      // fallback would re-navigate a page the DNR layer already rewrote,
      // reintroducing the double load the DNR layer exists to remove.
      const transform = queryTransformOf(buildGoogleSearchRedirectRule(PRIORITY));
      const dnrResult = applyQueryTransform(OMNIBOX_URL, transform);

      let navigatedTo: string | null = null;
      applyStrategy(googleRule.strategy, PRIORITY, {
        getUrl: () => new URL(OMNIBOX_URL),
        navigate: (url) => {
          navigatedTo = url;
        },
      });
      expect(navigatedTo).toBe(dnrResult);
    });
  });
});

describe('syncGoogleSearchRedirectRule', () => {
  const GOOGLE_RULE_ID = 2;

  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('installs the redirect rule for the active, enabled, non-empty case', async () => {
    const update = spyUpdate();
    await syncGoogleSearchRedirectRule({ ...defaultSettings, priority: ['uk', 'en'] }, true);

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0] as Parameters<
      typeof browser.declarativeNetRequest.updateDynamicRules
    >[0];
    expect(arg.removeRuleIds).toEqual([GOOGLE_RULE_ID]);
    // The installed rule is exactly the builder's output for these settings.
    expect(arg.addRules).toEqual([buildGoogleSearchRedirectRule(['uk', 'en'])]);
  });

  it('excludes allowlisted + snoozed hosts, deduped', async () => {
    const update = spyUpdate();
    await syncGoogleSearchRedirectRule(
      { ...defaultSettings, priority: ['uk'], allowlist: ['google.de'] },
      true,
      ['google.fr', 'google.de'],
    );
    const rule = (update.mock.calls[0]![0].addRules ?? [])[0]!;
    expect(rule.condition.excludedRequestDomains).toEqual(['google.de', 'google.fr']);
  });

  it.each([
    ['inactive (paused)', { ...defaultSettings, priority: ['uk'] as LanguageCode[] }, false],
    ['disabled', { ...defaultSettings, enabled: false, priority: ['uk'] as LanguageCode[] }, true],
    ['empty priority', { ...defaultSettings, priority: [] as LanguageCode[] }, true],
  ])('removes the rule (no addRules) when %s', async (_label, settings, active) => {
    const update = spyUpdate();
    await syncGoogleSearchRedirectRule(settings, active);
    const arg = update.mock.calls[0]![0];
    expect(arg.removeRuleIds).toEqual([GOOGLE_RULE_ID]);
    expect('addRules' in arg).toBe(false);
  });

  it('removes rather than installs on Safari (queryTransform not trusted there)', async () => {
    vi.stubEnv('BROWSER', 'safari');
    const update = spyUpdate();
    await syncGoogleSearchRedirectRule({ ...defaultSettings, priority: ['uk'] }, true);
    const arg = update.mock.calls[0]![0];
    expect(arg.removeRuleIds).toEqual([GOOGLE_RULE_ID]);
    expect('addRules' in arg).toBe(false);
  });

  it('degrades to the content-script fallback when the platform rejects the rule shape', async () => {
    // A DNR implementation without redirect/queryTransform support rejects
    // updateDynamicRules. The sync must swallow that (the content-script
    // rewrite still covers the host) and sweep any stale rule copy.
    const update = spyUpdate();
    update.mockRejectedValueOnce(new Error('rule with id 2 is invalid'));
    await expect(
      syncGoogleSearchRedirectRule({ ...defaultSettings, priority: ['uk'] }, true),
    ).resolves.toBeUndefined();
    // First call carried the rejected install; the follow-up sweeps rule 2.
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]![0]).toEqual({ removeRuleIds: [GOOGLE_RULE_ID] });
  });

  it('does not throw even when the cleanup removal is rejected too', async () => {
    vi.spyOn(browser.declarativeNetRequest, 'updateDynamicRules').mockRejectedValue(
      new Error('declarativeNetRequest unavailable'),
    );
    await expect(
      syncGoogleSearchRedirectRule({ ...defaultSettings, priority: ['uk'] }, true),
    ).resolves.toBeUndefined();
  });

  it('coexists with the Accept-Language rule — two rules, distinct ids, no clash', async () => {
    const update = spyUpdate();
    await syncAcceptLanguageRule({ ...defaultSettings, priority: ['uk'] }, true);
    await syncGoogleSearchRedirectRule({ ...defaultSettings, priority: ['uk'] }, true);
    const rules = rulesAfter(update) as { id: number }[];
    expect(rules.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([1, GOOGLE_RULE_ID]);
  });
});
