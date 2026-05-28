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
 * Why headed: Playwright's true-headless Chromium can't load MV3 extensions.
 * `playwright.config.ts` sets `headless: false`; this fixture inherits.
 *
 * Per-test isolation: `serviceWorker` clears `chrome.storage.sync` (settings)
 * and `chrome.storage.local` (correction events) before re-seeding. Cookies
 * and sessionStorage are per-context, so a fresh context = no carryover.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  type BrowserContext,
  chromium,
  test as base,
  type Page,
  type TestInfo,
  type Worker,
} from '@playwright/test';
import { defaultSettings, type CorrectionEvent, type MovarSettings } from '@movar/shared';

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
  /** Convenience: returns CorrectionEvents Movar recorded for `domain`. */
  getCorrections: (domain: string) => Promise<CorrectionEvent[]>;
  /** Convenience: stamp a partial settings update into `chrome.storage.sync`. */
  setMovarSettings: (patch: Partial<MovarSettings>) => Promise<void>;
}

/** Wait for the MV3 service worker to be registered. `launchPersistentContext`
 *  can return before the SW is up; Playwright emits a `serviceworker` event
 *  once it boots. */
async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing[0]) return existing[0];
  return await context.waitForEvent('serviceworker');
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
  if (!videoConfig) return undefined;
  const mode = typeof videoConfig === 'string' ? videoConfig : videoConfig.mode;
  if (!mode || mode === 'off') return undefined;
  const size = typeof videoConfig === 'object' ? videoConfig.size : undefined;
  return { dir: testInfo.outputDir, ...(size && { size }) };
}

export const test = base.extend<MovarFixtures>({
  movarContext: async ({ headless: _headless }, use, testInfo) => {
    const recordVideo = videoOptionsFromTestInfo(testInfo);
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Headed Chromium in CI/automation often has GPU warnings; keep them
        // out of the trace. Doesn't affect rendering for our purposes.
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      ...(recordVideo && { recordVideo }),
    });
    await use(context);
    await context.close();
  },

  cleanContext: async ({ headless: _headless }, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ movarContext }, use) => {
    const sw = await waitForServiceWorker(movarContext);
    // Reset between tests. `storage.sync` falls back to local when there's
    // no signed-in profile, so clearing both covers either backend.
    await sw.evaluate(async () => {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
    });
    // Seed the fixed e2e settings.
    await sw.evaluate(async (settings: MovarSettings) => {
      await chrome.storage.sync.set({ settings });
    }, E2E_SETTINGS);
    await use(sw);
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
