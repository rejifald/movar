import { describe, expect, it } from 'vitest';
import { detectCyrillicLanguage, isRussian } from './index';

describe('detectCyrillicLanguage', () => {
  it('detects Ukrainian via distinctive letters', () => {
    expect(detectCyrillicLanguage('Слава Україні, її мова').language).toBe('uk');
  });

  it('detects Russian via distinctive letters', () => {
    expect(detectCyrillicLanguage('Это русский язык, объём').language).toBe('ru');
  });

  it('returns unknown when no distinctive letters are present', () => {
    expect(detectCyrillicLanguage('hello world').language).toBe('unknown');
  });

  it('isRussian convenience helper works', () => {
    expect(isRussian('подъезд')).toBe(true);
    expect(isRussian('під’їзд')).toBe(false);
  });
});
