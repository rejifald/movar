import { describe, expect, it } from 'vitest';
import type {
  Citation,
  ClassifiedFindingDraft,
  Denominator,
  FindingSubject,
  GroundedFindingDraft,
} from './finding';
import { gradeFinding, RuleContractError } from './grading';
import type { CoreRule, PackRule, Rule } from './rule';
import { pass } from './rule';

const SUBJECT: FindingSubject = { url: 'https://example.com.ua/uk/' };
const DENOMINATOR: Denominator = { examined: 340, matched: 3 };

const CITATION: Citation = {
  source: 'Law 2704-VIII, On ensuring the functioning of Ukrainian as the state language',
  article: 'Art. 27 §6',
  url: 'https://zakon.rada.gov.ua/laws/show/2704-19',
};

function coreRule(overrides: Partial<CoreRule<'page'>> = {}): CoreRule<'page'> {
  return {
    id: 'core/test-rule',
    title: 'a test rule',
    capabilities: ['static'],
    grounding: 'declared',
    scope: 'page',
    run: () => pass(),
    ...overrides,
  };
}

function packRule(overrides: Partial<PackRule<'page'>> = {}): PackRule<'page'> {
  return {
    id: 'ua/test-rule',
    title: 'a test pack rule',
    capabilities: ['static'],
    grounding: 'declared',
    scope: 'page',
    citation: CITATION,
    run: () => pass(),
    ...overrides,
  };
}

function declaredDraft(overrides: Partial<GroundedFindingDraft> = {}): GroundedFindingDraft {
  return {
    grounding: 'declared',
    verdict: 'fail',
    subject: SUBJECT,
    evidence: [],
    summary: 'the site contradicts its own markup',
    ...overrides,
  };
}

/** Run `call` and hand back whatever it threw, so assertions stay unconditional. */
function capture(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return null;
}

function classifiedDraft(): ClassifiedFindingDraft {
  return {
    grounding: 'classified',
    verdict: 'observation',
    subject: SUBJECT,
    evidence: [],
    summary: '3 of 340 text nodes classified ru',
    denominator: DENOMINATOR,
  };
}

describe('gradeFinding', () => {
  it('stamps the rule id and the rule scope onto the finding', () => {
    const graded = gradeFinding(coreRule(), declaredDraft());
    expect(graded.rule).toBe('core/test-rule');
    expect(graded.scope).toBe('page');
    expect(graded.verdict).toBe('fail');
  });

  it('lets a declared finding keep its failing power', () => {
    expect(gradeFinding(coreRule(), declaredDraft()).downgradedFrom).toBeUndefined();
  });

  describe('the classified downgrade', () => {
    it('strips failing power from a hybrid finding the classifier answered', () => {
      const graded = gradeFinding(
        coreRule({ hybrid: true }),
        declaredDraft({ via: 'classified', denominator: DENOMINATOR }),
      );
      expect(graded.verdict).toBe('observation');
      expect(graded.downgradedFrom).toBe('fail');
      expect(graded.via).toBe('classified');
    });

    it('leaves a hybrid finding the site declared alone', () => {
      const graded = gradeFinding(coreRule({ hybrid: true }), declaredDraft({ via: 'declared' }));
      expect(graded.verdict).toBe('fail');
      expect(graded.downgradedFrom).toBeUndefined();
    });

    it('leaves a non-failing classified verdict alone', () => {
      const rule = coreRule({ grounding: 'classified' });
      expect(gradeFinding(rule, classifiedDraft()).verdict).toBe('observation');
    });

    it('cannot even be written as a failing classified draft', () => {
      const draft: ClassifiedFindingDraft = {
        ...classifiedDraft(),
        // @ts-expect-error -- the grading law is a type here: `classified` can never be `fail`
        verdict: 'fail',
      };
      expect(draft.grounding).toBe('classified');
    });
  });

  describe('the denominator requirement', () => {
    it('rejects a hybrid classified finding with no denominator', () => {
      const rule = coreRule({ hybrid: true });
      expect(() => gradeFinding(rule, declaredDraft({ via: 'classified' }))).toThrow(
        RuleContractError,
      );
      expect(() => gradeFinding(rule, declaredDraft({ via: 'classified' }))).toThrow(/denominator/);
    });

    it('carries the denominator through to the finding', () => {
      const graded = gradeFinding(
        coreRule({ hybrid: true }),
        declaredDraft({ via: 'classified', denominator: DENOMINATOR }),
      );
      expect(graded.denominator).toEqual(DENOMINATOR);
    });
  });

  describe('the citation requirement', () => {
    it('stamps a pack rule citation onto every finding it emits', () => {
      expect(gradeFinding(packRule(), declaredDraft()).citation).toEqual(CITATION);
    });

    it('leaves a core finding uncited', () => {
      expect(gradeFinding(coreRule(), declaredDraft()).citation).toBeUndefined();
    });

    it('rejects a pack rule that reached the kernel with no citation', () => {
      // Unreachable through the types — `PackRule` requires `citation` and
      // `CoreRule` only accepts `core/…` ids — so this is the runtime backstop
      // for a cast, a JS caller, or a hand-built rule object.
      const uncited = { ...coreRule(), id: 'ua/state-language-absent' } as unknown as Rule;
      expect(() => gradeFinding(uncited, declaredDraft())).toThrow(/citation/);
    });
  });

  describe('contract violations', () => {
    it('rejects a finding whose grounding contradicts its rule', () => {
      expect(() => gradeFinding(coreRule(), classifiedDraft())).toThrow(RuleContractError);
    });

    it('rejects via on a rule that is not declared hybrid', () => {
      expect(() => gradeFinding(coreRule(), declaredDraft({ via: 'classified' }))).toThrow(
        /not declared hybrid/,
      );
    });

    it('names the offending rule on the error', () => {
      const thrown = capture(() => gradeFinding(coreRule(), declaredDraft({ via: 'declared' })));
      expect(thrown).toBeInstanceOf(RuleContractError);
      expect((thrown as RuleContractError).rule).toBe('core/test-rule');
    });
  });
});
