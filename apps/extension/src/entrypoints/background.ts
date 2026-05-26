import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { syncAcceptLanguageRule } from '../lib/dnr';
import {
  clearSessionPause,
  getPauseState,
  onPauseChange,
  RESUME_ALARM,
  resume,
} from '../lib/pause';
import { ensureSettingsInitialised, getSettings, onSettingsChange } from '../lib/settings';

/** Recompute the DNR rule from current settings + pause state. */
async function resync(): Promise<void> {
  const settings = await getSettings();
  const { paused } = await getPauseState();
  await syncAcceptLanguageRule(settings, !paused);
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await ensureSettingsInitialised();
    await resync();
  });

  browser.runtime.onStartup.addListener(async () => {
    await clearSessionPause(); // session pauses end when the browser restarts
    await resync();
  });

  onSettingsChange(() => {
    void resync();
  });
  onPauseChange(() => {
    void resync();
  });

  // When a timed pause expires, resume and re-apply the rule.
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RESUME_ALARM) {
      await resume();
      await resync();
    }
  });
});
