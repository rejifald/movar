/**
 * Shared WebExtension API mock used by:
 *
 *   1. The Storybook `withBrowserMock` decorator (per-story state via
 *      `parameters.browserMock`) at
 *      `apps/extension/.storybook/decorators/with-browser-mock.tsx`.
 *   2. The static-serve preview shim entry at
 *      `apps/extension/preview/preview-shim-entry.ts`, which esbuild
 *      bundles into a classic `<script>` tag inlined into `popup.html` /
 *      `options.html` when `MOVAR_PREVIEW=1`.
 *
 * Both consumers hit the same code path — the popup component never sees a
 * second copy of the WebExtension surface, so drift between Storybook and
 * the static preview cannot creep in.
 *
 * Critical design point — **stable shim identity**. `wxt/browser` resolves
 * its `browser` export at module-load time as:
 *
 *     export const browser = globalThis.browser?.runtime?.id
 *       ? globalThis.browser
 *       : globalThis.chrome;
 *
 * If a story re-installed the mock by *replacing* `globalThis.browser`, the
 * popup's already-captured `browser` const would still point at the original
 * (or `undefined`). So this module installs the shim once and mutates its
 * underlying state in place when `installBrowserMock` is called again. The
 * decorator can freely call it per-story to switch locale or seed values
 * and the popup sees the new state.
 *
 * Surface covered (and rationale per call site, verified against grep on
 * `apps/extension/src` as of PR1 of the marketplace screenshot pipeline):
 *
 *   runtime.getManifest()         popup + options footer version string
 *   runtime.openOptionsPage()     popup "Settings" link (no-op + log)
 *   runtime.sendMessage()         forward-compat (no current popup/options use)
 *   i18n.getUILanguage()          I18nProvider + LanguageSelector 'auto' label
 *   storage.{sync,local}.get      settings, pause, events readers
 *   storage.{sync,local}.set      settings/pause toggles
 *   storage.onChanged.*Listener   settings + pause subscription round-trip
 *   tabs.query()                  popup activeTabId() (returns [] → no-op path)
 *   tabs.sendMessage()            popup → content script (throws → caught)
 *   alarms.{create,clear}         pause.ts timed resume scheduling
 *   alarms.onAlarm.*Listener      background — not loaded in popup/options,
 *                                   but cheap to include and prevents a
 *                                   future trap
 */

/** State a story (or preview consumer) passes to `installBrowserMock`. */
export interface BrowserMockState {
  /** Drives `browser.i18n.getUILanguage()`. Defaults to `'en-US'` when omitted. */
  uiLanguage?: string;
  /** Seed data for `browser.storage.sync` / `browser.storage.local`. */
  storage?: {
    sync?: Record<string, unknown>;
    local?: Record<string, unknown>;
  };
}

interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

type ChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;

interface MutableMockState {
  uiLanguage: string;
  sync: Map<string, unknown>;
  local: Map<string, unknown>;
  changeListeners: Set<ChangeListener>;
}

/** Module-level mutable state; closures inside the shim object read from
 *  this. `installBrowserMock` rewrites these fields in place. */
const state: MutableMockState = {
  uiLanguage: 'en-US',
  sync: new Map(),
  local: new Map(),
  changeListeners: new Set(),
};

/** Hoisted no-op pair — used for event surfaces (`onChanged`, `onAlarm`, …)
 *  and the empty `alarms.create` shim. Defined at module scope so
 *  `unicorn/consistent-function-scoping` is happy and so every empty hook
 *  shares a single object identity (cheaper than allocating per call). */
const NOOP = (): void => {
  // intentionally empty
};
const NOOP_ASYNC = async (): Promise<void> => {
  // intentionally empty
};

