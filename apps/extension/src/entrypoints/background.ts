import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { defaultSettings, type MovarSettings } from '@movar/shared';
import { syncAcceptLanguageRule } from '../lib/dnr';
import { clearSessionPause, getPauseState, RESUME_ALARM, resume } from '../lib/pause';

async function getSettings(): Promise<MovarSettings> {
  const stored = await browser.storage.sync.get('settings');
  return (stored.settings as MovarSettings | undefined) ?? defaultSettings;
}

/** Recompute the DNR rule from current settings + pause state. */
async function resync(): Promise<void> {
  const settings = await getSettings();
  const { paused } = await getPauseState();
  await syncAcceptLanguageRule(settings, !paused);
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const stored = await browser.storage.sync.get('settings');
    if (!stored.settings) {
      await browser.storage.sync.set({ settings: defaultSettings });
    }
    await resync();
  });

  browser.runtime.onStartup.addListener(async () => {
    await clearSessionPause(); // session pauses end when the browser restarts
    await resync();
  });

  // React to settings changes and pause/resume toggles.
  browser.storage.onChanged.addListener((changes, area) => {
    const settingsChanged = area === 'sync' && 'settings' in changes;
    const pauseChanged =
      area === 'local' && ('movar:pausedUntil' in changes || 'movar:pausedSession' in changes);
    if (settingsChanged || pauseChanged) {
      void resync();
    }
  });

  // When a timed pause expires, resume and re-apply the rule.
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RESUME_ALARM) {
      await resume();
      await resync();
    }
  });
});
