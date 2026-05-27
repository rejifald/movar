/**
 * Background entrypoint integration tests.
 *
 * These tests boot the actual background script under the in-memory
 * fakeBrowser (storage, alarms, runtime) plus our DNR shim, then drive it
 * through event triggers (`onInstalled`, `onAlarm`, etc.) and storage
 * mutations to verify end-to-end behaviour: settings init, DNR resync,
 * pause/resume, alarm-driven recovery.
 *
 * Pattern:
 *   1. Call `background.main()` to register all listeners on fakeBrowser.
 *   2. Drive an event with `fakeBrowser.<area>.<event>.trigger(...)` OR
 *      mutate storage (which fires `storage.onChanged` automatically).
 *   3. Wait for the async resync chain via `vi.waitFor(...)`.
 *   4. Assert on `getInstalledAcceptLanguageRule()` and/or storage state.
 *
 * Per-file setup (fakeBrowser reset + DNR shim reinstall between tests)
 * is opted in via `installFakeBrowserHooks()` — currently a stub. Every
 * describe block below is `.skip` until the stubs in `./setup` and
 * `./dnr-mock` are implemented; drop `.skip` and add the
 * `installFakeBrowserHooks()` call back at the top of the file then.
 *
 * Lives in src/test/ rather than src/entrypoints/ because WXT treats every
 * file in src/entrypoints/ as a browser-extension entrypoint and collides
 * on the "background" name with background.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/shared';
import background from '../entrypoints/background';
import { getInstalledAcceptLanguageRule, getInstalledRules } from './dnr-mock';
import { getSettings, setSettings } from '../lib/settings';
import { getPauseState, pauseFor, RESUME_ALARM } from '../lib/pause';
import { buildAcceptLanguage } from '../lib/accept-language';

/** Extract the Accept-Language header value from an installed DNR rule. */
function acceptLanguageOf(rule: ReturnType<typeof getInstalledAcceptLanguageRule>): string | null {
  if (!rule) return null;
  const action = rule.action as {
    type: string;
    requestHeaders?: { header: string; operation: string; value: string }[];
  };
  const h = action.requestHeaders?.find((x) => x.header === 'Accept-Language');
  return h?.value ?? null;
}

/** Boot the background entrypoint, fire a fresh-install onInstalled event,
 *  and wait for the Accept-Language DNR rule to land. Every test in this
 *  file needs the same three steps before exercising its specific scenario,
 *  so they're extracted here — keeps each test focused on what's unique. */
async function bootFreshInstall(): Promise<void> {
  background.main();
  await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install', temporary: false });
  await vi.waitFor(() => expect(getInstalledAcceptLanguageRule()).not.toBeNull());
}

/** Boot + 1h pause + wait for the DNR rule to be removed. The pause/resume
 *  tests share this exact setup before driving the alarm or asserting on
 *  unrelated alarm behaviour. */
async function bootThenPauseOneHour(): Promise<void> {
  await bootFreshInstall();
  await pauseFor('1h');
  await vi.waitFor(() => expect(getInstalledRules()).toHaveLength(0));
}

describe.skip('background entrypoint — onInstalled', () => {
  it('writes default settings and installs the Accept-Language DNR rule on fresh install', async () => {
    await bootFreshInstall();

    // Default settings landed in sync storage.
    expect(await getSettings()).toEqual(defaultSettings);

    // DNR rule reflects the default priority ['uk', 'en'] → "uk,en;q=0.9".
    const rule = getInstalledAcceptLanguageRule()!;
    expect(acceptLanguageOf(rule)).toBe(buildAcceptLanguage(defaultSettings.priority));
    expect(rule.condition).toMatchObject({
      resourceTypes: ['main_frame', 'sub_frame'],
    });
  });

  it('does not clobber existing settings when reinstalled / updated', async () => {
    // Simulate an existing install with non-default priority.
    const existing = { ...defaultSettings, priority: ['fr', 'en'] };
    await setSettings(existing);

    background.main();
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '0.9.0',
      temporary: false,
    });

    await vi.waitFor(() => {
      expect(getInstalledAcceptLanguageRule()).not.toBeNull();
    });

    // Settings preserved, DNR rule reflects them.
    expect((await getSettings()).priority).toEqual(['fr', 'en']);
    expect(acceptLanguageOf(getInstalledAcceptLanguageRule())).toBe('fr,en;q=0.9');
  });
});

describe.skip('background entrypoint — settings changes', () => {
  it('resyncs the DNR rule when priority changes', async () => {
    await bootFreshInstall();

    // User picks a new priority in the options page.
    await setSettings({ ...defaultSettings, priority: ['de', 'en'] });

    await vi.waitFor(() => {
      expect(acceptLanguageOf(getInstalledAcceptLanguageRule())).toBe('de,en;q=0.9');
    });
  });

  it('removes the DNR rule when the extension is disabled via settings', async () => {
    await bootFreshInstall();

    await setSettings({ ...defaultSettings, enabled: false });

    await vi.waitFor(() => {
      expect(getInstalledRules()).toHaveLength(0);
    });
  });
});

describe.skip('background entrypoint — pause / resume', () => {
  it('removes the DNR rule while paused and reinstalls it when the resume alarm fires', async () => {
    await bootThenPauseOneHour();
    expect((await getPauseState()).paused).toBe(true);

    // Fire the resume alarm — the alarms.onAlarm listener calls resume()
    // and resyncs, reinstalling the rule.
    await fakeBrowser.alarms.onAlarm.trigger({
      name: RESUME_ALARM,
      scheduledTime: Date.now(),
    });

    await vi.waitFor(() => {
      expect(getInstalledAcceptLanguageRule()).not.toBeNull();
    });
    expect((await getPauseState()).paused).toBe(false);
  });

  it('ignores unrelated alarms', async () => {
    await bootThenPauseOneHour();

    // Some unrelated alarm fires — the listener filters by name and should
    // do nothing, so the extension stays paused.
    await fakeBrowser.alarms.onAlarm.trigger({
      name: 'unrelated:other-alarm',
      scheduledTime: Date.now(),
    });

    // Give any incorrect resync a chance to land before asserting the
    // negative. Two microtask flushes covers the storage-read → DNR-update
    // chain in resync().
    await Promise.resolve();
    await Promise.resolve();

    expect(getInstalledRules()).toHaveLength(0);
    expect((await getPauseState()).paused).toBe(true);
  });
});
