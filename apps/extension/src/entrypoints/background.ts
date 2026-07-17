import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { buildDeclaredClassifier, classifyBySnippet, getProfiles } from '@movar/lang-detect';
import { francEngine, francRung3Resolver, warmFranc } from '@movar/lang-detect/franc';
import { contentStringsEn } from '../lib/i18n/content-strings-en';
import { contentStringsUk } from '../lib/i18n/content-strings-uk';
import type { ContentStrings } from '../lib/i18n/content-strings';
import type { ResolvedLocale } from '@movar/i18n';
import {
  suspendGoogleSearchRedirectRule,
  syncAcceptLanguageRule,
  syncGoogleSearchRedirectRule,
} from '../lib/dnr';
import {
  clearDisabledUntilUpdateHosts,
  getDisabledUntilUpdateHosts,
  getPauseState,
  getSnoozedHosts,
  onPauseChange,
  onSnoozeChange,
  pauseFor,
  RESUME_ALARM,
  resume,
  resumeIfExpired,
  SNOOZE_ALARM,
  sweepExpiredSnoozes,
} from '../lib/pause';
import { ensureSettingsInitialised, getSettings, onSettingsChange } from '../lib/settings';
import {
  isNativeBridgeAvailable,
  pushSettingsToNative,
  reconcileNativeSettings,
} from '../lib/native-settings';
import {
  initBadgeStyle,
  refreshActiveTabs,
  refreshTabById,
  refreshTabIcon,
} from '../lib/toolbar-icon';
import type { MovarMessage } from '../lib/messaging';

/** One-shot alarm that re-installs the Google /search redirect rule after the
 *  empty-results retry suspended it. The retry only needs the rule down for its
 *  single lr-less navigation; this restores it ~30s later even if the tab
 *  closed mid-recovery or the SW slept (chrome.alarms survives suspension; a
 *  setTimeout would not). Each new suspension pushes the restore out, so the
 *  rule stays down through a run of failing searches and returns once they
 *  succeed. */
const RESTORE_GOOGLE_REDIRECT_ALARM = 'movar:restore-google-redirect';

/** Reveal everything Movar concealed on the active tab — the keyboard-shortcut
 *  twin of the popup's "Show everything". Reuses the existing content handler;
 *  no new message type. A tab without a content script (chrome://, store, …)
 *  rejects sendMessage, which we swallow — there's nothing to reveal there. */
async function revealActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'movar:restoreHidden' } satisfies MovarMessage);
  } catch {
    // No receiver in the active tab — nothing concealed there to reveal.
  }
}

/** Open the first-run onboarding page in a new tab. Swallows failures — a
 *  refused tab create must not break the install-time settings seed. */
async function openOnboarding(): Promise<void> {
  try {
    // WXT's typed getURL rejects HTML-entrypoint paths here; cast to the plain
    // signature, mirroring src/lib/capability-loader.ts.
    const runtime = browser.runtime as unknown as { getURL(path: string): string };
    await browser.tabs.create({ url: runtime.getURL('/onboarding.html') });
  } catch {
    // Tab creation can be refused; onboarding stays reachable, just not popped.
  }
}

/** Dispatch a manifest `commands` keyboard shortcut to its action. Exported for
 *  a direct unit test; the ids match the `commands` block in wxt.config.ts.
 *  toggle-pause flips the GLOBAL pause (timed 1h ↔ resume); reveal-all reuses
 *  the content script's restore handler on the active tab. */
export async function handleCommand(command: string): Promise<void> {
  if (command === 'toggle-pause') {
    const { paused } = await getPauseState();
    await (paused ? resume() : pauseFor('1h'));
  } else if (command === 'reveal-all') {
    await revealActiveTab();
  }
}

/** Recompute the DNR rules from current settings + pause + per-site snooze +
 *  crash-screen disables. */
async function resync(): Promise<void> {
  // Independent reads — fetch settings, pause, snoozed hosts, and
  // crash-disabled hosts concurrently.
  const [settings, { paused }, snoozed, disabledUntilUpdate] = await Promise.all([
    getSettings(),
    getPauseState(),
    getSnoozedHosts(),
    getDisabledUntilUpdateHosts(),
  ]);
  const temporarilyExcludedHosts = [...snoozed.map((s) => s.host), ...disabledUntilUpdate];
  // Both rules read the same inputs so they always tell the same story about
  // whether Movar is active; sequential because each updateDynamicRules call
  // must replace its own rule id atomically, not race the other's sweep.
  await syncAcceptLanguageRule(settings, !paused, temporarilyExcludedHosts);
  await syncGoogleSearchRedirectRule(settings, !paused, temporarilyExcludedHosts);
}

/** Every locale's curtain strings live here, not in the always-on content
 *  bundle; the content fetches just its active locale via `movar:contentStrings`.
 *  English is also bundled content-side as the fallback. */
