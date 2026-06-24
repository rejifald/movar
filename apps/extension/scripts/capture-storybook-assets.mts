/*
 * Capture every PNG deliverable that's sourced from the extension's
 * Storybook in a single pipeline run. Supersedes:
 *
 *   - `capture-store-screenshots.mts` (marketplace screenshot pass)
 *   - `generate-promo-tile.mts` (sharp + inline-SVG promo tile)
 *   - `capture-marketing-before-after.mts` (real google.com.ua SERPs)
 *
 * Story → output routing is driven by the story's title prefix and a
 * per-story `parameters.captureOutput` declaration. Three prefixes are
 * recognised:
 *
 *   `Marketplace/Screenshots/*` — per-locale store-listing screenshots.
 *     Uses the existing `{locale}/{NN}-{slug}.png` convention under
 *     `store-assets/screenshots/`; locale comes from the story name
 *     (`English` / `Ukrainian`), `NN` from `parameters.screenshotIndex`,
 *     `slug` from kebab-casing the scene title. No `captureOutput`
 *     needed.
 *
 *   `Marketplace/Promo/*` — single-PNG marketplace assets (promo tiles,
 *     etc.). Requires `parameters.captureOutput.path` relative to
 *     `store-assets/`. One story per scene; no English/Ukrainian split.
 *
 *   `Marketing/Screenshots/*` — single-PNG marketing-site assets that
 *     land in `apps/marketing/public/screenshots/`. Requires
 *     `parameters.captureOutput.path` relative to that directory.
 *
 * Viewport defaults to 1280×800 (the marketplace-screenshot canonical
 * size). Override per-story via `parameters.viewport: { width, height }`.
 *
 * Scenes that set `parameters.naturalHeight: true` (the before/after
 * website single-halves) capture at natural content height instead of a
 * fixed canvas, since the marketing page composes the pair at runtime.
 * Scenes that set `parameters.darkVariant: true` are captured twice —
 * once light, once under `prefers-color-scheme: dark` — and the dark
 * file gets a `-dark` suffix before `.png`.
 *
 * Pipeline mechanics:
 *
 *   1. `storybook build -o storybook-static` (unless `--no-build` is
 *      passed; useful when iterating locally against an already-built
 *      bundle).
 *   2. Spin up a tiny `node:http` static server on 127.0.0.1:4325.
 *   3. Read `storybook-static/index.json`; keep entries whose `title`
 *      starts with one of the recognised prefixes and whose `tags` do
 *      not include `skip-capture`.
 *   4. For each surviving entry: read `parameters` through the running
 *      preview's storyStore API, launch Playwright Chromium at the
 *      story's viewport (`colorScheme: 'light'`, `reducedMotion:
 *      'reduce'`), navigate to `iframe.html?viewMode=story&id=…`, await
 *      `document.fonts.ready` and a network-idle settle, then
 *      `page.screenshot()` to PNG.
 *   5. Tear everything down. On any error, the script exits non-zero
 *      and Playwright + the static server are cleaned up via
 *      finally-blocks so a CI run never strands a port.
 *
 * Not added to `verify:release` — on-demand only.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const storybookStaticDir = path.resolve(extensionRoot, 'storybook-static');
const indexJsonPath = path.resolve(storybookStaticDir, 'index.json');

const STORE_ASSETS_DIR = path.resolve(extensionRoot, 'store-assets');
const MARKETPLACE_SCREENSHOTS_DIR = path.resolve(STORE_ASSETS_DIR, 'screenshots');
// App Store portrait screenshots live under per-device subtrees so they
// never collide with the landscape CWS/AMO set in `screenshots/{en,uk}/`.
const IOS_SCREENSHOTS_DIR = path.resolve(MARKETPLACE_SCREENSHOTS_DIR, 'ios');
const IPAD_SCREENSHOTS_DIR = path.resolve(MARKETPLACE_SCREENSHOTS_DIR, 'ipad');
const MARKETING_SCREENSHOTS_DIR = path.resolve(
  extensionRoot,
  '..',
  'marketing',
  'public',
  'screenshots',
);

const PREFIX_MARKETPLACE_SCREENSHOTS = 'Marketplace/Screenshots/';
const PREFIX_MARKETPLACE_IOS = 'Marketplace/IOSScreenshots/';
const PREFIX_MARKETPLACE_IPAD = 'Marketplace/IPadScreenshots/';
const PREFIX_MARKETPLACE_PROMO = 'Marketplace/Promo/';
const PREFIX_MARKETING_SCREENSHOTS = 'Marketing/Screenshots/';
const RECOGNISED_PREFIXES = [
  PREFIX_MARKETPLACE_SCREENSHOTS,
  PREFIX_MARKETPLACE_IOS,
  PREFIX_MARKETPLACE_IPAD,
  PREFIX_MARKETPLACE_PROMO,
  PREFIX_MARKETING_SCREENSHOTS,
] as const;

/** Locale-mapped screenshot prefixes → their output root. All three share
 *  the `{locale}/{NN}-{slug}.png` convention; only the base dir differs. */
