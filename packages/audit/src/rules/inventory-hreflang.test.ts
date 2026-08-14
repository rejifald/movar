import { describe, expect, it } from 'vitest';
import { evaluate } from '../evaluate';
import type { AlternateLink, Evidence, PageEvidence } from '../evidence';
import type { RuleResult } from '../report';
import { createRuleset } from '../ruleset';
import { hreflangRules } from './inventory-hreflang';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';

const RULESET = createRuleset({
  id: 'test/hreflang',
  version: '0.0.0-test',
  families: [{ id: 'B. Inventory (hreflang)', title: 'hreflang', rules: hreflangRules }],
});

function resultFor(ruleId: string, evidence: Evidence): RuleResult {
  const result = evaluate(evidence, RULESET).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

function onPage(ruleId: string, page: PageEvidence): RuleResult {
  return resultFor(ruleId, networkEvidence([page]));
}

function link(
  hreflang: string,
  href: string,
  overrides: Partial<AlternateLink> = {},
): AlternateLink {
  return { hreflang, href, source: 'link', ...overrides };
}

function pageAt(
  url: string,
  alternates: readonly AlternateLink[],
  overrides: Partial<PageEvidence> = {},
): PageEvidence {
  return makePage({ url, document: makeDocument({ alternates }), ...overrides });
}

describe('the family', () => {
  it('ships the eight hreflang-mechanism rules, in catalogue order', () => {
    expect(hreflangRules.map((rule) => rule.id)).toEqual([
      'core/hreflang-self-missing',
      'core/hreflang-not-reciprocal',
      'core/hreflang-duplicate',
      'core/hreflang-malformed',
      'core/hreflang-target-relative',
      'core/hreflang-x-default-missing',
      'core/hreflang-target-unresolvable',
      'core/hreflang-target-wrong-language',
    ]);
  });

  it('has exactly one hybrid — the rule the classifier may answer for', () => {
    const hybrids = hreflangRules.filter((rule) => rule.hybrid === true);
    expect(hybrids.map((rule) => rule.id)).toEqual(['core/hreflang-target-wrong-language']);
  });
});

describe('core/hreflang-self-missing', () => {
  const RULE = 'core/hreflang-self-missing';

  it('is declared-grounded, needing only static evidence', () => {
    const rule = hreflangRules.find((entry) => entry.id === RULE);
    expect(rule?.grounding).toBe('declared');
    expect(rule?.capabilities).toEqual(['static']);
  });

  it('is not applicable when the page declares no alternates', () => {
    expect(onPage(RULE, makePage()).verdict).toBe('not-applicable');
  });

  it('passes when one alternate references the page itself', () => {
    const page = pageAt('https://example.com.ua/uk/', [
      link('uk', 'https://example.com.ua/uk/'),
      link('ru', 'https://example.com.ua/ru/'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('warns when no alternate references the page itself', () => {
    const page = pageAt('https://example.com.ua/uk/', [link('ru', 'https://example.com.ua/ru/')]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.summary).toMatch(/missing from its own translation set/);
  });

  it('is not-applicable when the page carries neither a URL nor a build path', () => {
    const page: PageEvidence = {
      id: 'no-locator',
      reach: 'requested',
      rendered: false,
      document: makeDocument({ alternates: [link('ru', 'https://example.com/ru/')] }),
    };
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toBe('the page carries neither a URL nor a build path');
  });
});

describe('core/hreflang-not-reciprocal', () => {
  const RULE = 'core/hreflang-not-reciprocal';
  const uk = pageAt('https://example.com.ua/uk/', [link('ru', 'https://example.com.ua/ru/')], {
    id: 'uk',
  });

  it('needs the whole site, not a single page', () => {
    const rule = hreflangRules.find((entry) => entry.id === RULE);
    expect(rule?.capabilities).toEqual(['site']);
    expect(resultFor(RULE, networkEvidence([uk])).verdict).toBe('not-collected');
  });

  it('passes when both pages declare each other', () => {
    const ru = pageAt('https://example.com.ua/ru/', [link('uk', 'https://example.com.ua/uk/')], {
      id: 'ru',
    });
    expect(resultFor(RULE, networkEvidence([uk, ru])).verdict).toBe('pass');
  });

  it('fails when the target does not declare the source back', () => {
    const ru = pageAt('https://example.com.ua/ru/', [], { id: 'ru' });
    const result = resultFor(RULE, networkEvidence([uk, ru]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/does not declare one back/);
    expect(result.findings[0]?.scope).toBe('site');
  });

  it('skips a target absent from the collected set — unresolvable is a different rule’s job', () => {
    const other = pageAt('https://example.com.ua/fr/', [], { id: 'other' });
    expect(resultFor(RULE, networkEvidence([uk, other])).verdict).toBe('pass');
  });

  it('skips a page with neither a URL nor a build path, without crashing', () => {
    const noLocatorPage: PageEvidence = {
      id: 'no-locator',
      reach: 'requested',
      rendered: false,
      document: makeDocument({ alternates: [link('ru', 'https://example.com.ua/ru/')] }),
    };
    expect(resultFor(RULE, networkEvidence([noLocatorPage, uk])).verdict).toBe('pass');
  });

  it('treats a self-referencing alternate as trivially reciprocal', () => {
    const selfAndOther = pageAt(
      'https://example.com.ua/uk/',
      [link('uk', 'https://example.com.ua/uk/'), link('ru', 'https://example.com.ua/ru/')],
      { id: 'uk-self' },
    );
    const ru = pageAt('https://example.com.ua/ru/', [link('uk', 'https://example.com.ua/uk/')], {
      id: 'ru',
    });
    expect(resultFor(RULE, networkEvidence([selfAndOther, ru])).verdict).toBe('pass');
  });

  it('skips an alternate with an empty (unparseable) href without crashing', () => {
    const withEmpty = pageAt(
      'https://example.com.ua/uk/',
      [link('ru', 'https://example.com.ua/ru/'), link('fr', '')],
      { id: 'uk-empty' },
    );
    const ru = pageAt('https://example.com.ua/ru/', [link('uk', 'https://example.com.ua/uk/')], {
      id: 'ru',
    });
    expect(resultFor(RULE, networkEvidence([withEmpty, ru])).verdict).toBe('pass');
  });
});

describe('core/hreflang-duplicate', () => {
  const RULE = 'core/hreflang-duplicate';

  it('passes distinct codes with distinct targets', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk', 'https://example.com/uk/'),
      link('ru', 'https://example.com/ru/'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('passes the same code repeated at the same target', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk', 'https://example.com/uk/'),
      link('uk', 'https://example.com/uk/'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('fails the same code declared twice with different targets', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk', 'https://example.com/uk/'),
      link('uk', 'https://example.com/uk-alt/'),
    ]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/different targets/);
  });

  it('fails two different x-default targets', () => {
    const page = pageAt('https://example.com/', [
      link('x-default', 'https://example.com/en/'),
      link('x-default', 'https://example.com/uk/'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('fail');
  });

  it('does not flag two entries with unparseable (empty) targets as conflicting duplicates', () => {
    const page = pageAt('https://example.com/uk/', [link('uk', ''), link('uk', '')]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('cites each declaring node when the duplicated entries carry node paths', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk', 'https://example.com/uk/', { nodePath: 'head > link.a' }),
      link('uk', 'https://example.com/uk-alt/', { nodePath: 'head > link.b' }),
    ]);
    const result = onPage(RULE, page);
    expect(result.findings[0]?.evidence).toContainEqual({
      kind: 'node',
      pageId: page.id,
      nodePath: 'head > link.a',
    });
    expect(result.findings[0]?.evidence).toContainEqual({
      kind: 'node',
      pageId: page.id,
      nodePath: 'head > link.b',
    });
  });
});

describe('core/hreflang-malformed', () => {
  const RULE = 'core/hreflang-malformed';

  it('passes well-formed tags and x-default', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk-UA', 'https://example.com/uk/'),
      link('x-default', 'https://example.com/'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('fails a value that is neither a BCP-47 tag nor x-default', () => {
    const page = pageAt('https://example.com/uk/', [link('uk_UA', 'https://example.com/uk/')]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/not a well-formed BCP-47/);
  });

  it('cites the declaring node when the malformed alternate carries a node path', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk_UA', 'https://example.com/uk/', { nodePath: 'head > link.bad' }),
    ]);
    const result = onPage(RULE, page);
    expect(result.findings[0]?.subject.node).toBe('head > link.bad');
    expect(result.findings[0]?.evidence).toContainEqual({
      kind: 'node',
      pageId: page.id,
      nodePath: 'head > link.bad',
    });
  });
});

describe('core/hreflang-target-relative', () => {
  const RULE = 'core/hreflang-target-relative';

  it('passes an absolute target', () => {
    const page = pageAt('https://example.com/uk/', [link('uk', 'https://example.com/uk/')]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('warns a relative target', () => {
    const page = pageAt('https://example.com/uk/', [link('uk', '/uk/')]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.summary).toMatch(/not an absolute URL/);
  });
});

describe('core/hreflang-x-default-missing', () => {
  const RULE = 'core/hreflang-x-default-missing';

  it('is not applicable with fewer than two declared languages', () => {
    const page = pageAt('https://example.com/uk/', [link('uk', 'https://example.com/uk/')]);
    expect(onPage(RULE, page).verdict).toBe('not-applicable');
  });

  it('warns a multi-language page with no x-default', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk', 'https://example.com/uk/'),
      link('ru', 'https://example.com/ru/'),
    ]);
    const result = onPage(RULE, page);
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.summary).toMatch(/no x-default fallback/);
  });

  it('passes once x-default is present', () => {
    const page = pageAt('https://example.com/uk/', [
      link('uk', 'https://example.com/uk/'),
      link('ru', 'https://example.com/ru/'),
      link('x-default', 'https://example.com/'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });
});

describe('core/hreflang-target-unresolvable', () => {
  const RULE = 'core/hreflang-target-unresolvable';
  // `traversal` on network evidence needs *some* page reached by following a
  // declared target; this anchor establishes the capability without being
  // the target under test in any single case.
  const ANCHOR = makePage({
    id: 'anchor',
    url: 'https://example.com/anchor/',
    reach: 'declared-target',
  });

  it('needs traversal — folded from the catalogue’s static|traversal', () => {
    const rule = hreflangRules.find((entry) => entry.id === RULE);
    expect(rule?.capabilities).toEqual(['traversal']);
  });

  it('passes when every declared target is in the collected set', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const ru = pageAt('https://example.com/ru/', [], { id: 'ru' });
    expect(resultFor(RULE, networkEvidence([uk, ru, ANCHOR])).verdict).toBe('pass');
  });

  it('fails a target absent from the collected page set', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/absent from the collected page set/);
  });

  it('cites the matching probe when one 404s', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const probe = makeProbe({ id: 'probe-404', url: 'https://example.com/ru/', status: 404 });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR], [probe]));
    expect(result.findings[0]?.summary).toMatch(/404/);
    expect(result.findings[0]?.evidence).toContainEqual({ kind: 'probe', probeId: 'probe-404' });
  });

  it('resolves targets on a filesystem build with no fetch involved', () => {
    const uk = makeBuildPage({
      id: 'uk',
      path: 'uk/index.html',
      document: makeDocument({ alternates: [link('ru', 'ru/index.html')] }),
    });
    const ru = makeBuildPage({ id: 'ru', path: 'ru/index.html' });
    expect(resultFor(RULE, filesystemEvidence([uk, ru])).verdict).toBe('pass');
  });

  it('reports an alternate with an empty href as unresolvable, citing no probe', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', '')], { id: 'uk' });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/absent from the collected page set/);
    expect(result.findings[0]?.evidence).not.toContainEqual(
      expect.objectContaining({ kind: 'probe' }),
    );
  });

  it('does not flag a self-referencing alternate as unresolvable', () => {
    const uk = pageAt(
      'https://example.com/uk/',
      [link('uk', 'https://example.com/uk/'), link('ru', 'https://example.com/ru/')],
      { id: 'uk' },
    );
    const ru = pageAt('https://example.com/ru/', [], { id: 'ru' });
    expect(resultFor(RULE, networkEvidence([uk, ru, ANCHOR])).verdict).toBe('pass');
  });
});

describe('core/hreflang-target-wrong-language', () => {
  const RULE = 'core/hreflang-target-wrong-language';
  const ANCHOR = makePage({
    id: 'anchor',
    url: 'https://example.com/anchor/',
    reach: 'declared-target',
  });
  const source = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
    id: 'source',
  });
  // Real prose: the classifier fallback is only meaningful against text it
  // actually has an opinion about. Same strings already proven in
  // page-declaration.test.ts.
  const UK_TEXT =
    'Ми доставляємо замовлення по всій Україні протягом двох робочих днів, а оплата можлива карткою або готівкою при отриманні.';
  const RU_TEXT =
    'Мы доставляем заказы по всей стране в течение двух рабочих дней, оплата возможна картой или наличными при получении.';

  it('is the family’s one hybrid rule, needing traversal', () => {
    const rule = hreflangRules.find((entry) => entry.id === RULE);
    expect(rule?.hybrid).toBe(true);
    expect(rule?.capabilities).toEqual(['traversal']);
  });

  it('passes when the target’s own <html lang> agrees with the declaration', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    expect(resultFor(RULE, networkEvidence([source, target, ANCHOR])).verdict).toBe('pass');
  });

  it('fails outright on a declared mismatch — a real, undowngraded fail', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    expect(result.verdict).toBe('fail');
    const finding = result.findings[0];
    expect(finding?.via).toBeUndefined();
    expect(finding?.downgradedFrom).toBeUndefined();
    expect(finding?.summary).toMatch(/serves the wrong language/);
  });

  it('falls back to the classifier when <html lang> is absent, and the kernel downgrades the fail', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [{ nodePath: 'main > p', text: UK_TEXT, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.verdict).toBe('observation');
    expect(finding?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('passes when the classifier agrees with the declared language', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [{ nodePath: 'main > p', text: RU_TEXT, inheritedLang: null }],
      }),
    });
    expect(resultFor(RULE, networkEvidence([source, target, ANCHOR])).verdict).toBe('pass');
  });

  it('does not fire when the target is absent from the collected set', () => {
    expect(resultFor(RULE, networkEvidence([source, ANCHOR])).verdict).toBe('pass');
  });

  it('falls back to the classifier when the target’s <html lang> is blank, the same as absent', () => {
    const target = makePage({
      id: 'target-blank',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: '   ',
        textNodes: [{ nodePath: 'main > p', text: UK_TEXT, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('reports the majority classified language among several sampled nodes, not just any node that matched', () => {
    const target = makePage({
      id: 'target-majority',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [
          { nodePath: 'main > p.1', text: UK_TEXT, inheritedLang: null },
          { nodePath: 'main > p.2', text: UK_TEXT, inheritedLang: null },
          { nodePath: 'main > p.3', text: RU_TEXT, inheritedLang: null },
        ],
      }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.summary).toMatch(/classified uk/);
    expect(finding?.denominator).toEqual({ examined: 3, matched: 3 });
  });

  it('does not flag a target with no classifiable text and no <html lang>', () => {
    const target = makePage({
      id: 'target-empty',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [{ nodePath: 'main > p', text: 'Hi', inheritedLang: null }],
      }),
    });
    expect(resultFor(RULE, networkEvidence([source, target, ANCHOR])).verdict).toBe('pass');
  });

  it('reports no evidence when the declared language has no shipped classifier profile', () => {
    const deSource = pageAt(
      'https://example.com/de-src/',
      [link('de', 'https://example.com/de/')],
      {
        id: 'de-source',
      },
    );
    const target = makePage({
      id: 'target-de',
      url: 'https://example.com/de/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [
          {
            nodePath: 'main > p',
            text: 'Ein ausreichend langer Textabschnitt, der mehr als vierzig Zeichen enthält, damit er nicht zu kurz ist.',
            inheritedLang: null,
          },
        ],
      }),
    });
    expect(resultFor(RULE, networkEvidence([deSource, target, ANCHOR])).verdict).toBe('pass');
  });

  it('skips an x-default alternate — it names a fallback, not a language', () => {
    const withXDefault = pageAt(
      'https://example.com/uk/',
      [
        link('ru', 'https://example.com/ru/'),
        link('x-default', 'https://example.com/nonexistent-fallback/'),
      ],
      { id: 'source-xdefault' },
    );
    const target = makePage({
      id: 'target-ru2',
      url: 'https://example.com/ru/',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    expect(resultFor(RULE, networkEvidence([withXDefault, target, ANCHOR])).verdict).toBe('pass');
  });
});
