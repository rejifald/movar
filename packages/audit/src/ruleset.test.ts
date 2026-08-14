import { describe, expect, it } from 'vitest';
import type { ClassifiedText } from './classifier';
import type { CoreRule } from './rule';
import { pass, ruleCitation } from './rule';
import {
  CORE_RULESET,
  createRuleset,
  DuplicateRuleIdError,
  RULESET_VERSION,
  UA_PACK_FAMILIES,
  withPack,
} from './ruleset';

/** A classifier that answers regardless of input — proves the seam is injectable. */
const STUB_CLASSIFIER = (): ClassifiedText => ({
  language: 'be',
  margin: 1,
  rung: 1,
  discriminating: true,
});

const RULE: CoreRule<'page'> = {
  id: 'core/example',
  title: 'an example rule',
  capabilities: ['static'],
  grounding: 'declared',
  scope: 'page',
  run: () => pass(),
};

describe('createRuleset', () => {
  it('flattens families into a stable evaluation order', () => {
    const ruleset = createRuleset({
      id: 'test',
      version: '1.2.3',
      families: [
        { id: 'A', title: 'first', rules: [RULE] },
        { id: 'B', title: 'second', rules: [{ ...RULE, id: 'core/other' }] },
      ],
    });
    expect(ruleset.rules.map((rule) => rule.id)).toEqual(['core/example', 'core/other']);
  });

  it('refuses a duplicate rule id — IDs are the audit’s public API', () => {
    expect(() =>
      createRuleset({
        id: 'test',
        version: '1.2.3',
        families: [
          { id: 'A', title: 'first', rules: [RULE] },
          { id: 'B', title: 'second', rules: [RULE] },
        ],
      }),
    ).toThrow(DuplicateRuleIdError);
  });

  it('defaults to the franc-free snippet classifier', () => {
    const ruleset = createRuleset({ id: 'test', version: '1.2.3', families: [] });
    expect(ruleset.classifier('Ще не вмерла України і слава, і воля', ['uk', 'ru'])?.language).toBe(
      'uk',
    );
  });

  it('accepts an injected classifier', () => {
    const ruleset = createRuleset({
      id: 'test',
      version: '1.2.3',
      families: [],
      classifier: STUB_CLASSIFIER,
    });
    expect(ruleset.classifier('anything', ['uk'])?.language).toBe('be');
  });
});

describe('CORE_RULESET', () => {
  it('floats with the package version', () => {
    expect(CORE_RULESET.version).toBe(RULESET_VERSION);
    expect(RULESET_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('carries the five neutral families, and no jurisdiction pack', () => {
    expect(CORE_RULESET.families.map((family) => family.id)).toEqual([
      'A. Page declaration',
      'B. Inventory',
      'C. Serving',
      'D. Switch',
      'E. Content language',
    ]);
    expect(CORE_RULESET.rules.every((rule) => rule.id.startsWith('core/'))).toBe(true);
  });

  /**
   * The catalogue's per-family counts. Rule IDs are the audit's public API —
   * suppressions cite them and stored evidence replays against them — so a rule
   * quietly disappearing is a suppression that stops suppressing and a report
   * that stops reproducing. This is the guard for that.
   */
  it('matches the catalogue: 35 neutral rules across A–E', () => {
    const perFamily = Object.fromEntries(
      CORE_RULESET.families.map((family) => [family.id, family.rules.length]),
    );
    expect(perFamily).toEqual({
      'A. Page declaration': 6,
      'B. Inventory': 15,
      'C. Serving': 7,
      'D. Switch': 4,
      'E. Content language': 3,
    });
    expect(CORE_RULESET.rules).toHaveLength(35);
  });

  it('composes the ua pack without disturbing the core', () => {
    const composed = withPack(CORE_RULESET, ...UA_PACK_FAMILIES);
    expect(composed.rules).toHaveLength(CORE_RULESET.rules.length + 6);
    expect(composed.rules.filter((rule) => rule.id.startsWith('ua/'))).toHaveLength(6);
    // Composition must not mutate the core — a second audit in the same
    // process must not inherit the first one's jurisdiction.
    expect(CORE_RULESET.rules.some((rule) => rule.id.startsWith('ua/'))).toBe(false);
  });

  it('gives every pack rule a citation, since the kernel stamps it on findings', () => {
    for (const rule of withPack(CORE_RULESET, ...UA_PACK_FAMILIES).rules) {
      if (rule.id.startsWith('core/')) continue;
      expect(ruleCitation(rule)).not.toBeNull();
    }
  });
});
