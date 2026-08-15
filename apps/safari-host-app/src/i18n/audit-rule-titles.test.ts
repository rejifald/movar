import { describe, expect, it } from 'vitest';
import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from '@movar/audit';
import { auditRuleTitlesUk } from './audit-rule-titles';

/**
 * The drift guard for the one place this app restates something the kernel owns.
 *
 * `@movar/audit` is deliberately **not** translated: its rule titles and finding
 * summaries are the wording an exported report carries and the CLI reproduces,
 * and a report that reads differently depending on who generated it is not
 * replayable. So localization happens here, in the UI that displays it, keyed by
 * the rule ID — which the ADR names as part of the package's permanent public
 * API and therefore the only safe thing to key on.
 *
 * The cost of that choice is drift: a rule added to the kernel would silently
 * render in English forever, and a rule removed would leave a dead entry nobody
 * notices. Both are invisible in a screenshot and invisible in every other test,
 * so they are asserted here.
 */
describe('Ukrainian audit rule titles', () => {
  const ruleset = withPack(CORE_RULESET, ...UA_PACK_FAMILIES);
  const shipped = ruleset.rules.map((rule) => rule.id).toSorted((a, b) => a.localeCompare(b));
  const translated = Object.keys(auditRuleTitlesUk).toSorted((a, b) => a.localeCompare(b));

  it('covers every rule the app can run, and nothing it cannot', () => {
    // One assertion over the whole set rather than two `every` checks: when it
    // fails, the diff names the exact rule that was added or removed.
    expect(translated).toEqual(shipped);
  });

  it('leaves no entry empty — a blank title would render as a nameless finding', () => {
    const blank = Object.entries(auditRuleTitlesUk)
      .filter(([, title]) => title.trim() === '')
      .map(([id]) => id);
    expect(blank).toEqual([]);
  });

  it('keeps the technical identifiers a reader needs to search for', () => {
    // These are not words to translate — they are the attribute and header
    // names a site owner greps their own codebase for. If a translation ever
    // renders `hreflang` as a Ukrainian phrase, the finding stops being
    // actionable for the person who has to fix it.
    expect(auditRuleTitlesUk['core/hreflang-duplicate']).toContain('hreflang');
    expect(auditRuleTitlesUk['core/serving-vary-missing']).toContain('Accept-Language');
    expect(auditRuleTitlesUk['core/lang-missing']).toContain('lang');
  });
});
