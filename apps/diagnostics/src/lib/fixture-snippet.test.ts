import { describe, expect, it } from 'vitest';
import { buildFixtureSnippet } from './fixture-snippet';
import type { DiagCard } from '../types';

const CARD: DiagCard = {
  id: 'n4',
  kind: 'result',
  language: 'uk',
  rung: '2a',
  margin: 1,
  blocked: false,
  francAgree: false,
  francLanguage: 'ru',
  sample: 'Последние новости часа: что произошло в мире',
};

describe('buildFixtureSnippet', () => {
  it('uses the franc cross-check as the expected truth when it opined', () => {
    const out = buildFixtureSnippet(CARD);
    expect(out).toContain("id: 'card-result-ru'");
    expect(out).toContain("expectedEngineLanguage: 'ru'");
    expect(out).toContain("expectedCyrillicHeuristic: 'ru'");
    expect(out).toContain('franc said ru');
    expect(out).toContain("scenarios: ['result', 'classifier-uk']");
  });

  it('falls back to the classifier language when franc abstained', () => {
    const out = buildFixtureSnippet({ ...CARD, francAgree: null, francLanguage: null });
    expect(out).toContain("id: 'card-result-uk'");
    expect(out).toContain("expectedEngineLanguage: 'uk'");
  });

  it('JSON-encodes the sample text so it is a valid string literal', () => {
    const out = buildFixtureSnippet({ ...CARD, sample: String.raw`has "quotes" and \ backslash` });
    expect(out).toContain(String.raw`text: "has \"quotes\" and \\ backslash"`);
  });
});
