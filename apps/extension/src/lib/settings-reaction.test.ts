import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '@movar/lang-detect';
import { defaultSettings } from '@movar/settings';
import { reactToSettingsChange } from './settings-reaction';

// reactToSettingsChange only reads `.contentModification`; vary just that.
const cm = (contentModification: boolean) => ({ ...defaultSettings, contentModification });
const OFF = cm(false);
const ON = cm(true);

// Filtering-on settings with just `priority`/`blocked` varied, for the
// language-list describe block below.
const withPriority = (priority: LanguageCode[]) => ({ ...ON, priority });
const withBlocked = (blocked: LanguageCode[]) => ({ ...ON, blocked });

describe('reactToSettingsChange — filtering off', () => {
  it('tears down when filtering was just turned off', () => {
    expect(reactToSettingsChange(ON, OFF, false, false)).toEqual({
      userOverride: false,
      teardown: true,
      apply: false,
    });
  });

  it('does nothing when filtering was already off, even on a locale change', () => {
    // No curtains exist while filtering is off, so a locale switch has nothing
    // to rebuild here (new curtains, if filtering is later turned on, pick up
    // the locale the bootstrap/listener already re-pointed).
    expect(reactToSettingsChange(OFF, OFF, true, false)).toEqual({
      userOverride: false,
      teardown: false,
      apply: false,
    });
  });

  it('leaves userOverride untouched when turning off', () => {
    expect(reactToSettingsChange(ON, OFF, false, true).userOverride).toBe(true);
  });
});

describe('reactToSettingsChange — filtering on', () => {
  it('applies without a teardown when filtering just turned on', () => {
    expect(reactToSettingsChange(OFF, ON, false, false)).toEqual({
      userOverride: false,
      teardown: false,
      apply: true,
    });
  });

  it('clears a prior "Show everything" override when turning on', () => {
    expect(reactToSettingsChange(OFF, ON, false, true)).toEqual({
      userOverride: false,
      teardown: false,
      apply: true,
    });
  });

  it('rebuilds (teardown + apply) on a mid-session locale change', () => {
    expect(reactToSettingsChange(ON, ON, true, false)).toEqual({
      userOverride: false,
      teardown: true,
      apply: true,
    });
  });

  it('does nothing when nothing relevant changed', () => {
    expect(reactToSettingsChange(ON, ON, false, false)).toEqual({
      userOverride: false,
      teardown: false,
      apply: false,
    });
  });

  it('skips the rebuild while "Show everything" is active (nothing concealed)', () => {
    expect(reactToSettingsChange(ON, ON, true, true)).toEqual({
      userOverride: true,
      teardown: false,
      apply: false,
    });
  });
});

// #290: a priority/blocked edit must rebuild an already-open tab, not just
// future evaluations — both the picker filter and the content-card filter
// only ever *add* concealment on a pass (a card already marked "checked" or
// a picker link already hidden is skipped forever), so without a teardown
// here the next applyOnce is a no-op on a settled page.
describe('reactToSettingsChange — priority/blocked changes', () => {
  it('rebuilds (teardown + apply) when priority is reordered', () => {
    // Same set, different order — priority order picks the winning language
    // in the switch ladder, so a reorder must still count as a change.
    const previous = withPriority(['uk', 'en']);
    const next = withPriority(['en', 'uk']);
    expect(reactToSettingsChange(previous, next, false, false)).toEqual({
      userOverride: false,
      teardown: true,
      apply: true,
    });
  });

  it('rebuilds (teardown + apply) when a language is added to blocked', () => {
    const previous = withBlocked(['ru']);
    const next = withBlocked(['ru', 'en']);
    expect(reactToSettingsChange(previous, next, false, false)).toEqual({
      userOverride: false,
      teardown: true,
      apply: true,
    });
  });

  it('rebuilds (teardown + apply) when a language is removed from blocked', () => {
    const previous = withBlocked(['ru', 'en']);
    const next = withBlocked(['ru']);
    expect(reactToSettingsChange(previous, next, false, false)).toEqual({
      userOverride: false,
      teardown: true,
      apply: true,
    });
  });

  it('does not rebuild when priority/blocked are value-equal across distinct array instances', () => {
    const previous = withPriority(['uk', 'en']);
    const next = {
      ...previous,
      priority: ['uk', 'en'] as LanguageCode[],
      blocked: [...previous.blocked],
    };
    expect(reactToSettingsChange(previous, next, false, false)).toEqual({
      userOverride: false,
      teardown: false,
      apply: false,
    });
  });

  it('skips the rebuild while "Show everything" is active, even on a blocked-list change', () => {
    const previous = withBlocked(['ru']);
    const next = withBlocked(['ru', 'en']);
    expect(reactToSettingsChange(previous, next, false, true)).toEqual({
      userOverride: true,
      teardown: false,
      apply: false,
    });
  });
});
