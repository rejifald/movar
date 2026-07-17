/**
 * Playwright fixture: launches Chromium with the WXT-built Movar extension
 * loaded, exposes the MV3 service worker as a fixture so tests can seed
 * settings and read correction events, and offers a paired "clean" context
 * (no extension) for baseline assertions about what the site looks like
 * before Movar touches it.
 *
 * Why persistent context: `chromium.launch()` doesn't accept extensions in
 * MV3 — `launchPersistentContext` is the only path. We point it at a
 * tmpdir (empty `userDataDir`) so each worker gets a fresh profile.
 *
 * Headed vs headless: we honour the project-level `headless` config
 * (default `true` in `playwright.config.ts`, explicit `false` in live /
 * compare / demo configs, overridable per-run via `--headed`). MV3
 * extensions DO load in Chromium's new headless mode (`--headless=new`);
 * the catch is that Playwright's default headless binary is
 * `chromium-headless-shell`, a stripped-down build that doesn't load
 * extensions. We sidestep it by passing `channel: 'chromium'` when
 * headless so the full Chromium binary runs (with `--headless=new` under
 * the hood). The offline suite defaults to headless so a local run
 * doesn't strobe the desktop with focus-stealing windows; live / compare /
 * demo stay headed for their own reasons (bot detection on real sites,
 * visible rendering for video capture).
 *
 * Per-test isolation: `serviceWorker` clears `chrome.storage.sync` (settings)
 * and `chrome.storage.local` (correction events) before re-seeding. Cookies
 * and sessionStorage are per-context, so a fresh context = no carryover.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, test as base } from '@playwright/test';
import type { BrowserContext, Page, TestInfo, Worker } from '@playwright/test';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { CorrectionEvent } from '@movar/events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the WXT production build of the Chrome extension. The
 *  `e2e:test:live` Nx target lists `extension:build` as a dependency, so
 *  by the time tests run this directory exists. */
export const EXTENSION_PATH = path.resolve(__dirname, '../../../extension/.output/chrome-mv3');

/** Settings the e2e suite stamps over `defaultSettings`. We turn
 *  `contentModification` on because the picker-filter and content-filter
 *  assertions are exactly what that flag gates. */
export const E2E_SETTINGS: MovarSettings = {
  ...defaultSettings,
  contentModification: true,
};

/** Per-test option knobs (no fixture lifetime — pure config). Specs opt
 *  in via `test.use({ browserUiLanguage: '<bcp47>' })` at file scope. */
export interface MovarOptions {
  /** Chromium UI language (`--lang=<value>`). Drives
   *  `browser.i18n.getUILanguage()`, the default `Accept-Language` Chrome
   *  would send absent Movar's DNR rule, and any locale-derived UI in the
   *  popup or options page. Defaults to `'en-US'` so existing snapshots
   *  stay stable; `russian-browser-lang.spec.ts` sets it to `'ru-RU'` to
   *  exercise the "user runs Movar in a Russian-language Chrome" path. */
  browserUiLanguage: string;
}

export interface MovarFixtures {
  /** Chromium context with Movar loaded; settings seeded to `E2E_SETTINGS`. */
  movarContext: BrowserContext;
  /** Chromium context WITHOUT Movar, for baseline ("what does the site look
   *  like to a user who never installed Movar") assertions. */
  cleanContext: BrowserContext;
  /** Fresh page in `movarContext`. */
  movarPage: Page;
  /** Fresh page in `cleanContext`. */
  cleanPage: Page;
  /** Movar's MV3 service worker. Use `.evaluate` to call extension APIs:
   *  read correction events, mutate settings, drive the message bus. */
  serviceWorker: Worker;
  /** Random per-launch extension ID parsed from the service-worker URL. Use to
   *  build `chrome-extension://<id>/popup.html` / `options.html` URLs in tests
   *  that navigate to internal extension surfaces. */
  extensionId: string;
  /** Convenience: returns CorrectionEvents Movar recorded for `domain`. */
  getCorrections: (domain: string) => Promise<CorrectionEvent[]>;
  /** Convenience: stamp a partial settings update into `chrome.storage.sync`. */
  setMovarSettings: (patch: Partial<MovarSettings>) => Promise<void>;
  /** Read `chrome.storage.sync.settings` from the SW context. Returns the
   *  full MovarSettings shape; behavior tests use this to assert that a
   *  click round-tripped through `persistSettings`. Returns `undefined` if
   *  settings have never been written — a clear signal of seed failure. */
  readMovarSettings: () => Promise<MovarSettings | undefined>;
}

