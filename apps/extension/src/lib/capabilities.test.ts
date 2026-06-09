import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import { needsChunks, resolveNeeds } from './capabilities';

describe('resolveNeeds', () => {
  it('loads no deferred chunks when content modification is off', () => {
    const needs = resolveNeeds('www.youtube.com', defaultSettings, 'en-US');
    expect(needs).toEqual({ conceal: null, model: null, presenter: null, locale: 'en' });
    expect(needsChunks(needs)).toEqual([]);
  });

  it('loads conceal and the matching model in hide mode, without presenter UI', () => {
    const needs = resolveNeeds(
      'www.youtube.com',
      { ...defaultSettings, contentModification: true, concealMode: 'hide' },
      'en-US',
    );
    expect(needs).toEqual({
      conceal: 'features/conceal.js',
      model: 'models/youtube.js',
      presenter: null,
      locale: 'en',
    });
    expect(needsChunks(needs)).toEqual(['features/conceal.js', 'models/youtube.js']);
  });

  it('loads presenter UI in curtain mode for any matched model host', () => {
    expect(
      resolveNeeds(
        'www.google.com.ua',
        { ...defaultSettings, contentModification: true, concealMode: 'curtain' },
        'uk-UA',
      ),
    ).toEqual({
      conceal: 'features/conceal.js',
      model: 'models/google.js',
      presenter: 'features/curtain-ui.js',
      locale: 'uk',
    });
  });

  it('still loads conceal for picker filtering on hosts with no content model', () => {
    const needs = resolveNeeds(
      'example.com',
      { ...defaultSettings, contentModification: true, concealMode: 'hide' },
      'en-US',
    );
    expect(needs).toEqual({
      conceal: 'features/conceal.js',
      model: null,
      presenter: null,
      locale: 'en',
    });
  });
});