const LOCALE_SCREENSHOT_ROOTS: Partial<Record<string, string>> = {
  [PREFIX_MARKETPLACE_SCREENSHOTS]: MARKETPLACE_SCREENSHOTS_DIR,
  [PREFIX_MARKETPLACE_IOS]: IOS_SCREENSHOTS_DIR,
  [PREFIX_MARKETPLACE_IPAD]: IPAD_SCREENSHOTS_DIR,
};

const STATIC_PORT = 4325;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;
const SKIP_CAPTURE_TAG = 'skip-capture';

const shouldBuild = !process.argv.includes('--no-build');
/** `--only=<title-prefix>` restricts the capture to stories whose title
 *  starts with the given string (e.g. `Marketplace/IOSScreenshots/`), so
 *  iterating on one scene doesn't rewrite every committed PNG. */
const ONLY_PREFIX = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(
  '--only='.length,
);

interface StorybookIndexEntry {
  id: string;
  title: string;
  name: string;
  type: 'story' | 'docs';
  tags?: string[];
}

interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookIndexEntry>;
}

interface CaptureOutputParam {
  /** Path relative to the prefix's output root. */
  path: string;
}

interface ViewportParam {
  width: number;
  height: number;
}

interface StoryParameters {
  screenshotIndex?: number;
  viewport?: ViewportParam;
  captureOutput?: CaptureOutputParam;
  /** Capture a second `-dark` PNG under prefers-color-scheme: dark. */
  darkVariant?: boolean;
  /** Capture at natural content height instead of clipping to the
   *  viewport (opt-in; for the before/after website single-halves). */
  naturalHeight?: boolean;
}

const LOCALE_BY_STORY_NAME: Record<string, 'en' | 'uk'> = {
  English: 'en',
  Ukrainian: 'uk',
};

function kebabCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** Dark-variant sibling of a PNG path: `foo.png` → `foo-dark.png`. */
function darkenPath(p: string): string {
  return p.replace(/\.png$/i, '-dark.png');
}