/** Translate the Playwright-level `headless` value into launch options.
 *  When headless, force the `chromium` channel — Playwright's default
 *  headless binary is `chromium-headless-shell`, a stripped-down build
 *  that doesn't load MV3 extensions. In headed mode we leave channel
 *  unset so the existing rendering path is unchanged. */
function launchOptsFor(headless: boolean): { headless: boolean; channel?: 'chromium' } {
  return headless ? { headless: true, channel: 'chromium' } : { headless: false };
}

/** How long to wait for Chrome to (re)start the extension service worker.
 *  Deliberately decoupled from the project-wide `actionTimeout` (5s in the
 *  offline config): that budget is sized for UI actions, and under machine
 *  load a cold SW boot can blow through it (observed as
 *  `browserContext.waitForEvent: Timeout 5000ms exceeded`). Kept well under
 *  the 30s test timeout so a genuine no-show still fails with a pointed
 *  error inside the test. */
const SW_EVENT_TIMEOUT_MS = 15_000;

/** Budget for the storage clear+seed evaluate against one SW instance. A
 *  healthy worker answers in milliseconds; a worker Chrome is mid-teardown
 *  can leave the call hanging with no error at all, so we cut it short and
 *  retry instead of eating the whole test timeout (observed as `Test timeout
 *  of 30000ms exceeded while setting up "serviceWorker"`). */
const SW_SEED_EVALUATE_TIMEOUT_MS = 5_000;

/** Chrome tears down and restarts MV3 service workers at will right after
 *  install — more often on a loaded machine. One restart mid-seed happens in
 *  the wild; three consecutive dead instances means something is actually
 *  broken and retrying would just mask it. */
const SW_SEED_ATTEMPTS = 3;

/** Raised when a seed evaluate exceeds its deadline — treated like a dead
 *  worker (re-acquire and retry) rather than a test failure. */
class SwEvaluateTimeoutError extends Error {}

/** Wait for the MV3 service worker to be registered. `launchPersistentContext`
 *  can return before the SW is up; Playwright emits a `serviceworker` event
 *  once it boots. Chrome can also tear a just-installed SW down and restart
 *  it, so prefer the *newest* listed instance (old and new can coexist in
 *  the list for a moment) and skip instances the caller already saw die
 *  (the list can lag the teardown). */
async function waitForServiceWorker(
  context: BrowserContext,
  deadWorkers: ReadonlySet<Worker> = new Set(),
): Promise<Worker> {
  const live = context.serviceWorkers().filter((w) => !deadWorkers.has(w));
  const newest = live.at(-1);
  if (newest) return newest;
  return context.waitForEvent('serviceworker', { timeout: SW_EVENT_TIMEOUT_MS });
}

/** Race `promise` against a deadline. On deadline, throws
 *  `SwEvaluateTimeoutError` and marks the abandoned promise handled so its
 *  eventual rejection (typically when the context closes) can't surface as
 *  an unhandled rejection. */
