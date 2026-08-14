import { describe, expect, it } from 'vitest';
import { INVENTORY_RULE_ORDER, inventoryFamily, MissingInventoryRuleError } from './inventory';
import { hreflangRules } from './inventory-hreflang';
import { inventorySourceRules } from './inventory-sources';

/**
 * Family B is two implementation files behind one catalogue family. These
 * assert the seam does not leak: a report must show the family the catalogue
 * documents, in the order it documents, whatever the split happens to be.
 */
describe('inventoryFamily', () => {
  it('presents one family, in the catalogue’s order', () => {
    expect(inventoryFamily.rules.map((rule) => rule.id)).toEqual(INVENTORY_RULE_ORDER);
  });

  it('carries the catalogue’s 15 rules, drawn from both implementation files', () => {
    expect(inventoryFamily.rules).toHaveLength(15);
    expect(inventorySourceRules).toHaveLength(7);
    expect(hreflangRules).toHaveLength(8);
  });

  it('loses nothing in the split — every implemented rule reaches the family', () => {
    const implemented = [...inventorySourceRules, ...hreflangRules]
      .map((rule) => rule.id)
      .toSorted();
    expect(inventoryFamily.rules.map((rule) => rule.id).toSorted()).toEqual(implemented);
  });

  it('declares only core rules — family B carries no jurisdiction pack', () => {
    expect(inventoryFamily.rules.every((rule) => rule.id.startsWith('core/'))).toBe(true);
  });
});

describe('MissingInventoryRuleError', () => {
  /**
   * The barrel is assembled by looking each catalogue ID up, so a rule that is
   * renamed or dropped fails loudly rather than vanishing from every report.
   * Rule IDs are the audit's public API: a silent disappearance is a
   * suppression that stops suppressing and a stored report that stops replaying.
   */
  it('names the rule that went missing', () => {
    const error = new MissingInventoryRuleError('core/hreflang-duplicate');
    expect(error.ruleId).toBe('core/hreflang-duplicate');
    expect(error.name).toBe('MissingInventoryRuleError');
    expect(error.message).toContain('core/hreflang-duplicate');
  });

  it('is thrown by name, so a caller can distinguish it from a bad ruleset', () => {
    expect(new MissingInventoryRuleError('core/whatever')).toBeInstanceOf(Error);
  });
});
