import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { CapabilityResolveSettings } from './capabilities';
import {
  CONCEAL_FEATURE_CHUNK,
  CURTAIN_UI_FEATURE_CHUNK,
  lookupPageContentModelDescriptor,
  resolveNeeds,
} from './capabilities';

function settings(overrides: Partial<CapabilityResolveSettings> = {}): CapabilityResolveSettings {
  return { ...defaultSettings, contentModification: true, ...overrides };
}

describe('lookupPageContentModelDescriptor', () => {
  it('matches Google hosts across ccTLDs', () => {
    expect(lookupPageContentModelDescriptor('www.google.com.ua')?.chunk).toBe('models/google.js');
    expect(lookupPageContentModelDescriptor('google.co.uk')?.chunk).toBe('models/google.js');
  });

  it('matches YouTube hosts', () => {
    expect(lookupPageContentModelDescriptor('youtube.com')?.chunk).toBe('models/youtube.js');
    expect(lookupPageContentModelDescriptor('m.youtube.com')?.chunk).toBe('models/youtube.js');
  });

  it('returns undefined for hosts without a page-content model', () => {
    expect(lookupPageContentModelDescriptor('example.com')).toBeUndefined();
  });

  it('normalizes case and a trailing dot before matching', () => {
    expect(lookupPageContentModelDescriptor('WWW.YOUTUBE.COM.')?.id).toBe('youtube');
  });
});

describe('resolveNeeds', () => {
  it('returns no deferred capabilities when content modification is off', () => {
    expect(
      resolveNeeds(
        'www.google.com',
        settings({ contentModification: false, concealMode: 'curtain', uiLanguage: 'uk' }),
        'uk-UA',
      ),
    ).toEqual({});
  });

  it('loads the structural feature and host model in hide mode without presenter bytes', () => {
    expect(resolveNeeds('www.youtube.com', settings({ concealMode: 'hide' }), 'uk-UA')).toEqual({
      conceal: CONCEAL_FEATURE_CHUNK,
      model: 'models/youtube.js',
    });
  });

  it('keeps the structural feature for picker filtering even when no model matches', () => {
    expect(resolveNeeds('example.com', settings({ concealMode: 'hide' }), 'uk-UA')).toEqual({
      conceal: CONCEAL_FEATURE_CHUNK,
    });
  });

  it('loads the presenter in curtain mode for any matched model site', () => {
    expect(resolveNeeds('www.google.com', settings({ concealMode: 'curtain' }), 'en-US')).toEqual({
      conceal: CONCEAL_FEATURE_CHUNK,
      model: 'models/google.js',
      presenter: CURTAIN_UI_FEATURE_CHUNK,
    });
  });

  it('requests non-English strings only when the presenter is active', () => {
    expect(
      resolveNeeds('youtube.com', settings({ concealMode: 'curtain', uiLanguage: 'uk' })),
    ).toEqual({
      conceal: CONCEAL_FEATURE_CHUNK,
      model: 'models/youtube.js',
      presenter: CURTAIN_UI_FEATURE_CHUNK,
      locale: 'uk',
    });

    expect(
      resolveNeeds('youtube.com', settings({ concealMode: 'hide', uiLanguage: 'uk' })),
    ).toEqual({
      conceal: CONCEAL_FEATURE_CHUNK,
      model: 'models/youtube.js',
    });
  });

  it('resolves auto locale from the browser UI language', () => {
    expect(
      resolveNeeds('youtube.com', settings({ concealMode: 'curtain' }), 'uk-UA'),
    ).toMatchObject({
      locale: 'uk',
    });
    expect(
      resolveNeeds('youtube.com', settings({ concealMode: 'curtain' }), 'de-DE'),
    ).not.toHaveProperty('locale');
  });

  it('defaults to the legacy curtain presenter until concealMode exists in settings', () => {
    expect(resolveNeeds('youtube.com', settings(), 'en-US')).toEqual({
      conceal: CONCEAL_FEATURE_CHUNK,
      model: 'models/youtube.js',
      presenter: CURTAIN_UI_FEATURE_CHUNK,
    });
  });
});
