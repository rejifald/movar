/* eslint-disable @typescript-eslint/no-magic-numbers, sonarjs/no-os-command-from-path -- launch flags/timeouts inline on purpose; certutil is looked up on PATH */
/**
 * Chrome for Testing, headed, with the real Movar build loaded unpacked.
 *
 * Branded Chrome ignores `--load-extension` since 137; Chrome for Testing does
 * not. The binary is Playwright's (its `chromium` IS Chrome for Testing, version
 * pinned by the lockfile's Playwright) unless `--chrome <path>` names another.
 * Playwright only drives the page; the window is a plain headed browser with
 * the automation infobar switched off.
 *
 * Trust for the mock CA: on Linux an NSS database in a throwaway $HOME (Chrome
 * reads `$HOME/.pki/nssdb`), so the lock is the normal one. Elsewhere (a local
 * macOS mechanics check, viewport only) certificate errors are ignored over the
 * DevTools protocol rather than touching the keychain; such an omnibox would
 * read "Not secure", which is why only Linux captures windows.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { defaultSettings } from '@movar/settings';
import { REPO_ROOT } from '../build';
import { out } from '../sh';
import type { DomDriver } from './dom-shots';
import { WINDOW } from './geometry';
import type { DesktopLocale } from './locale';
import { chromePreferences, unpackedExtensionId } from './profiles';

interface PwPage {
  goto(url: string, options: { waitUntil: 'commit'; timeout: number }): Promise<unknown>;
  evaluate<T>(expression: string): Promise<T>;
  url(): string;
  mouse: { click(x: number, y: number): Promise<void> };
  screenshot(options: { path: string }): Promise<unknown>;
  bringToFront(): Promise<void>;
  close(): Promise<void>;
}
interface PwContext {
  pages(): PwPage[];
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
  browser(): { version(): string } | null;
}
interface PwChromium {
  executablePath(): string;
  launchPersistentContext(dir: string, options: Record<string, unknown>): Promise<PwContext>;
}

/** Playwright, borrowed from apps/e2e (this package does not depend on it). */
function playwrightChromium(): PwChromium {
  const require = createRequire(path.join(REPO_ROOT, 'apps/e2e/package.json'));
  // eslint-disable-next-line import-x/no-extraneous-dependencies -- resolved from apps/e2e on purpose: one Playwright (and one pinned Chrome for Testing) for the repo
  return (require('@playwright/test') as { chromium: PwChromium }).chromium;
}

export interface ChromeLaunch {
  readonly locale: DesktopLocale;
  readonly proxyPort: number;
  readonly caCertPath: string;
  /** Unpacked extension directory, or null for the before pass (not installed). */
  readonly extension: string | null;
  readonly executable?: string;
}

function trustSetup(
  caCertPath: string,
  home: string,
): { env: NodeJS.ProcessEnv; ignoreHTTPSErrors: boolean } {
  if (process.platform !== 'linux') return { env: {}, ignoreHTTPSErrors: true };
  const db = path.join(home, '.pki/nssdb');
  mkdirSync(db, { recursive: true });
  out('certutil', ['-N', '-d', `sql:${db}`, '--empty-password']);
  out('certutil', [
    '-A',
    '-d',
    `sql:${db}`,
    '-n',
    'Movar store-listing mock CA',
    '-t',
    'C,,',
    '-i',
    caCertPath,
  ]);
  return { env: { HOME: home }, ignoreHTTPSErrors: false };
}

/** Seed Movar's settings through its options page (shares `chrome.storage` with the worker). */
async function seedSettings(context: PwContext, extensionId: string): Promise<void> {
  const settings = { ...defaultSettings, contentModification: true };
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'commit',
    timeout: 30_000,
  });
  const ok = await page.evaluate<boolean>(`(async () => {
    for (let i = 0; i < 200 && typeof chrome?.storage?.sync === 'undefined'; i++) await new Promise((r) => setTimeout(r, 25));
    for (let i = 0; i < 80; i++) {
      const got = await chrome.storage.sync.get('settings');
      if (got.settings !== undefined) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const s = ${JSON.stringify(settings)};
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ settings: s });
    await new Promise((r) => setTimeout(r, 150));
    await chrome.storage.sync.set({ settings: s });
    const back = await chrome.storage.sync.get('settings');
    return back.settings?.contentModification === true;
  })()`);
  await page.close();
  if (!ok) throw new Error('chrome: Movar settings did not persist');
}

export async function launchChrome(opts: ChromeLaunch): Promise<DomDriver> {
  const chromium = playwrightChromium();
  const root = mkdtempSync(path.join(tmpdir(), 'movar-desktop-chrome-'));
  const userData = path.join(root, 'profile');
  const home = path.join(root, 'home');
  mkdirSync(path.join(userData, 'Default'), { recursive: true });
  mkdirSync(home, { recursive: true });

  const extension = opts.extension === null ? null : realpathSync(opts.extension);
  const extensionId = extension === null ? null : unpackedExtensionId(extension);
  writeFileSync(
    path.join(userData, 'Default/Preferences'),
    JSON.stringify(chromePreferences(opts.locale, extensionId)),
  );
  // Answers the "first run" questions before the first launch.
  writeFileSync(path.join(userData, 'First Run'), '');
  const trust = trustSetup(opts.caCertPath, home);

  const context = await chromium.launchPersistentContext(userData, {
    headless: false,
    viewport: null,
    executablePath: opts.executable ?? chromium.executablePath(),
    // No "controlled by automated test software" infobar; extensions allowed.
    ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
    env: { ...process.env, LANGUAGE: opts.locale.chromeLang, ...trust.env },
    args: [
      `--window-size=${WINDOW.width},${WINDOW.height}`,
      '--window-position=0,0',
      `--lang=${opts.locale.chromeLang}`,
      `--accept-lang=${opts.locale.acceptLanguages}`,
      `--proxy-server=http://127.0.0.1:${opts.proxyPort}`,
      '--test-type',
      '--disable-features=Translate,TranslateUI,MediaRouter,OptimizationHints,PrivacySandboxSettings4',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
      '--force-device-scale-factor=1',
      ...(extension === null
        ? []
        : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]),
    ],
    ignoreHTTPSErrors: trust.ignoreHTTPSErrors,
  });

  if (extensionId !== null) {
    await seedSettings(context, extensionId);
    // Movar opens its onboarding tab on install; give it a moment, then close it.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const [page, ...rest] = context.pages();
  const main = page ?? (await context.newPage());
  for (const extra of rest) await extra.close();
  await main.bringToFront();

  const closeOthers = async (): Promise<void> => {
    for (const p of context.pages()) if (p !== main) await p.close();
  };

  return {
    browser: 'chrome',
    version: context.browser()?.version() ?? 'chrome-for-testing',
    async goto(url) {
      await closeOthers();
      await main.goto(url, { waitUntil: 'commit', timeout: 60_000 });
    },
    evaluate: async <T>(expression: string) => main.evaluate<T>(expression),
    clickAt: async (x, y) => main.mouse.click(x, y),
    async screenshotViewport(file) {
      await main.screenshot({ path: file });
    },
    async close() {
      await context.close().catch(() => null); // the browser may already be gone
      rmSync(root, { recursive: true, force: true });
    },
  };
}