async function buildStorybook(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['build-storybook'], {
      cwd: extensionRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`storybook build exited with code ${code ?? 'null'}`));
    });
    child.on('error', reject);
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function startStaticServer(root: string, port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const rawPath = decodeURI((req.url ?? '/').split('?')[0] ?? '/');
    const target = path.resolve(root, '.' + rawPath);
    const rel = path.relative(root, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    void (async () => {
      try {
        const info = await stat(target);
        if (info.isDirectory()) {
          const indexPath = path.join(target, 'index.html');
          const indexStat = await stat(indexPath);
          if (!indexStat.isFile()) {
            res.writeHead(404).end('not found');
            return;
          }
          res.writeHead(200, { 'content-type': MIME['.html'] ?? 'application/octet-stream' });
          createReadStream(indexPath).pipe(res);
          return;
        }
        const ext = path.extname(target).toLowerCase();
        res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
        createReadStream(target).pipe(res);
      } catch {
        res.writeHead(404).end('not found');
      }
    })();
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** A popup-bearing scene whose popup overflows the capture canvas. */
interface ClipViolation {
  /** `story-id → output.png` for the log + annotation. */
  label: string;
  /** Which edge(s) overflow, with the overrun in px. */
  detail: string;
}

/** Selector for the real popup root — `App` tags it with this (see
 *  `src/entrypoints/popup/App.tsx`). Scenes that don't embed the popup
 *  (the diptychs, the options page) have no such element and are skipped. */
const POPUP_ROOT_SELECTOR = '[data-testid="popup-root"]';
/** Sub-pixel slack so honest rounding doesn't trip the guard. */
const CLIP_TOLERANCE_PX = 1.5;

/**
 * Drift guard: assert the real popup isn't clipped by the capture canvas.
 *
 * When the production popup grows (e.g. the conceal-mode picker landed under
 * the content filter) the fixed-size frames that embed it can crop it — the
 * header off the top, the footer off the bottom. This is geometry, not
 * `scrollHeight`: every frame clips the popup via an ancestor `overflow:
 * hidden` and usually a CSS `transform: scale()`, so the popup's own
 * scroll/client heights stay equal even when it spills past the canvas. We
 * compare the popup's on-screen bounding box (post-transform, where it actually
 * lands) against the viewport instead. Returns `null` for non-popup scenes and
 * for popups that fit.
 */
async function checkPopupClip(
  page: Page,
  viewport: ViewportParam,
  label: string,
): Promise<ClipViolation | null> {
  const box = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
  }, POPUP_ROOT_SELECTOR);
  if (!box) return null;

  const overruns: string[] = [];
  if (box.top < -CLIP_TOLERANCE_PX) overruns.push(`top clipped by ${Math.round(-box.top)}px`);
  if (box.left < -CLIP_TOLERANCE_PX) overruns.push(`left clipped by ${Math.round(-box.left)}px`);
  if (box.bottom > viewport.height + CLIP_TOLERANCE_PX) {
    overruns.push(`bottom clipped by ${Math.round(box.bottom - viewport.height)}px`);
  }
  if (box.right > viewport.width + CLIP_TOLERANCE_PX) {
    overruns.push(`right clipped by ${Math.round(box.right - viewport.width)}px`);
  }
  return overruns.length === 0 ? null : { label, detail: overruns.join(', ') };
}

