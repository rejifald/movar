import { describe, expect, it } from 'vitest';

import { getStudioBandData, parseStudioBandData } from './studio-band';

/**
 * The studio band's data contract. `getStudioBandData` already ran both
 * committed files through `parseStudioBandData` at module load — this file
 * exists to pin what "valid" and "malformed" mean, so the shape can't drift
 * without a test noticing, and so `astro build` failing on a bad file
 * (`StudioBand.astro`'s whole reason for validating at all) has a red test to
 * point at instead of only a build log.
 */

const VALID = {
  version: 1,
  project: 'movar',
  lang: 'en',
  title: 'Other projects by the studio',
  studio: { name: 'Oleks Crane', href: 'https://olekscrane.com/work/movar' },
  all: { label: 'All projects', href: 'https://olekscrane.com/work' },
  related: [
    {
      name: 'Langtell',
      tagline: 'Tell me the language.',
      href: 'https://olekscrane.com/work/langtell',
    },
  ],
  ask: null,
};

describe('getStudioBandData', () => {
  it('returns movar’s committed en data, with no ask', () => {
    const data = getStudioBandData('en');
    expect(data.project).toBe('movar');
    expect(data.lang).toBe('en');
    expect(data.studio).toEqual({ name: 'Oleks Crane', href: 'https://olekscrane.com/work/movar' });
    expect(data.related).toHaveLength(1);
    expect(data.related[0]?.name).toBe('Langtell');
    expect(data.ask).toBeNull();
  });

  it('returns movar’s committed uk data, in Ukrainian, with no ask', () => {
    const data = getStudioBandData('uk');
    expect(data.lang).toBe('uk');
    expect(data.title).toBe('Інші проєкти студії');
    expect(data.all.label).toBe('Усі проєкти');
    expect(data.related[0]?.tagline).toBe(
      'Визначає мову коротких текстів і показує, чому саме так.',
    );
    expect(data.ask).toBeNull();
  });
});

describe('parseStudioBandData', () => {
  it('accepts the valid shape unchanged', () => {
    expect(parseStudioBandData(VALID)).toEqual(VALID);
  });

  it('accepts an ask object in place of null', () => {
    const withAsk = {
      ...VALID,
      ask: {
        heading: 'Have something to build?',
        body: 'Tell me what you’re working on.',
        label: 'Discuss a project',
        href: 'https://olekscrane.com/contact',
      },
    };
    expect(parseStudioBandData(withAsk)).toEqual(withAsk);
  });

  it('accepts an empty related list', () => {
    expect(parseStudioBandData({ ...VALID, related: [] })).toMatchObject({ related: [] });
  });

  it('rejects a version other than 1', () => {
    expect(() => parseStudioBandData({ ...VALID, version: 2 })).toThrow();
  });

  it('rejects a lang outside en/uk', () => {
    expect(() => parseStudioBandData({ ...VALID, lang: 'ru' })).toThrow();
  });

  it('rejects a related item missing its tagline', () => {
    const malformed = {
      ...VALID,
      related: [{ name: 'Langtell', href: 'https://olekscrane.com/work/langtell' }],
    };
    expect(() => parseStudioBandData(malformed)).toThrow();
  });

  it('rejects a non-URL href', () => {
    expect(() =>
      parseStudioBandData({ ...VALID, all: { label: 'All projects', href: 'not-a-url' } }),
    ).toThrow();
  });

  it('rejects a studio name other than "Oleks Crane"', () => {
    const malformed = { ...VALID, studio: { name: 'Someone Else', href: VALID.studio.href } };
    expect(() => parseStudioBandData(malformed)).toThrow();
  });

  it('rejects an empty or missing file', () => {
    expect(() => parseStudioBandData({})).toThrow();
    expect(() => parseStudioBandData(null)).toThrow();
  });
});