async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new SwEvaluateTimeoutError(`${label} did not settle within ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
    // `allSettled` subscribes to the promise, which is all "mark handled"
    // takes — no empty `.catch(() => {})` for lint to argue about.
    void Promise.allSettled([promise]);
  }
}

/** True for errors that mean "this SW instance is gone or unresponsive"
 *  (Chrome tore it down mid-call) as opposed to a real failure inside the
 *  evaluated code. Playwright's phrasing varies by version and by how far
 *  the teardown got when the call failed, hence the fragment list. */
function isDeadWorkerError(error: unknown): boolean {
  if (error instanceof SwEvaluateTimeoutError) return true;
  return (
    error instanceof Error &&
    /Target page, context or browser has been closed|Target closed|Session closed|Execution context was destroyed/.test(
      error.message,
    )
  );
}

/** Acquire the current SW instance and reset extension storage for the test:
 *  clear `chrome.storage.sync` (settings) and `chrome.storage.local`
 *  (correction events), then seed `E2E_SETTINGS`. `storage.sync` falls back
 *  to local when there's no signed-in profile, so clearing both covers
 *  either backend.
 *
 *  Retries because the worker returned by `waitForServiceWorker` can be one
 *  Chrome is already tearing down: the evaluate then rejects with
 *  "Target ... closed" — or just hangs. Both get the same treatment:
 *  re-acquire the live instance and re-run the (idempotent) seed. An
 *  instance that died with an explicit closed error is excluded from
 *  re-acquisition; a deadline timeout doesn't exclude, so a healthy but
 *  CPU-starved worker gets another chance. Returns the worker that served
 *  the seed so downstream fixtures hold a live reference. */
async function seedServiceWorker(context: BrowserContext): Promise<Worker> {
  const deadWorkers = new Set<Worker>();
  let lastError: unknown;
  for (let attempt = 1; attempt <= SW_SEED_ATTEMPTS; attempt++) {
    const sw = await waitForServiceWorker(context, deadWorkers);
    try {
      await withDeadline(
        sw.evaluate(async (settings: MovarSettings) => {
          await chrome.storage.sync.clear();
          await chrome.storage.local.clear();
          await chrome.storage.sync.set({ settings });
        }, E2E_SETTINGS),
        SW_SEED_EVALUATE_TIMEOUT_MS,
        `service-worker storage seed (attempt ${attempt}/${SW_SEED_ATTEMPTS})`,
      );
      return sw;
    } catch (error) {
      if (!isDeadWorkerError(error)) throw error;
      if (!(error instanceof SwEvaluateTimeoutError)) deadWorkers.add(sw);
      lastError = error;
    }
  }
  throw new Error(
    `serviceWorker fixture: storage seed failed after ${SW_SEED_ATTEMPTS} attempts against restarting service workers`,
    { cause: lastError },
  );
}

/** Derive the per-test `recordVideo` config for `launchPersistentContext`.
 *
 *  Playwright's project-level `use.video` only attaches to contexts
 *  Playwright creates itself. `launchPersistentContext` (the only path
 *  that loads MV3 extensions) is launched by *our* fixture, so the video
 *  option has to be threaded in explicitly. This reads the project's
 *  `video` config from `testInfo` and translates it to the launch shape;
 *  returns `undefined` when video is off, which is the assertion-suite
 *  default and keeps that path zero-cost.
 *
 *  Always-on or `retain-on-failure` recording mode both produce a video
 *  file under `testInfo.outputDir`; the difference is enforced by
 *  Playwright's reporter when it decides whether to keep it. The demo
 *  recording suite (`playwright.demo.config.ts`) uses `mode: 'on'`. */
function videoOptionsFromTestInfo(
  testInfo: TestInfo,
): { dir: string; size?: { width: number; height: number } } | undefined {
  const videoConfig = testInfo.project.use.video;
  if (videoConfig == null) return undefined;
  const mode = typeof videoConfig === 'string' ? videoConfig : videoConfig.mode;
  if (mode === 'off') return undefined;
  const size = typeof videoConfig === 'object' ? videoConfig.size : undefined;
  return { dir: testInfo.outputDir, ...(size && { size }) };
}

export const test = base.extend<MovarFixtures, MovarOptions>({
  // Default — `'en-US'` mirrors the long-standing fixture behaviour, so
  // every existing spec keeps its English-locale baseline unchanged. The
  // `option: true` marker tells Playwright this is a worker-scoped option
  // a spec can override via `test.use({ browserUiLanguage: '...' })`.
  browserUiLanguage: ['en-US', { option: true, scope: 'worker' }],

  movarContext: async ({ headless, browserUiLanguage }, use, testInfo) => {
    const recordVideo = videoOptionsFromTestInfo(testInfo);
    const context = await chromium.launchPersistentContext('', {
      ...launchOptsFor(headless),
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Headed Chromium in CI/automation often has GPU warnings; keep them
        // out of the trace. Doesn't affect rendering for our purposes.
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Lock the browser UI language so anything that depends on it is
        // deterministic across runners. The popup's "Auto (English)"
        // LanguageSelector label, the popup's locale-aware date formatting,
        // and any `Accept-Language`-derived behaviour all read this. Live
        // tests are unaffected — sites geolocate by IP, not by this flag.
        // Specs opt into a different locale via `test.use({ browserUiLanguage })`.
        `--lang=${browserUiLanguage}`,
      ],
      // Locks per-test rendering across runners: same CSS pixels regardless
      // of whether the host display is 1x or 2x. Live tests don't snapshot,
      // so this is purely belt-and-braces there; popup-snapshot tests
      // depend on it.
      deviceScaleFactor: 1,
      ...(recordVideo && { recordVideo }),
    });
    await use(context);
    await context.close();
  },

  cleanContext: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext('', {
      ...launchOptsFor(headless),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ movarContext }, use) => {
    // Reset + seed storage, retrying across MV3 service-worker restarts —
    // see `seedServiceWorker` for the failure modes this absorbs.
    await use(await seedServiceWorker(movarContext));
  },

  extensionId: async ({ serviceWorker }, use) => {
    // Service-worker URL is `chrome-extension://<id>/background.js`. The id is
    // generated per-launch (no pinned `key` in the manifest), so we parse it
    // off the live worker instead of hard-coding. Throws on shape mismatch —
    // a non-chrome-extension SW URL means our fixture assumptions broke and
    // the test wouldn't be exercising what its name claims.
    const match = /^chrome-extension:\/\/([^/]+)\//.exec(serviceWorker.url());
    const id = match?.[1];
    if (id == null) {
      throw new Error(
        `extensionId fixture: service-worker URL doesn't match chrome-extension://<id>/* — got ${serviceWorker.url()}`,
      );
    }
    await use(id);
  },

  setMovarSettings: async ({ serviceWorker }, use) => {
    const fn = async (patch: Partial<MovarSettings>): Promise<void> => {
      await serviceWorker.evaluate(
        async ({ patch: p, base: b }: { patch: Partial<MovarSettings>; base: MovarSettings }) => {
          const stored = await chrome.storage.sync.get('settings');
          const current = (stored['settings'] as MovarSettings | undefined) ?? b;
          await chrome.storage.sync.set({ settings: { ...current, ...p } });
        },
        { patch, base: E2E_SETTINGS },
      );
    };
    await use(fn);
  },

  getCorrections: async ({ serviceWorker }, use) => {
    const fn = async (domain: string): Promise<CorrectionEvent[]> => {
      const all = await serviceWorker.evaluate(async () => {
        const data = await chrome.storage.local.get('movar:events');
        return (data['movar:events'] as CorrectionEvent[] | undefined) ?? [];
      });
      return all.filter((e) => e.domain === domain);
    };
    await use(fn);
  },

  readMovarSettings: async ({ serviceWorker }, use) => {
    const fn = async (): Promise<MovarSettings | undefined> => {
      return serviceWorker.evaluate(async () => {
        const data = await chrome.storage.sync.get('settings');
        return data['settings'] as MovarSettings | undefined;
      });
    };
    await use(fn);
  },

  movarPage: async ({ movarContext, serviceWorker: _seedingDep }, use) => {
    // The `serviceWorker` fixture seeds settings as a side effect. We list
    // it here as a no-op dep to guarantee seeding completes before the
    // test gets a page — otherwise the first navigation can race the
    // content script's initial settings read.
    const page = await movarContext.newPage();
    await use(page);
    await page.close();
  },

  cleanPage: async ({ cleanContext }, use) => {
    const page = await cleanContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
