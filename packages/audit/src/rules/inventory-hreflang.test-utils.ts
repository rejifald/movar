import { evaluate } from '../evaluate';
import type { AlternateLink, Evidence, PageEvidence } from '../evidence';
import type { RuleResult } from '../report';
import { createRuleset } from '../ruleset';
import { hreflangRules } from './inventory-hreflang';
import { makeBuildPage, makeDocument, makePage } from '../../test/fixtures';

const RULESET = createRuleset({
  id: 'test/hreflang',
  version: '0.0.0-test',
  families: [{ id: 'B. Inventory (hreflang)', title: 'hreflang', rules: hreflangRules }],
});

export function resultFor(ruleId: string, evidence: Evidence): RuleResult {
  const result = evaluate(evidence, RULESET).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

export function link(
  hreflang: string,
  href: string,
  overrides: Partial<AlternateLink> = {},
): AlternateLink {
  return { hreflang, href, source: 'link', ...overrides };
}

export function pageAt(
  url: string,
  alternates: readonly AlternateLink[],
  overrides: Partial<PageEvidence> = {},
): PageEvidence {
  return makePage({ url, document: makeDocument({ alternates }), ...overrides });
}

/** The same page off disk: a build `path`, and no `url` for a base to read. */
export function buildPageAt(
  path: string,
  alternates: readonly AlternateLink[],
  id: string,
  htmlLang = 'uk',
): PageEvidence {
  return makeBuildPage({ id, path, document: makeDocument({ htmlLang, alternates }) });
}
