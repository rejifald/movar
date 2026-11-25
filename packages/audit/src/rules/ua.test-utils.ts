import { evaluate } from '../evaluate';
import type { AlternateLink, Evidence, PageEvidence } from '../evidence';
import type { RuleResult } from '../report';
import type { Ruleset } from '../ruleset';
import { CORE_RULESET, createRuleset, UA_PACK_FAMILIES, withPack } from '../ruleset';
import { uaPackFamily } from './ua';
import { makeDocument, makePage } from '../../test/fixtures';

export const RULESET = createRuleset({
  id: 'test/ua',
  version: '0.0.0-test',
  families: [uaPackFamily],
});

/** The pack as a caller actually composes it — the neutral core plus family F. */
export const COMPOSED_RULESET = withPack(CORE_RULESET, ...UA_PACK_FAMILIES);

export function resultFor(
  ruleId: string,
  evidence: Evidence,
  ruleset: Ruleset = RULESET,
): RuleResult {
  const result = evaluate(evidence, ruleset).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

export function pageIn(
  id: string,
  path: string,
  htmlLang: string,
  overrides: Partial<PageEvidence> = {},
): PageEvidence {
  return makePage({
    id,
    url: `https://example.com.ua${path}`,
    document: makeDocument({ htmlLang }),
    ...overrides,
  });
}

/** `{ examined, sampled, cappedAt }` as a collector writes it when the cap bites. */
export function capped(
  examined: number,
  sampled: number,
): { examined: number; sampled: number; cappedAt: number } {
  return { examined, sampled, cappedAt: sampled };
}

/** A page whose URL alone declares the Ukrainian market (the `.ua` TLD signal). */
export function ukMarketPage(overrides: Partial<PageEvidence> = {}): PageEvidence {
  return makePage({ url: 'https://example.com.ua/', ...overrides });
}

export const UK_ALTERNATE: AlternateLink = {
  hreflang: 'uk-UA',
  href: 'https://example.com.ua/uk/',
  source: 'link',
};

export const shortText = 'Короткий текст.';

export const longText =
  'Це значно довший текст із набагато більшою кількістю деталей про товар, доставку, оплату ' +
  'та все інше, що тут перелічено як приклад достатньої довжини для порівняння обсягу контенту.';