const CONTENT_STRINGS: Record<ResolvedLocale, ContentStrings> = {
  en: contentStringsEn,
  uk: contentStringsUk,
};

/**
 * Per-type worker request handlers, keyed by message type — each returns its
 * response (a value or a promise). A dispatch map keeps the onMessage listener
 * flat (mirroring the content-script bridge) and every handler trivial; the mapped
 * type narrows each handler's `msg` to its own payload. The worker hosts the
 * DOM-free heavy/shared bits: franc detection, the content classifier, and the
 * per-locale curtain catalogues.
 */
const WORKER_REQUESTS: {
  [K in MovarMessage['type']]?: (msg: Extract<MovarMessage, { type: K }>) => unknown;
} = {
  'movar:detectText': async (msg) => {
    const ctx = msg.maxChars == null ? {} : { maxChars: msg.maxChars };
    const detected = await francEngine.detect(msg.text, ctx);
    return detected;
  },
  'movar:classifySnippets': (msg) => {
    // Reconstruct the candidate profiles once, then classify each item.
    // Undeclared cards run the full text classifier (rungs 1–3, franc as the
    // rung-3 backstop). Declared cards — where the page labelled the node's
    // language — are fused: the declaration decides on weak/absent text, and a
    // confident text read overrides a mislabel. Profiles + franc live here, not
    // in the content bundle. One round-trip per content-filter tick.
    const profiles = getProfiles(msg.candidateCodes);
    const fuseDeclared = buildDeclaredClassifier(profiles);
    return msg.items.map((item) =>
      item.declared === undefined
        ? classifyBySnippet(item.text, profiles, francRung3Resolver)
        : fuseDeclared(item.text, item.declared),
    );
  },
  'movar:contentStrings': (msg) => CONTENT_STRINGS[msg.locale],
  'movar:warmFranc': async () => {
    await warmFranc();
  },
  'movar:suspendGoogleRedirect': async () => {
    await suspendGoogleSearchRedirectRule();
    // Self-healing restore. 0.5 min is Chrome's floor for a sub-minute alarm;
    // re-creating the same-named alarm resets the timer, so back-to-back
    // recoveries keep the rule down until searches recover.
    await browser.alarms.create(RESTORE_GOOGLE_REDIRECT_ALARM, { delayInMinutes: 0.5 });
    return true;
  },
};

/**
 * Serve the content script's worker requests (see WORKER_REQUESTS). Hosting the
 * heavy, DOM-free bits here keeps them off every page's content bundle — franc's
 * ~170 KB of trigram tables and the language profiles load once per session, not
 * per page, and inactive-locale curtain catalogues never ship to the content.
 */
function registerWorkerMessageHandler(): void {
  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as MovarMessage | undefined;
    if (!msg) return false;
    const handler = WORKER_REQUESTS[msg.type];
    if (!handler) return false;
    // Normalise the handler's sync-or-async result and respond once it settles;
    // keep the channel open (return true).
    void Promise.resolve((handler as (m: MovarMessage) => unknown)(msg)).then(sendResponse);
    return true;
  });
}

/** The tab's content script pushed a concealment change (`movar:hiddenChanged`):
 *  repaint that tab's toolbar icon + count badge straight from the pushed summary
 *  — no round-trip back. A separate listener from the worker-request dispatch
 *  above because this one needs `sender.tab`, and it never responds. */
