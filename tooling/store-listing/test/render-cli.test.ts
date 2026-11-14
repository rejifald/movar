import { describe, expect, it } from 'vitest';
import { parseCliOptions } from '../src/render/cli-options.js';

describe('parseCliOptions', () => {
  it('accepts a full, valid set', () => {
    expect(parseCliOptions({ captures: 'c', out: 'o', locale: 'en' })).toEqual({
      captures: 'c',
      out: 'o',
      locale: 'en',
    });
  });
  it('asks for --captures and --out', () => {
    expect(() => parseCliOptions({ out: 'o', locale: 'uk' })).toThrow(/Usage/);
    expect(() => parseCliOptions({ captures: 'c', locale: 'uk' })).toThrow(/Usage/);
  });
  it('rejects an unknown locale', () => {
    expect(() => parseCliOptions({ captures: 'c', out: 'o', locale: 'ru' })).toThrow(/uk or en/);
  });
});
