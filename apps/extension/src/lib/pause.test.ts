import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { HOUR_MS } from './time';
import {
  clearDisabledUntilUpdateHosts,
  disableHostUntilUpdate,
  enableHostNow,
  getDisabledUntilUpdateHosts,
  getPauseState,
  getSnoozedHosts,
  isHostDisabledUntilUpdate,
  isHostSnoozed,
  onPauseChange,
  onSnoozeChange,
  pauseFor,
  RESUME_ALARM,
  resume,
  snoozeHost,
  SNOOZE_ALARM,
  SNOOZE_DURATION_MS,
  sweepExpiredSnoozes,
  unsnoozeHost,
} from './pause';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getPauseState', () => {
  it('reports "not paused" when nothing is stored', async () => {
    expect(await getPauseState()).toEqual({ paused: false, until: null, indefinite: false });
  });
});

describe('pauseFor', () => {
  it('pauses indefinitely without scheduling an alarm', async () => {
    await pauseFor('indefinite');
    const state = await getPauseState();
    expect(state).toEqual({ paused: true, until: null, indefinite: true });
    expect(await fakeBrowser.alarms.get(RESUME_ALARM)).toBeFalsy();
  });

  it('pauses for an hour and schedules the resume alarm', async () => {
    await pauseFor('1h');
    const state = await getPauseState();
    expect(state.paused).toBe(true);
    expect(state.indefinite).toBe(false);
    expect(state.until).toBe(NOW + HOUR_MS);
    const alarm = await fakeBrowser.alarms.get(RESUME_ALARM);
    expect(alarm?.scheduledTime).toBe(NOW + HOUR_MS);
  });

  it('reports "not paused" once a timed pause has elapsed', async () => {
    await pauseFor('1h');
    vi.setSystemTime(NOW + HOUR_MS + 1);
    const state = await getPauseState();
    expect(state.paused).toBe(false);
    expect(state.until).toBeNull();
  });
});

describe('resume', () => {
  it('clears both the stored pause and the alarm', async () => {
    await pauseFor('1h');
    await resume();
    expect(await getPauseState()).toEqual({ paused: false, until: null, indefinite: false });
    expect(await fakeBrowser.alarms.get(RESUME_ALARM)).toBeFalsy();
  });

  it('clears an indefinite pause', async () => {
    await pauseFor('indefinite');
    await resume();
    expect((await getPauseState()).paused).toBe(false);
  });
});

