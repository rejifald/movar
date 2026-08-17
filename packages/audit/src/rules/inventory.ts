/**
 * **Family B — inventory.** The catalogue's largest family, split across two
 * implementation files purely for size: `inventory-sources.ts` holds the
 * `core/inventory-*` and `core/picker-*` rules, `inventory-hreflang.ts` the
 * `core/hreflang-*` ones. The split is invisible to a report — this barrel
 * reassembles the single family the catalogue documents.
 *
 * Rules are ordered as the catalogue lists them, not as the two files happen to
 * export them: the report renders in evaluation order, and a reader comparing it
 * against `docs/movar-audit-rules.md` should not have to re-sort in their head.
 *
 * @see ../../../../docs/movar-audit-rules.md — family B
 */

import type { Rule, RuleFamily } from '../rule';
import { hreflangRules } from './inventory-hreflang';
import { inventorySourceRules } from './inventory-sources';

/**
 * The catalogue's own order for family B. Also the completeness check: the
 * barrel is assembled by looking each ID up, so a rule that is renamed or
 * dropped fails loudly here rather than vanishing quietly from every report.
 * Rule IDs are the audit's public API — a silent disappearance is a suppression
 * that stops suppressing and a stored report that stops replaying.
 */
export const INVENTORY_RULE_ORDER: readonly string[] = [
  'core/inventory-sources-disagree',
  'core/inventory-varies-across-pages',
  'core/inventory-undetermined',
  'core/hreflang-self-missing',
  'core/hreflang-not-reciprocal',
  'core/hreflang-duplicate',
  'core/hreflang-malformed',
  'core/hreflang-target-relative',
  'core/hreflang-x-default-missing',
  'core/hreflang-target-unresolvable',
  'core/hreflang-target-wrong-language',
  'core/picker-option-undeclared',
  'core/picker-omits-declared-language',
  'core/picker-no-navigable-target',
  'core/picker-target-unresolvable',
];

/** A rule listed in the catalogue order is missing from the implementation files. */
export class MissingInventoryRuleError extends Error {
  readonly ruleId: string;

  constructor(ruleId: string) {
    super(
      `family B declares '${ruleId}' in its catalogue order but no implementation file exports it`,
    );
    this.name = 'MissingInventoryRuleError';
    this.ruleId = ruleId;
  }
}

function assembleInventoryRules(): readonly Rule[] {
  const implemented = new Map<string, Rule>(
    [...inventorySourceRules, ...hreflangRules].map((rule) => [rule.id, rule]),
  );
  const ordered = INVENTORY_RULE_ORDER.map((id) => {
    const rule = implemented.get(id);
    if (rule === undefined) throw new MissingInventoryRuleError(id);
    implemented.delete(id);
    return rule;
  });
  // Anything left over is a rule the catalogue order does not know about; it
  // still ships, appended, rather than being silently dropped.
  return [...ordered, ...implemented.values()];
}

export const inventoryFamily: RuleFamily = {
  id: 'B. Inventory',
  title: 'Inventory — what the site declares it offers, and whether its sources agree',
  rules: assembleInventoryRules(),
};