async function captureStory(
  browser: Browser,
  entry: StorybookIndexEntry,
  viewport: ViewportParam,
  outPath: string,
  options: { colorScheme: 'light' | 'dark'; fullHeight: boolean },
): Promise<ClipViolation | null> {
  const { colorScheme, fullHeight } = options;
  // deviceScaleFactor: 2 + scale: 'css' = retina-quality rasterisation
  // downsampled back to viewport pixels. The PNG dimensions stay
  // exactly `viewport.width × viewport.height` (CWS/AMO accept only
  // 1280×800 or 640×400 for marketplace screenshots), but the
  // captured image is rendered at 2× pixel density and downsampled
  // by Chromium with proper resampling — text and edges are
  // visibly sharper than at deviceScaleFactor: 1 (the previous
  // setting), where the `transform: scale(0.727)` inside the
  // diptych frame produced soft fractional-pixel glyph rasters.
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    colorScheme,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const url = `http://127.0.0.1:${STATIC_PORT}/iframe.html?viewMode=story&id=${encodeURIComponent(
      entry.id,
    )}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('#storybook-root', { state: 'attached' });
    await mkdir(path.dirname(outPath), { recursive: true });
    // Marketing single-halves: capture the story root at its natural
    // rendered height instead of clipping to the viewport. Width stays
    // the viewport width (authentic site layout); height follows the
    // content. Playwright captures the full element even when it
    // overflows the viewport. `scale: 'css'` still downsamples the 2×
    // raster to CSS-pixel dimensions.
    await (fullHeight
      ? page.locator('#storybook-root').screenshot({
          path: outPath,
          type: 'png',
          scale: 'css',
          animations: 'disabled',
        })
      : page.screenshot({
          path: outPath,
          type: 'png',
          fullPage: false,
          // Stories are opaque (preview.css enforces a `--bg` paint), so
          // omitting alpha keeps PNGs 24-bit — what social/store crawlers
          // and the Chrome Web Store both expect.
          omitBackground: false,
          // `scale: 'css'` emits at CSS-pixel dimensions even though we
          // render at 2× device pixels — see deviceScaleFactor comment.
          scale: 'css',
        }));
    // Verify the popup (if this scene embeds one) sits inside the canvas. Run
    // it against the same settled DOM the screenshot captured, but only for
    // the clip-prone fixed-canvas captures — `fullHeight` scenes grow with
    // their content and have no popup anyway.
    return fullHeight
      ? null
      : await checkPopupClip(
          page,
          viewport,
          `${entry.id} → ${path.relative(extensionRoot, outPath)}`,
        );
  } finally {
    await context.close();
  }
}

async function getStoryParameters(
  browser: Browser,
  entry: StorybookIndexEntry,
): Promise<StoryParameters> {
  // Storybook 10's `index.json` strips `parameters`; reach into the
  // running preview's storyStore via the `__STORYBOOK_PREVIEW__` global
  // to read them. One context per entry keeps the script declarative —
  // adding a new captureOutput or viewport on a story is the only
  // change required to onboard a new scene.
  const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
  try {
    const page = await context.newPage();
    const url = `http://127.0.0.1:${STATIC_PORT}/iframe.html?viewMode=story&id=${encodeURIComponent(
      entry.id,
    )}`;
    await page.goto(url, { waitUntil: 'load' });
    const handle = await page.waitForFunction(
      async (storyId: string) => {
        const preview = (globalThis as unknown as { __STORYBOOK_PREVIEW__?: unknown })
          .__STORYBOOK_PREVIEW__;
        if (!preview) return null;
        interface StoryLike {
          parameters?: Record<string, unknown>;
        }
        interface StoreLike {
          loadStory?: (args: { storyId: string }) => Promise<StoryLike>;
        }
        interface PreviewLike {
          storyStore?: StoreLike;
          storyStoreValue?: StoreLike;
        }
        const previewTyped = preview as PreviewLike;
        const store = previewTyped.storyStore ?? previewTyped.storyStoreValue;
        if (!store?.loadStory) return null;
        try {
          const story = await store.loadStory({ storyId });
          return story.parameters ?? {};
        } catch {
          return null;
        }
      },
      entry.id,
      { timeout: 10_000 },
    );
    const raw = (await handle.jsonValue()) as Record<string, unknown> | null;
    if (!raw) return {};
    const result: StoryParameters = {};
    if (typeof raw['screenshotIndex'] === 'number') {
      result.screenshotIndex = raw['screenshotIndex'];
    }
    const vp = raw['viewport'];
    if (
      vp &&
      typeof vp === 'object' &&
      typeof (vp as ViewportParam).width === 'number' &&
      typeof (vp as ViewportParam).height === 'number'
    ) {
      result.viewport = {
        width: (vp as ViewportParam).width,
        height: (vp as ViewportParam).height,
      };
    }
    const co = raw['captureOutput'];
    if (co && typeof co === 'object' && typeof (co as CaptureOutputParam).path === 'string') {
      result.captureOutput = { path: (co as CaptureOutputParam).path };
    }
    if (raw['darkVariant'] === true) {
      result.darkVariant = true;
    }
    if (raw['naturalHeight'] === true) {
      result.naturalHeight = true;
    }
    return result;
  } finally {
    await context.close();
  }
}

interface ResolvedTarget {
  outPath: string;
  /** Human-readable destination for logs. */
  display: string;
}

function resolveTarget(
  entry: StorybookIndexEntry,
  prefix: (typeof RECOGNISED_PREFIXES)[number],
  params: StoryParameters,
): ResolvedTarget {
  const sceneTitle = entry.title.slice(prefix.length);

  const localeRoot = LOCALE_SCREENSHOT_ROOTS[prefix];
  if (localeRoot) {
    // Shared convention across the landscape + iOS + iPad screenshot
    // prefixes: `{locale}/{NN}-{slug}.png`, sourced from the story name
    // (English/Ukrainian) and `screenshotIndex` on meta.
    const locale = LOCALE_BY_STORY_NAME[entry.name];
    if (!locale) {
      throw new Error(
        `Story "${entry.title} / ${entry.name}" under ${prefix} ` +
          'has no locale mapping — story name must be "English" or "Ukrainian".',
      );
    }
    if (params.screenshotIndex === undefined) {
      throw new Error(
        `Story "${entry.id}" has no parameters.screenshotIndex — set one ` +
          'on the meta-level parameters so the PNG filename has a stable prefix.',
      );
    }
    const slug = kebabCase(sceneTitle);
    const filename = `${String(params.screenshotIndex).padStart(2, '0')}-${slug}.png`;
    const outPath = path.resolve(localeRoot, locale, filename);
    return { outPath, display: path.relative(extensionRoot, outPath) };
  }

  // Marketplace/Promo and Marketing/Screenshots both require an
  // explicit captureOutput.path — they don't follow the locale-mapped
  // screenshots layout.
  const co = params.captureOutput;
  if (!co) {
    throw new Error(
      `Story "${entry.id}" under ${prefix} is missing parameters.captureOutput.path. ` +
        'Set { path: "<relative-to-root>.png" } on the meta-level parameters.',
    );
  }
  const root = prefix === PREFIX_MARKETPLACE_PROMO ? STORE_ASSETS_DIR : MARKETING_SCREENSHOTS_DIR;
  const outPath = path.resolve(root, co.path);
  // Guard against `../` escapes that would write outside the intended
  // root — story authors shouldn't be able to reach into another tree
  // via captureOutput.
  const rel = path.relative(root, outPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Story "${entry.id}" captureOutput.path resolves outside ${prefix}'s output root.`,
    );
  }
  return { outPath, display: path.relative(extensionRoot, outPath) };
}