describe('onPauseChange', () => {
  it('fires with the fresh state when a local pause key changes', async () => {
    await pauseFor('indefinite');
    const handler = vi.fn();
    onPauseChange(handler);
    void fakeBrowser.storage.onChanged.trigger(
      { 'movar:pausedIndefinitely': { newValue: true } },
      'local',
    );
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });
    expect(handler.mock.calls[0]![0]).toMatchObject({ paused: true, indefinite: true });
  });

  it('ignores changes outside the local area', () => {
    const handler = vi.fn();
    onPauseChange(handler);
    void fakeBrowser.storage.onChanged.trigger({ 'movar:pausedUntil': { newValue: 1 } }, 'sync');
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores unrelated local keys', () => {
    const handler = vi.fn();
    onPauseChange(handler);
    void fakeBrowser.storage.onChanged.trigger({ 'movar:events': { newValue: [] } }, 'local');
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops firing after unsubscribe', () => {
    const handler = vi.fn();
    const unsubscribe = onPauseChange(handler);
    unsubscribe();
    void fakeBrowser.storage.onChanged.trigger({ 'movar:pausedUntil': { newValue: 1 } }, 'local');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('per-site snooze', () => {
  it('snoozeHost stores a host until + arms the sweep alarm at expiry', async () => {
    await snoozeHost('news.example.com');
    expect(await isHostSnoozed('news.example.com')).toBe(NOW + SNOOZE_DURATION_MS);
    const alarm = await fakeBrowser.alarms.get(SNOOZE_ALARM);
    expect(alarm?.scheduledTime).toBe(NOW + SNOOZE_DURATION_MS);
  });

  it('isHostSnoozed is null for an unknown host and for an expired window', async () => {
    expect(await isHostSnoozed('nope.example.com')).toBeNull();
    await snoozeHost('a.example.com');
    vi.setSystemTime(NOW + SNOOZE_DURATION_MS + 1);
    expect(await isHostSnoozed('a.example.com')).toBeNull();
  });

  it('getSnoozedHosts filters out expired entries on read', async () => {
    await snoozeHost('live.example.com'); // expires NOW + 1h
    vi.setSystemTime(NOW + 30 * 60_000); // +30 min
    await snoozeHost('later.example.com'); // expires NOW + 30min + 1h
    vi.setSystemTime(NOW + HOUR_MS + 1); // first expired, second still live
    const live = await getSnoozedHosts();
    expect(live.map((s) => s.host)).toEqual(['later.example.com']);
  });

  it('arms the sweep alarm at the EARLIEST live expiry', async () => {
    await snoozeHost('first.example.com'); // NOW + 1h
    vi.setSystemTime(NOW + 10 * 60_000);
    await snoozeHost('second.example.com'); // NOW + 10min + 1h (later)
    // Earliest live expiry is still the first host's.
    expect((await fakeBrowser.alarms.get(SNOOZE_ALARM))?.scheduledTime).toBe(NOW + HOUR_MS);
  });

  it('unsnoozeHost removes the entry and clears the alarm when none remain', async () => {
    await snoozeHost('x.example.com');
    await unsnoozeHost('x.example.com');
    expect(await isHostSnoozed('x.example.com')).toBeNull();
    expect(await fakeBrowser.alarms.get(SNOOZE_ALARM)).toBeFalsy();
  });

  it('sweepExpiredSnoozes prunes elapsed entries and reports whether it changed', async () => {
    await snoozeHost('gone.example.com');
    expect(await sweepExpiredSnoozes()).toBe(false); // still live → nothing pruned
    vi.setSystemTime(NOW + SNOOZE_DURATION_MS + 1);
    expect(await sweepExpiredSnoozes()).toBe(true); // pruned the expired entry
    expect(await getSnoozedHosts()).toEqual([]);
    expect(await fakeBrowser.alarms.get(SNOOZE_ALARM)).toBeFalsy();
  });

  it('onSnoozeChange fires for the snooze key only', async () => {
    const handler = vi.fn();
    onSnoozeChange(handler);
    void fakeBrowser.storage.onChanged.trigger({ 'movar:snoozedHosts': { newValue: {} } }, 'local');
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
    void fakeBrowser.storage.onChanged.trigger({ 'movar:events': { newValue: [] } }, 'local');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('disabled until update (crash screen)', () => {
  it('is false for a host that was never disabled', async () => {
    expect(await isHostDisabledUntilUpdate('news.example')).toBe(false);
  });

  it('marks a host disabled', async () => {
    await disableHostUntilUpdate('news.example');
    expect(await isHostDisabledUntilUpdate('news.example')).toBe(true);
  });

  it('is idempotent — disabling twice does not duplicate the entry', async () => {
    await disableHostUntilUpdate('news.example');
    await disableHostUntilUpdate('news.example');
    expect(await getDisabledUntilUpdateHosts()).toEqual(['news.example']);
  });

  it('does not affect other hosts', async () => {
    await disableHostUntilUpdate('news.example');
    expect(await isHostDisabledUntilUpdate('other.example')).toBe(false);
  });

  it('enableHostNow removes a disabled host', async () => {
    await disableHostUntilUpdate('news.example');
    await enableHostNow('news.example');
    expect(await isHostDisabledUntilUpdate('news.example')).toBe(false);
  });

  it('enableHostNow is a no-op for a host that was never disabled', async () => {
    await enableHostNow('news.example');
    expect(await getDisabledUntilUpdateHosts()).toEqual([]);
  });

  it('enableHostNow leaves other disabled hosts untouched', async () => {
    await disableHostUntilUpdate('a.example');
    await disableHostUntilUpdate('b.example');
    await enableHostNow('a.example');
    expect(await getDisabledUntilUpdateHosts()).toEqual(['b.example']);
  });

  it('tolerates a malformed stored value rather than throwing', async () => {
    await fakeBrowser.storage.local.set({ 'movar:disabledUntilUpdateHosts': 'not-an-array' });
    expect(await getDisabledUntilUpdateHosts()).toEqual([]);
  });

  it('filters out non-string entries in a malformed array', async () => {
    await fakeBrowser.storage.local.set({
      'movar:disabledUntilUpdateHosts': ['news.example', 42, null],
    });
    expect(await getDisabledUntilUpdateHosts()).toEqual(['news.example']);
  });

  it('clearDisabledUntilUpdateHosts clears every disabled host in one shot', async () => {
    await disableHostUntilUpdate('a.example');
    await disableHostUntilUpdate('b.example');
    await clearDisabledUntilUpdateHosts();
    expect(await getDisabledUntilUpdateHosts()).toEqual([]);
  });

  it('clearDisabledUntilUpdateHosts is a no-op when nothing was disabled', async () => {
    await clearDisabledUntilUpdateHosts();
    expect(await getDisabledUntilUpdateHosts()).toEqual([]);
  });
});
