import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { HOUR_MS } from './time';
import { getPauseState, onPauseChange, pauseFor, RESUME_ALARM, resume } from './pause';

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