function findPrefix(title: string): (typeof RECOGNISED_PREFIXES)[number] | undefined {
  return RECOGNISED_PREFIXES.find((p) => title.startsWith(p));
}

/**
 * Fail the run when any popup-bearing scene clipped its popup. Emits one
 * GitHub Actions `::error::` annotation per violation (so it surfaces in a CI
 * log even though this pipeline is on-demand) and throws, which exits the
 * capture command non-zero. No-op when nothing clipped.
 */
function reportClipViolations(violations: readonly ClipViolation[]): void {
  if (violations.length === 0) return;
  for (const v of violations) {
    console.log(
      `::error title=Popup clipped in screenshot::${v.label}: ${v.detail}. ` +
        'Re-fit the frame to the popup (see store-assets/REQUIREMENTS.md → "Popup-clip drift guard").',
    );
    console.error(`  ✗ ${v.label}: popup ${v.detail}`);
  }
  throw new Error(
    `${violations.length} popup screenshot${violations.length === 1 ? '' : 's'} clipped — ` +
      'the popup grew past its frame; re-fit the frame before committing.',
  );
}

async function main(): Promise<void> {
  if (shouldBuild) {
    console.log('▶ Building Storybook…');
    await buildStorybook();
  } else {
    console.log('▶ Skipping Storybook build (--no-build).');
    await stat(indexJsonPath).catch(() => {
      throw new Error(
        `Storybook static build not found at ${storybookStaticDir}. ` +
          'Drop --no-build or run `pnpm build-storybook` first.',
      );
    });
  }

  console.log(`▶ Starting static server on http://127.0.0.1:${STATIC_PORT}`);
  const server = await startStaticServer(storybookStaticDir, STATIC_PORT);

  let browser: Browser | undefined;
  try {
    const index = JSON.parse(await readFile(indexJsonPath, 'utf8')) as StorybookIndex;
    const entries = Object.values(index.entries).filter(
      (e): e is StorybookIndexEntry & { prefix: (typeof RECOGNISED_PREFIXES)[number] } => {
        if (e.type !== 'story') return false;
        const prefix = findPrefix(e.title);
        if (!prefix) return false;
        (e as { prefix?: string }).prefix = prefix;
        return true;
      },
    );
    if (entries.length === 0) {
      throw new Error(
        `No stories under any of ${RECOGNISED_PREFIXES.join(', ')} found in ${indexJsonPath}. ` +
          'Did the Storybook build succeed?',
      );
    }

    const captureable = entries.filter((e) => !e.tags?.includes(SKIP_CAPTURE_TAG));
    const skipped = entries.length - captureable.length;
    const selected = ONLY_PREFIX
      ? captureable.filter((e) => e.title.startsWith(ONLY_PREFIX))
      : captureable;
    if (ONLY_PREFIX && selected.length === 0) {
      throw new Error(
        `--only=${ONLY_PREFIX} matched no captureable stories. ` +
          `Captureable prefixes: ${RECOGNISED_PREFIXES.join(', ')}.`,
      );
    }
    console.log(
      `▶ Found ${entries.length} stories (${captureable.length} captureable, ${skipped} skipped)` +
        (ONLY_PREFIX ? `; capturing ${selected.length} matching --only=${ONLY_PREFIX}.` : '.'),
    );

    browser = await chromium.launch();

    // Popup-bearing scenes whose popup the frame clipped — collected across the
    // whole run so every PNG still regenerates (the maintainer can eyeball the
    // crop), then reported together and the run fails at the end.
    const clipViolations: ClipViolation[] = [];

    for (const entry of selected) {
      const params = await getStoryParameters(browser, entry);
      const target = resolveTarget(entry, entry.prefix, params);
      const viewport = params.viewport ?? DEFAULT_VIEWPORT;
      // Stories that opt into naturalHeight (the before/after website
      // single-halves) capture at natural content height — the marketing
      // page composes the pair at runtime, so a fixed canvas would crop.
      // Everything else (incl. the popup/options marketing shots and all
      // marketplace/promo scenes) stays clipped to its fixed viewport;
      // CWS/AMO require exact 1280×800 / 640×400.
      const fullHeight = params.naturalHeight === true;
      const heightLabel = fullHeight ? 'auto' : String(viewport.height);
      console.log(`  📸 ${entry.id} (${viewport.width}×${heightLabel}) → ${target.display}`);
      const lightClip = await captureStory(browser, entry, viewport, target.outPath, {
        colorScheme: 'light',
        fullHeight,
      });
      if (lightClip) clipViolations.push(lightClip);
      // Scenes that opt into a dark variant (the website backdrops) get a
      // second capture under prefers-color-scheme: dark; the backdrops'
      // own @media blocks repaint and the file gets a `-dark` suffix.
      if (params.darkVariant) {
        const darkOut = darkenPath(target.outPath);
        console.log(`  🌙 ${entry.id} (dark) → ${path.relative(extensionRoot, darkOut)}`);
        const darkClip = await captureStory(browser, entry, viewport, darkOut, {
          colorScheme: 'dark',
          fullHeight,
        });
        if (darkClip) clipViolations.push(darkClip);
      }
    }

    reportClipViolations(clipViolations);
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('✓ Done.');
}

await main();