function registerHiddenPushHandler(): void {
  browser.runtime.onMessage.addListener((raw, sender) => {
    const msg = raw as MovarMessage | undefined;
    if (msg?.type === 'movar:hiddenChanged') {
      const tabId = sender.tab?.id;
      // The push carries a real summary (the content script is alive), so this
      // never resolves to `attention` — the `loading` flag is passed through only
      // for consistency with the tab-event refreshes.
      if (tabId != null)
        void refreshTabIcon(tabId, sender.tab?.url, msg.summary, sender.tab?.status === 'loading');
    }
    // Fire-and-forget: no response, and we don't hold the channel open.
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
    // Stand up the worker request host first: register the handler and warm the
    // trigram tables now so the first tier-7 request after the worker wakes
    // doesn't pay the parse on the content script's critical path.
    registerWorkerMessageHandler();
    // Toolbar-icon plumbing: the content-script concealment push and the
    // one-time badge colour now; the tab + settings/pause/snooze listeners that
    // keep each tab's icon in sync are registered below.
    registerHiddenPushHandler();
    void initBadgeStyle();
    void warmFranc();

    // On every worker wake (not just browser onStartup), self-heal a timed pause
    // whose window elapsed while the SW slept — if the resume alarm was dropped,
    // nothing else would clear it and the DNR rule would stay off past expiry.
    // Then resync the rule (MV3 dynamic rules can be wiped between sessions).
    void (async () => {
      await resumeIfExpired();
      await resync();
      // Self-heal expired per-site snoozes whose sweep alarm was dropped while
      // the SW slept (same hazard as resumeIfExpired for the global pause). Runs
      // AFTER resync — resync already excludes only LIVE snoozes (getSnoozedHosts
      // filters expired on read), so the sweep is pure storage/alarm cleanup.
      await sweepExpiredSnoozes();
      // Safari only: fold any host-app settings change (made while the worker
      // slept) in from the shared App Group, or seed it on first run.
      if (isNativeBridgeAvailable()) await reconcileNativeSettings();
      // Paint the active tab's icon on wake — the SW may have slept through the
      // tab activation that would otherwise have set it.
      await refreshActiveTabs();
    })();

    browser.runtime.onInstalled.addListener((details) => {
      void (async () => {
        await ensureSettingsInitialised();
        // A site turned off from the crash screen recovers when MOVAR ITSELF
        // updates — the crash it was working around is presumably fixed in
        // whatever just shipped. Scoped to 'update' only: a bare browser
        // update ('chrome_update'/'browser_update') ships no Movar fix, so
        // clearing there would be premature. Cleared before resync() so the
        // freshly-synced rules already reflect the resumed hosts.
        if (details.reason === 'update') await clearDisabledUntilUpdateHosts();
        await resync();
        // Seed the App Group from the freshly-initialised settings (Safari).
        if (isNativeBridgeAvailable()) await reconcileNativeSettings();
        // First run only (not an update / browser update): open the onboarding
        // page that walks the visitor through pinning Movar and — the step this
        // page exists for — granting host access to every site. Chromium +
        // Firefox only; on Safari the first-run flow is the container host app
        // (apps/safari-host-app), so a browser-tab pop here would double up.
        if (details.reason === 'install' && import.meta.env['BROWSER'] !== 'safari') {
          await openOnboarding();
        }
      })();
    });

    browser.runtime.onStartup.addListener(() => {
      // Indefinite pauses survive restarts by design — only an explicit resume
      // clears them. We still resync because the DNR rule lives in MV3 dynamic
      // rules that may have been wiped between sessions.
      void resync();
      if (isNativeBridgeAvailable()) void reconcileNativeSettings();
    });

    onSettingsChange(() => {
      void resync();
      // Mirror the change out to the host app's App Group (Safari).
      if (isNativeBridgeAvailable()) void pushSettingsToNative();
      // enabled / allowlist changes flip the icon (off ↔ active ↔ exempt).
      void refreshActiveTabs();
    });
    onPauseChange(() => {
      void resync();
      void refreshActiveTabs();
    });
    // A host snoozed or resumed → re-apply the DNR rule (exclude / re-include it).
    onSnoozeChange(() => {
      void resync();
      void refreshActiveTabs();
    });

    // Per-tab toolbar icon: repaint on tab switch, and when a page finishes
    // loading or navigates (SPA / same-tab). The content-script push
    // (`movar:hiddenChanged`) covers concealment that settles after load; these
    // cover the tab/navigation transitions the push can't observe.
    browser.tabs.onActivated.addListener(({ tabId }) => {
      void refreshTabById(tabId);
    });
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' || changeInfo.url != null) {
        // `tab.status === 'loading'` on the navigation-commit event (the early
        // `changeInfo.url` tick): the new document's content script hasn't run
        // yet, so refreshTabIcon holds the icon rather than flashing `attention`
        // red. The later `status: 'complete'` tick repaints the settled state.
        void refreshTabIcon(tabId, tab.url, undefined, tab.status === 'loading');
      }
    });

    // Keyboard shortcuts (manifest `commands`): toggle global pause, reveal-all
    // on the active tab. No-op on a browser that didn't bind a key — the
    // listener simply never fires.
    browser.commands.onCommand.addListener((command) => {
      void handleCommand(command);
    });

    // Timed-expiry alarms: a global pause ending (RESUME_ALARM) resumes + resyncs;
    // the per-site snooze sweep (SNOOZE_ALARM) prunes expired hosts + resyncs;
    // the empty-results retry's restore (RESTORE_GOOGLE_REDIRECT_ALARM) re-installs
    // the Google redirect rule the retry suspended.
    browser.alarms.onAlarm.addListener((alarm) => {
      switch (alarm.name) {
        case RESUME_ALARM: {
          void (async () => {
            await resume();
            await resync();
          })();
          break;
        }
        case SNOOZE_ALARM: {
          void (async () => {
            await sweepExpiredSnoozes();
            await resync();
          })();
          break;
        }
        case RESTORE_GOOGLE_REDIRECT_ALARM: {
          void resync();
          break;
        }
      }
    });
  },
});
