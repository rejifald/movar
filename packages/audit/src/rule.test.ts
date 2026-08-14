import { describe, expect, it } from 'vitest';
import type { Citation, GroundedFindingDraft } from './finding';
import type { CoreRule, PackRule, Rule } from './rule';
import { findings, notApplicable, pass, ruleCitation } from './rule';

const CITATION: Citation = {
  source: 'Law 2704-VIII',
  article: 'Art. 27 §6',
  url: 'https://zakon.rada.gov.ua/laws/show/2704-19',
};

const DRAFT: GroundedFindingDraft = {
  grounding: 'declared',
  verdict: 'fail',
  subject: {},
  evidence: [],
  summary: 'a draft',
};

const CORE: CoreRule<'page'> = {
  id: 'core/example',
  title: 'an example core rule',
  capabilities: ['static'],
  grounding: 'declared',
  scope: 'page',
  run: () => pass(),
};

const PACK: PackRule<'page'> = { ...CORE, id: 'ua/example', citation: CITATION };

describe('outcome helpers', () => {
  it('builds a pass', () => {
    expect(pass()).toEqual({ status: 'pass' });
  });

  it('builds a not-applicable with its rendered reason', () => {
    expect(notApplicable('no picker on the page')).toEqual({
      status: 'not-applicable',
      reason: 'no picker on the page',
    });
  });

  it('builds a findings outcome from one or more drafts', () => {
    expect(findings(DRAFT, DRAFT)).toEqual({ status: 'findings', findings: [DRAFT, DRAFT] });
  });
});

describe('ruleCitation', () => {
  it('returns a pack rule’s citation', () => {
    expect(ruleCitation(PACK)).toEqual(CITATION);
  });

  it('returns null for a core rule', () => {
    expect(ruleCitation(CORE)).toBeNull();
  });
});

describe('the rule type', () => {
  it('rejects a jurisdiction-pack rule that declares no citation', () => {
    // The union has no member a non-`core/` id can satisfy without a citation:
    // `CoreRule` constrains the id, `PackRule` demands the citation.
    // @ts-expect-error -- a pack rule must carry a citation
    const uncited: Rule = { ...CORE, id: 'ua/state-language-absent' };
    expect(uncited.id).toBe('ua/state-language-absent');
  });

  it('accepts a core rule with no citation', () => {
    const cited: Rule = CORE;
    expect(ruleCitation(cited)).toBeNull();
  });
});
