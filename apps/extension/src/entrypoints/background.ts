import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { classifyBySnippet, getProfiles } from '@movar/lang-detect';
import { francEngine, francRung3Resolver, warmFranc } from '@movar/lang-detect/franc';
import { syncAcceptLanguageRule } from '../lib/dnr';
import { getPauseState, onPauseChange, RESUME_ALARM, resume } from '../lib/pause';
import { ensureSettingsInitialised, getSettings, onSettingsChange } from '../lib/settings';
import type { MovarMessage } from '../lib/messaging';

/** Recompute the DNR rule from current settings + pause state. */
async function resync(): Promise<void> {
  const settings = await getSettings();
  const { paused } = await getPauseState();
  await syncAcceptLanguageRule(settings, !paused);
}

/**
 * Per-type franc request handlers, keyed by message type — each returns its
 * response (a value or a promise). A dispatch map keeps the onMessage listener
 * flat (mirroring the content-script bridge) and every handler trivial; the
 * mapped type narrows each handler's `msg` to its own payload.
 */
const FRANC_REQUESTS: {
  [K in MovarMessage['type']]?: (msg: Extract<MovarMessage, { type: K }>) => unknown;
} = {
  'movar:detectText': async (msg) => {
    const ctx = msg.maxChars == null ? {} : { maxChars: msg.maxChars };
    const detected = await francEngine.detect(msg.text, ctx);
    return detected;
  },
  'movar:classifySnippets': (msg) => {
    // Reconstruct the candidate profiles and run the full classifier (rungs 1–3,
    // with franc as the rung-3 backstop) over the batch — one round-trip per
    // content-filter tick. The profiles + franc live here, not in the content.
    const profiles = getProfiles(msg.candidateCodes);
    return msg.texts.map((text) => classifyBySnippet(text, profiles, francRung3Resolver));
  },
  'movar:warmFranc': async () => {
    await warmFranc();
  },
};

/**
 * Serve the content script's franc requests (see FRANC_REQUESTS). Hosting franc
 * in the worker keeps its ~170 KB of trigram tables out of every page's content
 * bundle — the worker loads franc once per session, not per page.
 */
function registerFrancMessageHandler(): void {
  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as MovarMessage | undefined;
    if (!msg) return false;
    const handler = FRANC_REQUESTS[msg.type];
    if (!handler) return false;
    // Normalise the handler's sync-or-async result and respond once it settles;
    // keep the channel open (return true).
    void Promise.resolve((handler as (m: MovarMessage) => unknown)(msg)).then(sendResponse);
    return true;
  });
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
    // Stand up the franc host first: register the request handler and warm the
    // trigram tables now so the first tier-7 request after the worker wakes
    // doesn't pay the parse on the content script's critical path.
    registerFrancMessageHandler();
    void warmFranc();

    browser.runtime.onInstalled.addListener(() => {
      void (async () => {
        await ensureSettingsInitialised();
        await resync();
      })();
    });

    browser.runtime.onStartup.addListener(() => {
      // Indefinite pauses survive restarts by design — only an explicit resume
      // clears them. We still resync because the DNR rule lives in MV3 dynamic
      // rules that may have been wiped between sessions.
      void resync();
    });

    onSettingsChange(() => {
      void resync();
    });
    onPauseChange(() => {
      void resync();
    });

    // When a timed pause expires, resume and re-apply the rule.
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === RESUME_ALARM) {
        void (async () => {
          await resume();
          await resync();
        })();
      }
    });
  },
});
