import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@movar/settings';
import { reactToSettingsChange } from './settings-reaction';

// reactToSettingsChange only reads `.contentModification`; vary just that.
const cm = (contentModification: boolean) => ({ ...defaultSettings, contentModification });
const OFF = cm(false);
const ON = cm(true);

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
