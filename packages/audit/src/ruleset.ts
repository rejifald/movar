/**
 * Ruleset assembly.
 *
 * **The ruleset floats with the package version and is stamped on every
 * report.** Upgrading `@movar/audit` applies new rules immediately; opting out
 * is a suppression, not a pin. The stamp is what keeps replay meaningful —
 * without it, re-adjudicated evidence cannot distinguish "the site changed"
 * from "the rules changed".
 *
 * Adding a family is a two-line change here (an import and an array entry) and
 * touches no existing rule file. Nothing else in the kernel knows a family
 * exists.
 */

import packageJson from '../package.json';
import { createSnippetClassifier } from './classifier';
import type { Classifier } from './classifier';
import type { Rule, RuleFamily } from './rule';
import { contentLanguageFamily } from './rules/content-language';
import { inventoryFamily } from './rules/inventory';
import { pageDeclarationFamily } from './rules/page-declaration';
import { servingFamily } from './rules/serving';
import { switchFamily } from './rules/switch';
import { uaPackFamily } from './rules/ua';

/** Tracks the package version, so a report always names the rules it ran. */
export const RULESET_VERSION: string = packageJson.version;

/** The catalogue a report was adjudicated against. */
export interface Ruleset {
  readonly id: string;
  readonly version: string;
  readonly families: readonly RuleFamily[];
  /** Every rule, flattened in family order. Evaluation order is stable. */
  readonly rules: readonly Rule[];
  /** The classifier the kernel hands rules. Franc-free unless injected. */
  readonly classifier: Classifier;
}

export interface RulesetInput {
  readonly id: string;
  readonly version: string;
  readonly families: readonly RuleFamily[];
  /**
   * Optional classifier override — e.g. one built with `francRung3Resolver`
   * from `@movar/lang-detect/franc` when the runtime can afford the trigram
   * tables. Defaults to the franc-free snippet classifier.
   */
  readonly classifier?: Classifier;
}

/** A ruleset was assembled with a rule ID that is already taken. */
export class DuplicateRuleIdError extends Error {
  readonly ruleId: string;

  constructor(ruleId: string) {
    super(
      `duplicate rule id '${ruleId}' — IDs are the audit's public API and must be unique across families`,
    );
    this.name = 'DuplicateRuleIdError';
    this.ruleId = ruleId;
  }
}

function assertUniqueIds(rules: readonly Rule[]): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new DuplicateRuleIdError(rule.id);
    seen.add(rule.id);
  }
}

/** Flatten families into an evaluation-ordered ruleset. */
export function createRuleset(input: RulesetInput): Ruleset {
  const rules = input.families.flatMap((family) => [...family.rules]);
  assertUniqueIds(rules);
  return {
    id: input.id,
    version: input.version,
    families: input.families,
    rules,
    classifier: input.classifier ?? createSnippetClassifier(),
  };
}

/**
 * The neutral, jurisdiction-free core — families A–E.
 *
 * This is the set a team with no interest in Ukrainian runs: A and the mixed-
 * language part of E map onto WCAG 2.1 SC 3.1.1 and 3.1.2, and nothing in it
 * asserts that a site *should* offer any particular language. It says only
 * "you declared this and did not deliver it".
 *
 * A jurisdiction pack is deliberately **not** here. It is a separate `Ruleset`
 * a caller composes with {@link withPack}, so statute rules apply only where
 * the site declares that market.
 */
export const CORE_RULESET: Ruleset = createRuleset({
  id: 'movar-audit-core',
  version: RULESET_VERSION,
  families: [
    pageDeclarationFamily,
    inventoryFamily,
    servingFamily,
    switchFamily,
    contentLanguageFamily,
  ],
});

/**
 * Ukraine's Law 2704-VIII pack. Composed onto the core by a caller who has
 * decided the pack is in scope — never bundled into {@link CORE_RULESET},
 * because a statute that does not apply must not even be evaluated.
 *
 * Note the pack still gates itself: `ua/market-determination` reports which
 * declared signals fired, and every other `ua/` rule returns `not-applicable`
 * when the market is undeterminable. Composition decides whether to ask; the
 * pack decides whether the question is answerable.
 */
export const UA_PACK_FAMILIES: readonly RuleFamily[] = [uaPackFamily];

/** The core plus one or more jurisdiction packs, as one adjudicable ruleset. */
export function withPack(base: Ruleset, ...families: readonly RuleFamily[]): Ruleset {
  return createRuleset({
    id: `${base.id}+${families.map((family) => family.id).join('+')}`,
    version: base.version,
    families: [...base.families, ...families],
    classifier: base.classifier,
  });
}
