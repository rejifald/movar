import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { syncAcceptLanguageRule } from '../lib/dnr';
import { getPauseState, onPauseChange, RESUME_ALARM, resume } from '../lib/pause';
import { ensureSettingsInitialised, getSettings, onSettingsChange } from '../lib/settings';

/** Recompute the DNR rule from current settings + pause state. */
async function resync(): Promise<void> {
  const settings = await getSettings();
  const { paused } = await getPauseState();
  await syncAcceptLanguageRule(settings, !paused);
}

// `type: 'module'` is required for Chrome stable from late 2025 onward —
// without it the SW console emits "Missing field moduleType" and the
// background never registers, which cascades into the popup never
// initialising. WXT (≤ 0.20.26) doesn't auto-emit this on the manifest's
// background entry; declaring it here makes WXT bundle the SW as ESM
// and write `"type": "module"` to `background.service_worker`.
export default defineBackground({
  type: 'module',
  main() {
    browser.runtime.onInstalled.addListener(async () => {
      await ensureSettingsInitialised();
      await resync();
    });

    browser.runtime.onStartup.addListener(async () => {
      // Indefinite pauses survive restarts by design — only an explicit resume
      // clears them. We still resync because the DNR rule lives in MV3 dynamic
      // rules that may have been wiped between sessions.
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
  },
});
