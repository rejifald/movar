import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import { needsChunks, resolveNeeds } from './capabilities';

describe('resolveNeeds', () => {
  it('loads no deferred chunks when content modification is off', () => {
    const needs = resolveNeeds('www.youtube.com', defaultSettings);
    expect(needs).toEqual({ conceal: null, model: null, presenter: null });
    expect(needsChunks(needs)).toEqual([]);
  });

  it('loads conceal and the matching model in hide mode, without presenter UI', () => {
    const needs = resolveNeeds('www.youtube.com', {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide',
    });
    expect(needs).toEqual({
      conceal: 'features/conceal.js',
      model: 'models/youtube.js',
      presenter: null,
    });
    expect(needsChunks(needs)).toEqual(['features/conceal.js', 'models/youtube.js']);
  });

  it('loads presenter UI in curtain mode for any matched model host', () => {
    expect(
      resolveNeeds('www.google.com.ua', {
        ...defaultSettings,
        contentModification: true,
        concealMode: 'curtain',
      }),
    ).toEqual({
      conceal: 'features/conceal.js',
      model: 'models/google.js',
      presenter: 'features/curtain-ui.js',
    });
  });

  // Model scope ≠ redirect scope (#372): music.youtube.com is a real YouTube
  // host, but a frontend the extractor cannot parse — it gets conceal (picker
  // filtering still applies) yet must never provision the model chunk.
  it('provisions no model chunk on an unparseable sibling frontend', () => {
    const needs = resolveNeeds('music.youtube.com', {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide',
    });
    expect(needs).toEqual({
      conceal: 'features/conceal.js',
      model: null,
      presenter: null,
    });
  });

  it('still loads conceal for picker filtering on hosts with no content model', () => {
    const needs = resolveNeeds('example.com', {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide',
    });
    expect(needs).toEqual({
      conceal: 'features/conceal.js',
      model: null,
      presenter: null,
    });
  });
});
