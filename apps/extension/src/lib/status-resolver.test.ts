import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

import type { HiddenSummary } from './messaging';
import { resolveActionIconState } from './status-resolver';

function makeSettings(over: Partial<MovarSettings> = {}): MovarSettings {
  return { ...defaultSettings, ...over };
}

function makeHidden(over: Partial<HiddenSummary> = {}): HiddenSummary {
  return {
    languages: [],
    containers: 0,
    feedCurtained: 0,
    feedHidden: 0,
    pageLang: null,
    userOverride: false,
    switchSuppressed: false,
    ...over,
  };
}

const PAGE = 'https://example.com/article';

describe('resolveActionIconState — the 6 toolbar postures', () => {
  it('off when globally disabled, outranking every per-tab signal', () => {
    // enabled:false wins even with a concealing, snoozed, allowlisted tab.
    expect(
      resolveActionIconState(
        makeSettings({ enabled: false, allowlist: ['example.com'] }),
        false,
        makeHidden({ feedHidden: 3 }),
        PAGE,
        123,
      ),
    ).toBe('off');
  });

  it('paused when globally paused, outranking exempt/blocking', () => {
    expect(
      resolveActionIconState(
        makeSettings({ allowlist: ['example.com'] }),
        true,
        makeHidden({ feedCurtained: 2 }),
        PAGE,
        null,
      ),
    ).toBe('paused');
  });

  it('exempt when the active host is on the allowlist', () => {
    expect(
      resolveActionIconState(
        makeSettings({ allowlist: ['example.com'] }),
        false,
        makeHidden(),
        PAGE,
        null,
      ),
    ).toBe('exempt');
  });

  it('paused when the active host is snoozed', () => {
    expect(
      resolveActionIconState(makeSettings(), false, makeHidden(), PAGE, Date.now() + 1000),
    ).toBe('paused');
  });

  it('attention when an http tab has no content script answer (hidden=null)', () => {
    expect(resolveActionIconState(makeSettings(), false, null, PAGE, null)).toBe('attention');
  });

  it('blocking when the content script is actively concealing', () => {
    expect(
      resolveActionIconState(makeSettings(), false, makeHidden({ languages: ['ru'] }), PAGE, null),
    ).toBe('blocking');
  });

  it('active on a clean page — content script ran, nothing hidden', () => {
    expect(resolveActionIconState(makeSettings(), false, makeHidden(), PAGE, null)).toBe('active');
  });

  it('active on a served preferred-language page', () => {
    expect(
      resolveActionIconState(
        makeSettings({ priority: ['uk', 'en'] }),
        false,
        makeHidden({ pageLang: 'uk' }),
        PAGE,
        null,
      ),
    ).toBe('active');
  });

  it('active on a blocked-language page with nothing concealed (icon collapses served/clean/blocked)', () => {
    expect(
      resolveActionIconState(
        makeSettings({ blocked: ['ru'] }),
        false,
        makeHidden({ pageLang: 'ru' }),
        PAGE,
        null,
      ),
    ).toBe('active');
  });

  it('active on a non-web tab (url null) while enabled', () => {
    expect(resolveActionIconState(makeSettings(), false, null, null, null)).toBe('active');
  });
});
