import { describe, expect, it } from 'vitest';
import type { PageEvidence } from '../evidence';
import type { RuleResult } from '../report';
import { hreflangRules } from './inventory-hreflang';
import { filesystemEvidence, makeDocument, makePage, networkEvidence } from '../../test/fixtures';
import { resultFor, link, pageAt, buildPageAt } from './inventory-hreflang.test-utils';

function onPage(ruleId: string, page: PageEvidence): RuleResult {
  return resultFor(ruleId, networkEvidence([page]));
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

  it('recognises a self-reference written relative to the declaring page', () => {
    const page = pageAt('https://example.com/docs/en/guide.html', [
      link('en', 'guide.html'),
      link('uk', '../uk/guide.html'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('recognises a bare "./" self-reference on a directory URL', () => {
    const page = pageAt('https://example.com.ua/uk/', [link('uk', './'), link('ru', '../ru/')]);
    expect(onPage(RULE, page).verdict).toBe('pass');
  });

  it('recognises the same "./" self-reference on a build page', () => {
    // `/uk/index.html` is the page at `/uk/`, so `./` names it. Off disk the
    // base was `undefined` and `./` parsed to the literal `/.`, warning that a
    // page declaring itself was missing from its own translation set.
    const page = buildPageAt('uk/index.html', [link('uk', './'), link('ru', '../ru/')], 'uk');
    expect(resultFor(RULE, filesystemEvidence([page])).verdict).toBe('pass');
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

  it('follows a relative alternate to its target, so a missing reciprocal is still caught', () => {
    const en = pageAt('https://example.com/docs/en/guide.html', [link('uk', '../uk/guide.html')], {
      id: 'en',
    });
    const target = pageAt('https://example.com/docs/uk/guide.html', [], { id: 'uk-doc' });
    const result = resultFor(RULE, networkEvidence([en, target]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/does not declare one back/);
  });

  it('counts a reciprocal the target declares relative to itself', () => {
    const en = pageAt(
      'https://example.com/docs/en/guide.html',
      [link('uk', 'https://example.com/docs/uk/guide.html')],
      { id: 'en' },
    );
    const target = pageAt(
      'https://example.com/docs/uk/guide.html',
      [link('en', '../en/guide.html')],
      { id: 'uk-doc' },
    );
    expect(resultFor(RULE, networkEvidence([en, target])).verdict).toBe('pass');
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

  it('does not call a relative and an absolute href naming one page a duplicate', () => {
    const page = pageAt('https://example.com/docs/en/guide.html', [
      link('uk', '../uk/guide.html'),
      link('uk', 'https://example.com/docs/uk/guide.html'),
    ]);
    expect(onPage(RULE, page).verdict).toBe('pass');
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
