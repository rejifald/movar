import { describe, expect, it } from 'vitest';
import { buildDeclaredClassifier, isFusedVerdict } from './declared';
import { getProfiles } from './profiles';

const roster = getProfiles(['uk', 'ru', 'en']);
const fuse = buildDeclaredClassifier(roster);

describe('buildDeclaredClassifier', () => {
  it('decides on the declaration alone when the text is empty', () => {
    expect(fuse('', 'ru').language).toBe('ru');
    expect(fuse('', 'uk').language).toBe('uk');
  });

  it('agrees when declaration and text point the same way', () => {
    expect(fuse('Реле напряжения — это устройство для защиты техники.', 'ru').language).toBe('ru');
  });

  it('lets a confident Ukrainian text read override a Russian declaration', () => {
    expect(
      fuse('Реле напруги — це надійний пристрій, що захищає техніку від стрибків.', 'ru').language,
    ).toBe('uk');
  });

  it('lets a confident Russian text read override a Ukrainian declaration', () => {
    expect(fuse('Реле напряжения — это очень мощное устройство для защиты.', 'uk').language).toBe(
      'ru',
    );
  });

  it('brands its result as a fused verdict with a positive confidence', () => {
    const verdict = fuse('', 'ru');
    expect(isFusedVerdict(verdict)).toBe(true);
    expect(verdict.confidence).toBeGreaterThan(0);
  });
});

describe('isFusedVerdict', () => {
  it('is false for a rung-margin SnippetVerdict', () => {
    expect(isFusedVerdict({ language: 'ru', margin: 1, rung: 1, discriminating: true })).toBe(
      false,
    );
  });

  it('is true for a fused verdict', () => {
    expect(isFusedVerdict({ language: 'ru', confidence: 0.8, fused: true })).toBe(true);
  });
});
