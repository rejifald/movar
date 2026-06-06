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

  it('treats an oracle margin exactly at the threshold as confident (>= not >)', () => {
    // minOracleMargin defaults to 0.1; a franc score-gap of exactly 0.1 must
    // count as confident, or the boundary silently abstains.
    expect(classifyDivergence(ukConfident, { language: 'uk', margin: 0.1 })).toBe('confirm');
    expect(classifyDivergence(ukConfident, { language: 'ru', margin: 0.1 })).toBe('contradict');
  });

  it('treats a classifier margin exactly at the threshold as confident (>= not >)', () => {
    // minClassifierMargin defaults to 1; a lead of exactly 1 must count.
    const v: SnippetVerdict = { language: 'uk', margin: 1, rung: 1 };
    expect(classifyDivergence(v, { language: 'uk', margin: 0.5 })).toBe('confirm');
    expect(classifyDivergence(v, { language: 'ru', margin: 0.5 })).toBe('contradict');
  });
});
