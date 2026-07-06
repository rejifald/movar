/*
 * Capture the REAL Movar host-app UI (the Detector / Settings / About screens the
 * Safari wrapper's WKWebView shows) as App Store screenshots for the iOS + iPadOS
 * listings.
 *
 * Why this is a SEPARATE script from `capture-storybook-assets.mts`:
 *   The marketplace scenes there are extension-in-Safari mockups rendered from the
 *   EXTENSION's Storybook — the popup composed over fictitious sites, before/after
 *   diptychs. The host app is a different thing: a viewport-owning React app
 *   (`@movar/safari-host-app`) that owns `html`/`body` with `position: fixed` bars
 *   and `100dvh`, so it can't be scaled inside a Storybook frame without breaking
 *   its layout. Instead we load its REAL built bundle (`dist/index.html`) at each
 *   device's logical size × scale factor and screenshot it FULL-BLEED — the most
 *   faithful "actual app UI" shot, with the real iOS Dynamic-Type CSS in play.
 *
 * Recipe mirrors the e2e host fixture (`apps/e2e/src/fixtures/host.ts`): same
 * `webkit` bridge mock + `show()` drive + `navigator.language` pin, installed in an
 * init script BEFORE the bundle evals (the timing `bridge.ts` documents). The only
 * differences are the device viewport + scale factor and that we write to
 * `store-assets/screenshots/{ios,ipad}/` instead of a test baseline.
 *
 * Requires the host-app bundle built first (its `dist/` is gitignored):
 *   pnpm --filter @movar/safari-host-app build:bundle
 *
 * On-demand only; not wired into `verify:release`.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import sharp from 'sharp';
import { defaultSettings, type MovarSettings } from '@movar/settings';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
/** The built single-file bundle the WKWebView loads; `safari-host-app:build`
 *  (or `build:bundle`) emits it. Loaded over `file://` with the sibling
 *  `./host-app.{js,css}` resolved via `--allow-file-access-from-files`. */
const HOST_APP_INDEX = path.resolve(extensionRoot, '..', 'safari-host-app', 'dist', 'index.html');
const SCREENSHOTS_DIR = path.resolve(extensionRoot, 'store-assets', 'screenshots');

/**
 * App Store portrait device pixels = logical size × scale factor. Both the iOS
 * and iPadOS listings run the SAME universal iOS binary, so both drive
 * `show('ios')` (the About tab shows the iOS "Settings ▸ Safari ▸ Extensions"
 * enable path on iPad too).
 *   - iPhone 6.9″: 440×956 logical @3× → 1320×2868
 *   - iPad 13″:   1024×1366 logical @2× → 2048×2732
 */
const DEVICES = [
  { dir: 'ios', width: 440, height: 956, dsf: 3 },
  { dir: 'ipad', width: 1024, height: 1366, dsf: 2 },
] as const;

const LOCALES = [
  { tag: 'en-US', dir: 'en' },
  { tag: 'uk-UA', dir: 'uk' },
] as const;

/** The screen the shot shows + its numbered filename. About = brand lede +
 *  "What Movar does" + the Settings ▸ Safari ▸ Extensions enable path — the
 *  richest single "this is the app" screen, and the visible 4.2 evidence. */
const SCENE = { tab: 'about', index: 8, slug: 'host-app-about' } as const;

/** The `MovarSettings` the bridge mock returns for `readSettings` — only the
 *  Settings tab reads it; About/Detector don't, but we supply a realistic record
 *  so a future Settings scene needs no change here. Mirrors the e2e fixture. */
const HOST_SETTINGS: MovarSettings = {
  ...defaultSettings,
  enabled: true,
  priority: ['uk', 'en', 'pl'],
  blocked: ['ru'],
  allowlist: ['example.com'],
  contentModification: true,
  concealMode: 'curtain',
  uiLanguage: 'auto',
};

/** `file://` URL for the bundle, each segment encoded so a space / unicode char
 *  in the repo path (the `.claude/worktrees/…` tree) stays valid. */
function hostAppUrl(): string {
  return `file://${HOST_APP_INDEX.split(path.sep).map(encodeURIComponent).join('/')}`;
}

async function captureOne(
  context: BrowserContext,
  device: (typeof DEVICES)[number],
  locale: (typeof LOCALES)[number],
): Promise<void> {
  const page = await context.newPage();

  // Init script (runs before the bundle's module eval): pin the device language
  // and install the mocked native bridge, so `resolveLocale` sees the locale and
  // `window.show` / `window.__movarReply` are installed against a present
  // `globalThis.webkit`.
  await page.addInitScript(
    ({ settings, locale: lang }: { settings: MovarSettings; locale: string }) => {
      Object.defineProperty(navigator, 'language', { value: lang, configurable: true });
      (globalThis as { webkit?: unknown }).webkit = {
        messageHandlers: {
          controller: {
            postMessage: (message: { type: string; id: number }) => {
              const reply = message.type === 'readSettings' ? JSON.stringify({ settings }) : null;
              setTimeout(() => {
                (
                  globalThis as { __movarReply?: (id: number, json: string | null) => void }
                ).__movarReply?.(message.id, reply);
              }, 0);
            },
          },
        },
      };
    },
    { settings: HOST_SETTINGS, locale: locale.tag },
  );

  await page.goto(hostAppUrl());
  await page.waitForSelector('.tabs', { state: 'attached' });
  // Drive the native state the way Swift does after `didFinish` — `show('ios')`
  // sets the platform (About enablement banner + `html/body.platform-ios`, which
  // is also what anchors the iOS Dynamic-Type root).
  await page.evaluate(() => {
    (globalThis as { show?: (platform: string) => void }).show?.('ios');
  });
  await page.locator(`.tab[data-tab="${SCENE.tab}"]`).click();
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}`,
  });
  await page.evaluate(async () => document.fonts.ready);

  // `scale: 'device'` → the PNG is viewport × deviceScaleFactor (the exact App
  // Store device px). Flatten alpha so the file is 24-bit no-alpha, matching the
  // rest of the store set (Apple rejects screenshots with an alpha channel).
  const raw = await page.screenshot({ type: 'png', scale: 'device' });
  const outDir = path.resolve(SCREENSHOTS_DIR, device.dir, locale.dir);
  await mkdir(outDir, { recursive: true });
  const outPath = path.resolve(outDir, `${String(SCENE.index).padStart(2, '0')}-${SCENE.slug}.png`);
  await sharp(raw).flatten({ background: '#ffffff' }).png().toFile(outPath);
  console.log(
    `  📸 ${device.dir}/${locale.dir} (${device.width * device.dsf}×${device.height * device.dsf}) → ${path.relative(extensionRoot, outPath)}`,
  );
  await page.close();
}

async function main(): Promise<void> {
  await stat(HOST_APP_INDEX).catch(() => {
    throw new Error(
      `Host-app bundle not found at ${HOST_APP_INDEX}. ` +
        'Build it first: pnpm --filter @movar/safari-host-app build:bundle',
    );
  });

  console.log('▶ Capturing host-app App Store screenshots (iOS + iPadOS)…');
  let browser: Browser | undefined;
  try {
    // Plain bundled Chromium (same binary the other store screenshots use), with
    // file-access so the bundle's sibling `./host-app.{js,css}` resolve.
    browser = await chromium.launch({
      args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    for (const device of DEVICES) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.dsf,
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      try {
        for (const locale of LOCALES) await captureOne(context, device, locale);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
  }
  console.log('✓ Done.');
}

await main();
