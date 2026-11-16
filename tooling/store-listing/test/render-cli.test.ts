import { describe, expect, it } from 'vitest';
import { assertCapturesPresent, parseCliOptions } from '../src/render/cli-options.js';

describe('parseCliOptions', () => {
  it('accepts a full, valid set', () => {
    expect(parseCliOptions({ captures: 'c', out: 'o', locale: 'en' })).toEqual({
      captures: 'c',
      out: 'o',
      locale: 'en',
      canvas: 'iphone',
    });
    expect(parseCliOptions({ captures: 'c', out: 'o', locale: 'uk', canvas: 'ipad' }).canvas).toBe(
      'ipad',
    );
    expect(() => parseCliOptions({ captures: 'c', out: 'o', locale: 'uk', canvas: 'tv' })).toThrow(
      /iphone or ipad/,
    );
  });
  it('asks for --captures and --out', () => {
    expect(() => parseCliOptions({ out: 'o', locale: 'uk' })).toThrow(/Usage/);
    expect(() => parseCliOptions({ captures: 'c', locale: 'uk' })).toThrow(/Usage/);
  });
  it('rejects an unknown locale', () => {
    expect(() => parseCliOptions({ captures: 'c', out: 'o', locale: 'ru' })).toThrow(/uk or en/);
  });
});

// A frame run that finds no capture used to print "skip" and exit 0, so a wrong
// --captures dir produced an empty, green listing.
describe('assertCapturesPresent', () => {
  const shots = [
    { capture: 'a.png', before: 'a-before.png' },
    { capture: 'b.png', before: 'b-before.png' },
  ];
  it('passes when every capture exists', () => {
    expect(() => assertCapturesPresent(shots, 'dir', () => true)).not.toThrow();
  });
  it('names every missing capture and the folder it looked in', () => {
    expect(() => assertCapturesPresent(shots, 'dir', (file) => file.includes('a'))).toThrow(
      /missing in dir: b\.png, b-before\.png/,
    );
  });
  it('requires the before capture too, not just the after one', () => {
    expect(() =>
      assertCapturesPresent(shots, 'dir', (file) => !file.endsWith('-before.png')),
    ).toThrow(/missing in dir: a-before\.png, b-before\.png/);
  });
});
