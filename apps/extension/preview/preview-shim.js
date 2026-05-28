/**
 * MOVAR preview-only WebExtension API shim.
 *
 * Installs `globalThis.browser` / `globalThis.chrome` with just enough surface
 * for the popup and options surfaces to render via a static file server
 * (`pnpm dlx serve apps/extension/.output/<browser>`). In a real extension
 * context the real `chrome.runtime` is present and this file is never loaded —
 * the wxt `build:done` hook only inlines it into `popup.html` / `options.html`
 * when `MOVAR_PREVIEW=1` is set at build time. See `wxt.config.ts`.
 *
 * Plain JS (no module) so the classic <script> tag executes synchronously
 * before the deferred entry module evaluates and reaches for `browser.*`.
 *
 * Surface covered (and rationale per call site, verified against grep on
 * apps/extension/src as of feat/marketing-copy-overhaul):
 *
 *   runtime.getManifest()       popup + options footer version string
 *   runtime.openOptionsPage()   popup "Settings" link (no-op + log)
 *   runtime.sendMessage()       forward-compat (no current popup/options use)
 *   i18n.getUILanguage()        I18nProvider + LanguageSelector 'auto' label
 *   storage.{sync,local}.get    settings, pause, events readers
 *   storage.{sync,local}.set    settings/pause toggles
 *   storage.onChanged.*Listener round-trip subscription for settings + pause
 *   tabs.query()                popup activeTabId() (returns [] → no-op path)
 *   tabs.sendMessage()          popup → content script (throws → caught)
 *   alarms.{create,clear}       pause.ts timed resume scheduling
 *   alarms.onAlarm.*Listener    background — not loaded in popup/options, but
 *                                 cheap to include and prevents a future trap
 */
(() => {
  // If the real chrome.runtime is present (e.g. someone served the build
  // through chrome-extension:// by mistake), don't clobber it. Optional-chain
  // is safe because `globalThis.chrome` is a property read, not a bare ident —
  // it resolves to `undefined` in plain web contexts rather than throwing.
  if (globalThis.chrome?.runtime?.id) return;

  // Allow flipping locale without rebuilding: `?locale=uk` on popup.html
  // exercises the Ukrainian catalogue.
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const locale = params.get('locale') || 'en-US';

  // Separate stores per area so listeners can faithfully report `areaName`.
  // Chrome's onChanged fires once per area, not once per shared store, so
  // settings.ts (which filters area === 'sync') stays accurate.
  const stores = { sync: new Map(), local: new Map() };
  const changeListeners = new Set();

  const makeStorageArea = (areaName) => {
    const store = stores[areaName];
    return {
      get: async (keys) => {
        const all = Object.fromEntries(store);
        if (keys == null) return all;
        if (typeof keys === 'string') return { [keys]: all[keys] };
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((k) => [k, all[k]]));
        }
        // Object form: keys-with-defaults.
        return Object.fromEntries(
          Object.entries(keys).map(([k, def]) => [k, k in all ? all[k] : def]),
        );
      },
      set: async (obj) => {
        const changes = {};
        for (const [k, newValue] of Object.entries(obj)) {
          const oldValue = store.get(k);
          store.set(k, newValue);
          changes[k] = { oldValue, newValue };
        }
        // Emit on next microtask so callers that `await set()` then expect
        // listeners to have fired observe the canonical Chrome ordering
        // (write resolves first, change events fire next).
        queueMicrotask(() => {
          for (const fn of changeListeners) fn(changes, areaName);
        });
      },
      remove: async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const k of list) {
          if (store.has(k)) {
            changes[k] = { oldValue: store.get(k), newValue: undefined };
            store.delete(k);
          }
        }
        queueMicrotask(() => {
          for (const fn of changeListeners) fn(changes, areaName);
        });
      },
      clear: async () => {
        const changes = {};
        for (const [k, oldValue] of store) {
          changes[k] = { oldValue, newValue: undefined };
        }
        store.clear();
        queueMicrotask(() => {
          for (const fn of changeListeners) fn(changes, areaName);
        });
      },
    };
  };

  const noopEvent = { addListener: () => {}, removeListener: () => {}, hasListener: () => false };

  const shim = {
    runtime: {
      // Honest sentinel — the popup renders "vpreview" in the footer, which
      // makes it obvious you're not looking at a real install.
      getManifest: () => ({ version: 'preview' }),
      openOptionsPage: async () => {
        // Best-effort surface so devs can verify the wiring; in preview both
        // pages live on the same server, so jumping there directly is fine.
        console.log('[preview-shim] openOptionsPage() → /options.html');
        if (globalThis.location) {
          globalThis.location.href = `/options.html${globalThis.location.search}`;
        }
      },
      sendMessage: async () => null,
      onMessage: noopEvent,
      onInstalled: noopEvent,
      onStartup: noopEvent,
    },
    i18n: { getUILanguage: () => locale },
    storage: {
      sync: makeStorageArea('sync'),
      local: makeStorageArea('local'),
      onChanged: {
        addListener: (fn) => {
          changeListeners.add(fn);
        },
        removeListener: (fn) => {
          changeListeners.delete(fn);
        },
        hasListener: (fn) => changeListeners.has(fn),
      },
    },
    tabs: {
      query: async () => [],
      sendMessage: async () => {
        // sendToActiveTab() in popup/App.tsx wraps this in try/catch and
        // treats the rejection as "no content script", which matches the
        // behaviour on chrome:// and the store. Throwing here is the
        // semantically-correct fake.
        throw new Error('[preview-shim] no content script in static preview');
      },
    },
    alarms: {
      create: async () => {},
      clear: async () => true,
      onAlarm: noopEvent,
    },
  };

  globalThis.browser = shim;
  globalThis.chrome = shim;
  console.info(`[preview-shim] installed (locale=${locale}) — preview build, not real extension`);
})();
