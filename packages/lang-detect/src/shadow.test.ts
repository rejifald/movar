import { describe, expect, it } from 'vitest';
import type { SnippetVerdict } from './classify';
import { classifyDivergence } from './shadow';

const ukConfident: SnippetVerdict = { language: 'uk', margin: 2, rung: 1 };

describe('classifyDivergence', () => {
  it('abstains when the oracle abstained (null)', () => {
    expect(classifyDivergence(ukConfident, null)).toBe('abstain');
  });

  it('abstains when the oracle is below its margin (weak franc)', () => {
    expect(classifyDivergence(ukConfident, { language: 'ru', margin: 0.05 })).toBe('abstain');
  });

  it('abstains when the classifier is unknown', () => {
    const v: SnippetVerdict = { language: 'unknown', margin: 0, rung: null };
    expect(classifyDivergence(v, { language: 'ru', margin: 0.5 })).toBe('abstain');
  });

  it('abstains when the classifier is below its margin', () => {
    const v: SnippetVerdict = { language: 'uk', margin: 0, rung: '2b' };
    expect(classifyDivergence(v, { language: 'ru', margin: 0.5 })).toBe('abstain');
  });

  it('confirms when both are confident and agree', () => {
    expect(classifyDivergence(ukConfident, { language: 'uk', margin: 0.4 })).toBe('confirm');
  });

  it('contradicts only when both are confident and disagree', () => {
    expect(classifyDivergence(ukConfident, { language: 'ru', margin: 0.4 })).toBe('contradict');
  });

  it('respects custom thresholds', () => {
    expect(
      classifyDivergence(ukConfident, { language: 'ru', margin: 0.2 }, { minOracleMargin: 0.3 }),
    ).toBe('abstain');
  });
});
