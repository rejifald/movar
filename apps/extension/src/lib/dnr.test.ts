import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import { buildAcceptLanguage, enrichWithRegions } from './accept-language';
import { syncAcceptLanguageRule } from './dnr';

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
    // The header value is delegated to buildAcceptLanguage(enrichWithRegions(...))
    // — assert it matches rather than re-deriving the q-value format here.
    expect(rule.action.requestHeaders).toEqual([
      {
        header: 'Accept-Language',
        operation: 'set',
        value: buildAcceptLanguage(enrichWithRegions(['uk', 'en'])),
      },
    ]);
    // Only navigations get the rewrite — never sub-resource requests.
    expect(rule.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
  });

  it('emits regional variants plus bare fallbacks in the right q-order', async () => {
    // Regional enrichment is a shipped feature: bare ISO codes expand to
    // `<code>-<REGION>, <code>` so strict-region servers get the richer hint
    // while bare-only servers still match the fallback. Pin the exact header so
    // a regression in the enrichment or q-step is caught here (not just via the
    // delegated-equality assertion above).
    const update = spyUpdate();
    await syncAcceptLanguageRule(
      { ...defaultSettings, priority: ['uk', 'en'], allowlist: [] },
      true,
    );
    const rule = (update.mock.calls[0]![0].addRules ?? [])[0]!;
    expect(rule.action.requestHeaders![0]!.value).toBe('uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7');
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
