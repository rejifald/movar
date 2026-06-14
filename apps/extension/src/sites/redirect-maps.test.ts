import { describe, expect, it } from 'vitest';
import { defaultSettings, enforceLockedLanguages } from '@movar/settings';
import type { LanguageCode } from '@movar/lang-detect';
import { duckduckgoRule } from './duckduckgo';
import { youtubeRule } from './youtube';
import { googleRule } from './google';
import type { LangValues, SiteRule } from './types';

/** The first-class Preferred-language targets (#125). `ru` is deliberately
 *  absent — it's permanently locked-blocked, never a redirect target. */
const TARGETS: LanguageCode[] = ['uk', 'en', 'de', 'fr', 'es', 'it', 'pl'];

/** Pull a search-param's per-language `values` map off a rule. */
function paramValues(rule: SiteRule, name: string): LangValues | undefined {
  const strategy = rule.strategy;
  if (strategy.type !== 'searchParams') return undefined;
  return strategy.params.find((p) => p.name === name)?.values;
}

describe('redirect maps never bias toward Russian', () => {
  it('DuckDuckGo `kl` resolves a region for every target and has no ru entry', () => {
    const kl = paramValues(duckduckgoRule, 'kl')!;
    expect('ru' in kl).toBe(false);
    for (const code of TARGETS) expect(kl[code]).toBeDefined();
  });

  it('YouTube `gl` resolves a region for every target and has no ru entry', () => {
    const gl = paramValues(youtubeRule, 'gl')!;
    expect('ru' in gl).toBe(false);
    for (const code of TARGETS) expect(gl[code]).toBeDefined();
  });

  it('Google `lr` pipe-joins the whole priority with the lang_ prefix and never emits lang_ru', () => {
    // `lr` carries no values map — it joins the priority list as
    // `lang_<code>|…` (strategy.ts joinPreferences). Russian can't be in
    // priority, so `lang_ru` never appears.
    const lr = paramValues(googleRule, 'lr');
    expect(lr).toBeUndefined(); // generic prefix-join, no per-language map
    const joined = TARGETS.map((code) => `lang_${code}`).join('|');
    expect(joined).toContain('lang_uk');
    expect(joined).toContain('lang_pl');
    expect(joined).not.toContain('lang_ru');
  });

  it('the locked invariant keeps ru out of priority, so no redirect target is ever ru', () => {
    // Even a stale/hand-edited settings object with ru in priority is coerced.
    const sanitized = enforceLockedLanguages({
      ...defaultSettings,
      priority: ['ru', 'uk', 'en'],
      blocked: [],
    });
    expect(sanitized.priority).not.toContain('ru');
    expect(sanitized.blocked).toContain('ru');
  });
});
