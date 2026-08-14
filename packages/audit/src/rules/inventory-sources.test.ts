import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type { AlternateLink, Evidence, PageEvidence, PickerOption } from '../evidence';
import type { RuleResult } from '../report';
import type { RuleFamily } from '../rule';
import { createRuleset } from '../ruleset';
import { inventorySourceRules } from './inventory-sources';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makePicker,
  networkEvidence,
} from '../../test/fixtures';

const FAMILY: RuleFamily = {
  id: 'B (subset)',
  title: 'inventory consistency + picker reachability',
  rules: [...inventorySourceRules],
};
const RULESET = createRuleset({
  id: 'test/inventory-sources',
  version: '0.0.0-test',
  families: [FAMILY],
});

function resultFor(ruleId: string, evidence: Evidence): RuleResult {
  const result = evaluate(evidence, RULESET).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

function onPage(ruleId: string, page: PageEvidence): RuleResult {
  return resultFor(ruleId, networkEvidence([page]));
}

function alternate(hreflang: string, href = `https://example.com.ua/${hreflang}/`): AlternateLink {
  return { hreflang, href, source: 'link' };
}

function option(label: string, href: string | null, active = false): PickerOption {
  return { label, href, active, nodePath: `nav > a[data-lang="${label}"]` };
}

describe('the family slice', () => {
  it('ships the seven rules, in catalogue order', () => {
    expect(inventorySourceRules.map((rule) => rule.id)).toEqual([
      'core/inventory-sources-disagree',
      'core/inventory-varies-across-pages',
      'core/inventory-undetermined',
      'core/picker-option-undeclared',
      'core/picker-omits-declared-language',
      'core/picker-no-navigable-target',
      'core/picker-target-unresolvable',
    ]);
  });

  it('is entirely declared-grounded, with no hybrid', () => {
    for (const rule of inventorySourceRules) {
      expect(rule.grounding).toBe('declared');
      expect(rule.hybrid).toBeUndefined();
    }
  });

  it('declares capabilities verbatim from the catalogue, with the alternation resolved', () => {
    const byId = new Map(inventorySourceRules.map((rule) => [rule.id, rule]));
    expect(byId.get('core/inventory-sources-disagree')?.capabilities).toEqual(['static']);
    expect(byId.get('core/inventory-varies-across-pages')?.capabilities).toEqual(['site']);
    expect(byId.get('core/inventory-undetermined')?.capabilities).toEqual(['static']);
    expect(byId.get('core/picker-option-undeclared')?.capabilities).toEqual(['static']);
    expect(byId.get('core/picker-omits-declared-language')?.capabilities).toEqual(['static']);
    expect(byId.get('core/picker-no-navigable-target')?.capabilities).toEqual(['static']);
    expect(byId.get('core/picker-target-unresolvable')?.capabilities).toEqual(['traversal']);
  });

  it('scopes only core/inventory-varies-across-pages to the site', () => {
    for (const rule of inventorySourceRules) {
      const expected = rule.id === 'core/inventory-varies-across-pages' ? 'site' : 'page';
      expect(rule.scope).toBe(expected);
    }
  });
});

describe('core/inventory-sources-disagree', () => {
  const RULE = 'core/inventory-sources-disagree';

  it('names the source missing a language another source declares', () => {
    const page = makePage({
      document: makeDocument({
        alternates: [alternate('uk'), alternate('ru')],
        picker: makePicker({ options: [option('uk', '/uk/')] }),
      }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/picker/i);
    expect(result.findings[0]?.summary).toMatch(/ru/);
  });

  it('passes when only one source declares anything, so nothing disagrees', () => {
    const page = makePage({
      document: makeDocument({ alternates: [alternate('uk'), alternate('ru')] }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('is not applicable when no source declares anything', () => {
    expect(onPage(RULE, makePage({ document: makeDocument() })).verdict).toBe('not-applicable');
  });
});

describe('core/inventory-varies-across-pages', () => {
  const RULE = 'core/inventory-varies-across-pages';

  it('fires when some pages declare a narrower inventory than the rest of the site', () => {
    const home = makePage({
      id: 'home',
      url: 'https://example.com.ua/',
      document: makeDocument({ alternates: [alternate('uk'), alternate('en')] }),
    });
    const product1 = makePage({
      id: 'product-1',
      url: 'https://example.com.ua/product-1',
      document: makeDocument({ alternates: [alternate('en')] }),
    });
    const product2 = makePage({
      id: 'product-2',
      url: 'https://example.com.ua/product-2',
      document: makeDocument({ alternates: [alternate('en')] }),
    });
    const result = resultFor(RULE, networkEvidence([home, product1, product2]));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject).toEqual({});
    expect(result.findings[0]?.scope).toBe('site');
    expect(result.findings[0]?.summary).toMatch(/1 of 3/);
    expect(result.findings[0]?.summary).toMatch(/en, uk/);
  });

  it('passes when every collected page declares the same inventory', () => {
    const home = makePage({
      id: 'home',
      url: 'https://example.com.ua/',
      document: makeDocument({ alternates: [alternate('uk'), alternate('en')] }),
    });
    const about = makePage({
      id: 'about',
      url: 'https://example.com.ua/about',
      document: makeDocument({ alternates: [alternate('uk'), alternate('en')] }),
    });
    expect(resultFor(RULE, networkEvidence([home, about])).verdict).toBe('pass');
  });
});

describe('core/inventory-undetermined', () => {
  const RULE = 'core/inventory-undetermined';

  it('reports alternates that carry no resolvable language (only x-default)', () => {
    const page = makePage({
      document: makeDocument({
        alternates: [{ hreflang: 'x-default', href: '/', source: 'link' }],
      }),
    });
    const result = onPage(RULE, page);
    // info is never a failure, so the rule-level verdict still reads pass.
    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('info');
  });

  it('reports a picker whose labels carry no resolvable language', () => {
    const page = makePage({
      document: makeDocument({
        picker: makePicker({ options: [option('Klingon', '/a'), option('Vulcan', '/b')] }),
      }),
    });
    const result = onPage(RULE, page);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.verdict).toBe('info');
  });

  it('passes when the inventory resolves cleanly', () => {
    const page = makePage({ document: makeDocument({ alternates: [alternate('uk')] }) });
    expect(onPage(RULE, page).findings).toHaveLength(0);
  });

  it('is not applicable with no alternates and no picker', () => {
    expect(onPage(RULE, makePage({ document: makeDocument() })).verdict).toBe('not-applicable');
  });
});

describe('core/picker-option-undeclared', () => {
  const RULE = 'core/picker-option-undeclared';

  it('fires on a picker language nothing else declares', () => {
    const page = makePage({
      document: makeDocument({
        alternates: [alternate('uk')],
        picker: makePicker({ options: [option('uk', '/uk/'), option('ru', '/ru/')] }),
      }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject.node).toBe('nav > a[data-lang="ru"]');
  });

  it('passes when every picker language is declared elsewhere', () => {
    const page = makePage({
      document: makeDocument({
        alternates: [alternate('uk')],
        picker: makePicker({ options: [option('uk', '/uk/')] }),
      }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('is not applicable with no picker', () => {
    const page = makePage({ document: makeDocument({ alternates: [alternate('uk')] }) });
    expect(onPage(RULE, page).verdict).toBe('not-applicable');
  });

  it('is not applicable with nothing else declared to compare the picker against', () => {
    const page = makePage({
      document: makeDocument({ picker: makePicker({ options: [option('uk', '/uk/')] }) }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/hreflang/);
  });
});

describe('core/picker-omits-declared-language', () => {
  const RULE = 'core/picker-omits-declared-language';

  it('warns when a declared language has no picker entry', () => {
    const page = makePage({
      document: makeDocument({
        alternates: [alternate('uk'), alternate('ru')],
        picker: makePicker({ options: [option('uk', '/uk/')] }),
      }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('warn');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/ru/);
  });

  it('passes when the picker offers every declared language', () => {
    const page = makePage({
      document: makeDocument({
        alternates: [alternate('uk'), alternate('ru')],
        picker: makePicker({ options: [option('uk', '/uk/'), option('ru', '/ru/')] }),
      }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('is not applicable with no picker', () => {
    const page = makePage({
      document: makeDocument({ alternates: [alternate('uk'), alternate('ru')] }),
    });
    expect(onPage(RULE, page).verdict).toBe('not-applicable');
  });
});

describe('core/picker-no-navigable-target', () => {
  const RULE = 'core/picker-no-navigable-target';

  it('fires on an inactive entry with no href', () => {
    const page = makePage({
      document: makeDocument({
        picker: makePicker({ options: [option('uk', '/uk/', true), option('ru', null, false)] }),
      }),
    });
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.summary).toMatch(/search engines/);
  });

  it('does not fire on the active entry, which is commonly link-less', () => {
    const page = makePage({
      document: makeDocument({
        picker: makePicker({ options: [option('uk', null, true), option('ru', '/ru/', false)] }),
      }),
    });
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('is not applicable with no picker', () => {
    expect(onPage(RULE, makePage({ document: makeDocument() })).verdict).toBe('not-applicable');
  });
});

describe('core/picker-target-unresolvable', () => {
  const RULE = 'core/picker-target-unresolvable';

  it('fires when no collected page matches the declared target', () => {
    const page = makeBuildPage({
      id: 'p-uk',
      path: 'uk/index.html',
      document: makeDocument({ picker: makePicker({ options: [option('de', '/de/')] }) }),
    });
    const result = resultFor(RULE, filesystemEvidence([page]));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('passes when the target resolves to a collected page', () => {
    const uk = makeBuildPage({
      id: 'p-uk',
      path: 'uk/index.html',
      document: makeDocument({ picker: makePicker({ options: [option('ru', '/ru/')] }) }),
    });
    const ru = makeBuildPage({ id: 'p-ru', path: 'ru/index.html' });
    expect(resultFor(RULE, filesystemEvidence([uk, ru])).verdict).toBe('pass');
  });

  it('is not applicable with no picker', () => {
    const page = makeBuildPage({ id: 'p-uk', path: 'uk/index.html' });
    expect(resultFor(RULE, filesystemEvidence([page])).verdict).toBe('not-applicable');
  });

  it('is not applicable when no picker entry declares an href', () => {
    const page = makeBuildPage({
      id: 'p-uk',
      path: 'uk/index.html',
      document: makeDocument({ picker: makePicker({ options: [option('uk', null, true)] }) }),
    });
    const result = resultFor(RULE, filesystemEvidence([page]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no picker entry/);
  });
});
