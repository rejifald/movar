import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { handleCommand } from '../background';
import { getPauseState } from '../../lib/pause';

// fakeBrowser types `tabs.query`/`sendMessage` with the callback overload
// (returns void), so widen the spies to the promise-returning shape the worker
// actually consumes (mirrors App.test.tsx / lang-detect-bridge.test.ts).
function queryReturns(tabs: { id: number }[]): void {
  (
    vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<
      (...args: unknown[]) => Promise<{ id: number }[]>
    >
  ).mockResolvedValue(tabs);
}
function sendMessageSpy(): MockInstance<(...args: unknown[]) => Promise<unknown>> {
  return vi.spyOn(browser.tabs, 'sendMessage');
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleCommand — keyboard shortcuts', () => {
  it('toggle-pause: pauses (timed 1h) from the resumed state', async () => {
    expect((await getPauseState()).paused).toBe(false);

    await handleCommand('toggle-pause');

    const state = await getPauseState();
    expect(state.paused).toBe(true);
    expect(state.until).not.toBeNull();
    expect(state.indefinite).toBe(false);
  });

  it('toggle-pause: resumes when already paused', async () => {
    await handleCommand('toggle-pause'); // → paused
    expect((await getPauseState()).paused).toBe(true);

    await handleCommand('toggle-pause'); // → resumed

    expect((await getPauseState()).paused).toBe(false);
  });

  it('reveal-all: sends movar:restoreHidden to the active tab', async () => {
    queryReturns([{ id: 42 }]);
    const sendMessage = sendMessageSpy().mockResolvedValue(null);

    await handleCommand('reveal-all');

    expect(sendMessage).toHaveBeenCalledWith(42, { type: 'movar:restoreHidden' });
  });

  it('reveal-all: no-op when there is no active tab', async () => {
    queryReturns([]);
    const sendMessage = sendMessageSpy();

    await handleCommand('reveal-all');

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('reveal-all: swallows a missing-receiver rejection (chrome:// / store tab)', async () => {
    queryReturns([{ id: 7 }]);
    sendMessageSpy().mockRejectedValue(new Error('no receiving end'));

    await expect(handleCommand('reveal-all')).resolves.toBeUndefined();
  });

  it('ignores an unknown command id', async () => {
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage');
    await handleCommand('not-a-command');
    expect(sendMessage).not.toHaveBeenCalled();
    expect((await getPauseState()).paused).toBe(false);
  });
});
