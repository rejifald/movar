import { getProfiles } from '@movar/lang-detect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drainQueue, queueSnippet } from './diagnostics';

const cands = getProfiles(['uk', 'ru']);

beforeEach(() => {
  // Quiet the structured console output during tests.
  vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  drainQueue(cands, 'reset.example', 0); // flush any queue residue between tests
});

describe('diagnostics shadow oracle', () => {
  it('records a confident contradiction (classifier vs franc)', () => {
    // Distinctive-free Russian text, but we feed a (wrong) uk classifier verdict
    // — franc (the oracle) says ru → contradiction.
    queueSnippet('Собака медленно бежала домой по дороге', { language: 'uk', margin: 2, rung: 1 });
    const found = drainQueue(cands, 'example.com', 1000);
    expect(found).toHaveLength(1);
    expect(found[0]?.classifier.language).toBe('uk');
    expect(found[0]?.oracle.language).toBe('ru');
    expect(found[0]?.domain).toBe('example.com');
  });

  it('does not record when classifier and oracle agree', () => {
    queueSnippet('Собака медленно бежала домой по дороге', { language: 'ru', margin: 2, rung: 1 });
    expect(drainQueue(cands, 'example.com', 1)).toHaveLength(0);
  });

  it('ignores rung-3 and unknown verdicts (not decisions to verify)', () => {
    queueSnippet('Собака медленно бежала домой по дороге', {
      language: 'ru',
      margin: 0.5,
      rung: 3,
    });
    queueSnippet('whatever', { language: 'unknown', margin: 0, rung: null });
    expect(drainQueue(cands, 'example.com', 1)).toHaveLength(0);
  });

  it('abstains (no record) when franc cannot opine (too short)', () => {
    queueSnippet('кіт', { language: 'uk', margin: 1, rung: 1 });
    expect(drainQueue(cands, 'example.com', 1)).toHaveLength(0);
  });
});