function makeStorageArea(areaName: 'sync' | 'local') {
  return {
    get: async (keys?: string | string[] | Record<string, unknown> | null) => {
      const store = state[areaName];
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
    set: async (obj: Record<string, unknown>) => {
      const store = state[areaName];
      const changes: Record<string, StorageChange> = {};
      for (const [k, newValue] of Object.entries(obj)) {
        const oldValue = store.get(k);
        store.set(k, newValue);
        changes[k] = { oldValue, newValue };
      }
      // Emit on next microtask so callers that `await set()` then expect
      // listeners to have fired observe the canonical Chrome ordering
      // (write resolves first, change events fire next).
      queueMicrotask(() => {
        for (const fn of state.changeListeners) fn(changes, areaName);
      });
    },
    remove: async (keys: string | string[]) => {
      const store = state[areaName];
      const list = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, StorageChange> = {};
      for (const k of list) {
        if (store.has(k)) {
          changes[k] = { oldValue: store.get(k), newValue: undefined };
          store.delete(k);
        }
      }
      queueMicrotask(() => {
        for (const fn of state.changeListeners) fn(changes, areaName);
      });
    },
    clear: async () => {
      const store = state[areaName];
      const changes: Record<string, StorageChange> = {};
      for (const [k, oldValue] of store) {
        changes[k] = { oldValue, newValue: undefined };
      }
      store.clear();
      queueMicrotask(() => {
        for (const fn of state.changeListeners) fn(changes, areaName);
      });
    },
  };
}

const noopEvent = {
  addListener: NOOP,
  removeListener: NOOP,
  hasListener: () => false,
};

/** The shim object — built once, identity stable across re-installs.
 *  All closures read from the module-level `state` so re-installs land
 *  immediately, including for consumers (like `wxt/browser`) that
 *  captured the shim before the latest install. */
const shim = {
  runtime: {
    // Honest sentinel — the popup renders "vpreview" in the footer, which
    // makes it obvious you're not looking at a real install. Deliberately
    // omitting `runtime.id` here keeps the mock from being mistaken for a
    // real `chrome.runtime` by `@wxt-dev/browser`'s identity check on
    // subsequent module loads.
    getManifest: () => ({ version: 'preview' }),
    openOptionsPage: async () => {
      // Best-effort surface so devs can verify the wiring; in preview both
      // pages live on the same server, so jumping there directly is fine.
      // eslint-disable-next-line no-console
      console.log('[browser-mock] openOptionsPage() → /options.html');
      if (typeof location !== 'undefined') {
        location.href = `/options.html${location.search}`;
      }
    },
    sendMessage: async () => null,
    onMessage: noopEvent,
    onInstalled: noopEvent,
    onStartup: noopEvent,
  },
  i18n: { getUILanguage: () => state.uiLanguage },
  storage: {
    sync: makeStorageArea('sync'),
    local: makeStorageArea('local'),
    onChanged: {
      addListener: (fn: ChangeListener) => {
        state.changeListeners.add(fn);
      },
      removeListener: (fn: ChangeListener) => {
        state.changeListeners.delete(fn);
      },
      hasListener: (fn: ChangeListener) => state.changeListeners.has(fn),
    },
  },
  tabs: {
    query: async () => [],
    sendMessage: async () => {
      // sendToActiveTab() in popup/App.tsx wraps this in try/catch and
      // treats the rejection as "no content script", which matches the
      // behaviour on chrome:// and the store. Throwing here is the
      // semantically-correct fake.
      throw new Error('[browser-mock] no content script in mocked preview');
    },
  },
  alarms: {
    // Best-effort no-op — the mock never fires alarms, and the popup
    // never reads back from `create()`.
    create: NOOP_ASYNC,
    clear: async () => true,
    onAlarm: noopEvent,
  },
} as const;

/** Globals shape we read & write on `globalThis`. Hoisted so both
 *  `hasRealChrome` and `installBrowserMock` share one cast site. */
interface BrowserGlobals {
  chrome?: { runtime?: { id?: string } };
  browser?: unknown;
}

/** True when a genuine WebExtension `chrome.runtime` is present — i.e.
 *  someone loaded the built popup via `chrome-extension://` rather than
 *  the static-serve preview. In that case the install is a no-op so we
 *  don't clobber the real surface. */
function hasRealChrome(): boolean {
  const g = globalThis as unknown as BrowserGlobals;
  return Boolean(g.chrome?.runtime?.id);
}

/** Reset the module-level mock state in place from the supplied input.
 *  Pulled out of `installBrowserMock` so the install function reads as a
 *  straight three-step sequence (guard, reset, attach). */
function resetMockState(next: BrowserMockState): void {
  const { uiLanguage = 'en-US', storage = {} } = next;
  state.uiLanguage = uiLanguage;
  state.sync = new Map(Object.entries(storage.sync ?? {}));
  state.local = new Map(Object.entries(storage.local ?? {}));
  state.changeListeners = new Set();
}

/**
 * Reset the mock to the supplied state and install it onto
 * `globalThis.browser` / `globalThis.chrome` if it isn't already.
 *
 * Safe to call multiple times — the shim object identity is stable and
 * subsequent calls mutate the underlying state in place. No-ops when a
 * real `chrome.runtime` is present (see `hasRealChrome`).
 */
export function installBrowserMock(next: BrowserMockState = {}): void {
  if (hasRealChrome()) return;
  resetMockState(next);
  // Install once. `wxt/browser` resolves through whichever of `browser` /
  // `chrome` is set first; we set both so both branches of its check
  // land on the same shim.
  const g = globalThis as unknown as BrowserGlobals;
  g.browser = shim;
  g.chrome = shim as unknown as NonNullable<BrowserGlobals['chrome']>;
  // eslint-disable-next-line no-console
  console.info(`[browser-mock] installed (locale=${state.uiLanguage})`);
}
