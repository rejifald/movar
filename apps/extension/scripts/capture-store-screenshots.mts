/*
 * Capture the marketplace screenshot set from the extension's Storybook.
 *
 * Pipeline:
 *
 *   1. `storybook build -o storybook-static` (unless `--no-build` is
 *      passed; useful when iterating locally with an already-built
 *      bundle).
 *   2. Spin up a tiny `node:http` static server on
 *      127.0.0.1:4325 against `storybook-static/`.
 *   3. Read `storybook-static/index.json`; keep entries whose `title`
 *      starts with `Marketplace/Screenshots/` and whose `tags` do not
 *      include `skip-capture`.
 *   4. For each surviving entry: launch Playwright Chromium at
 *      `viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1`,
 *      navigate to `iframe.html?viewMode=story&id=…`, await
 *      `document.fonts.ready` and a network-idle settle, then
 *      `page.screenshot()` to PNG (no alpha — Storybook scenes are
 *      opaque, which satisfies the Chrome Web Store "24-bit PNG no
 *      alpha" rule naturally).
 *   5. Derive the output path from the scene's `parameters.screenshotIndex`
 *      and the story's locale: `Marketplace/Screenshots/PopupOnNews` +
 *      `English` → `screenshots/en/01-popup-on-news.png`.
 *   6. Tear everything down. On any error, the script exits non-zero
 *      and Playwright + the static server are cleaned up via
 *      finally-blocks so a CI run never strands a port.
 *
 * Not added to `verify:release` — on-demand only. See
 * `store-assets/STORYBOOK-PIPELINE-PLAN.md` §4 for the rationale.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, type Browser } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const storybookStaticDir = path.resolve(extensionRoot, 'storybook-static');
const screenshotsDir = path.resolve(extensionRoot, 'store-assets', 'screenshots');
const indexJsonPath = path.resolve(storybookStaticDir, 'index.json');

const SCREENSHOT_PREFIX = 'Marketplace/Screenshots/';
const STATIC_PORT = 4325;
const VIEWPORT = { width: 1280, height: 800 } as const;
const SKIP_CAPTURE_TAG = 'skip-capture';

const shouldBuild = !process.argv.includes('--no-build');

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

const LOCALE_BY_STORY_NAME: Record<string, 'en' | 'uk'> = {
  English: 'en',
  Ukrainian: 'uk',
};

function kebabCase(input: string): string {
  return (
    input
      // Boundary between lower/digit and upper: `PopupOnNews` →
      // `Popup-On-News`.
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // Boundary between consecutive uppers and a following lower:
      // `SERPLayout` → `SERP-Layout`.
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
  );
}

async function buildStorybook(): Promise<void> {
  // Spawn `pnpm build-storybook` from the extension package. The script
  // shells out to the local `storybook build` binary; redirecting
  // stdio: 'inherit' keeps the build output visible in the parent's
  // log so a CI failure points at the actual storybook error, not at a
  // mute non-zero exit from this script.
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

/** Content-type map for files the static server will see during a
 *  Storybook static build. Anything missing falls back to
 *  `application/octet-stream`, which keeps Playwright happy for binary
 *  assets that don't need a specific MIME (the screenshot pipeline only
 *  cares about HTML + JS + JSON + fonts + media). */
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
  // Minimal static file server — Storybook's static build is
  // self-contained and the browser only fetches assets under the root
  // (relative URLs), so a 100-line GET server is enough. Anything
  // pulling in `serve` or `sirv` for this would be over-spec.
  const server = http.createServer((req, res) => {
    // `req.url` always begins with `/` for HTTP/1.1 requests; default
    // to '/' to keep the type narrow.
    const rawPath = decodeURI((req.url ?? '/').split('?')[0] ?? '/');
    // Block traversal: any normalised path that escapes the root is
    // rejected. `path.relative` does the work in one call.
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
          const ext = '.html';
          res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
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

async function captureStory(
  browser: Browser,
  entry: StorybookIndexEntry,
  outPath: string,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: 1,
    // Storybook scenes are opaque — disable reduced-motion noise from
    // CSS animations that might still be settling at capture time.
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const url = `http://127.0.0.1:${STATIC_PORT}/iframe.html?viewMode=story&id=${encodeURIComponent(
      entry.id,
    )}`;
    // `networkidle` accounts for the lazy-loaded module graph Storybook
    // emits per-story; without it, the screenshot can land before the
    // backdrop's web font finishes pulling in cyrillic subsets.
    await page.goto(url, { waitUntil: 'networkidle' });
    // Belt + braces: explicitly await the font face set, which can
    // resolve later than networkidle when fontsource preloads kick in
    // after first paint.
    await page.evaluate(() => document.fonts.ready);
    // Storybook's `#storybook-root` is the live story canvas. Wait for
    // it before screenshotting so a story that throws on first render
    // surfaces as a Playwright error, not a blank PNG.
    await page.waitForSelector('#storybook-root', { state: 'attached' });
    await mkdir(path.dirname(outPath), { recursive: true });
    await page.screenshot({
      path: outPath,
      type: 'png',
      // Capturing the viewport only — backdrops are designed at exactly
      // 1280×800 and any overflow shouldn't end up in the marketplace
      // PNG. `fullPage: true` would extend the height for any backdrop
      // that grows below the fold.
      fullPage: false,
      // Storybook's iframe canvas is opaque (preview.css sets the
      // backdrop colour), so omitting alpha matches the Chrome Web
      // Store "24-bit no-alpha" expectation.
      omitBackground: false,
    });
  } finally {
    await context.close();
  }
}

async function getScreenshotIndex(
  browser: Browser,
  entry: StorybookIndexEntry,
): Promise<number | undefined> {
  // `parameters` aren't part of `index.json` in Storybook 10, so read
  // them through the running preview's storyStore API. Doing this once
  // per entry keeps the capture script declarative — adding a fifth
  // scene only requires bumping its `screenshotIndex` and the script
  // picks it up.
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    const url = `http://127.0.0.1:${STATIC_PORT}/iframe.html?viewMode=story&id=${encodeURIComponent(
      entry.id,
    )}`;
    await page.goto(url, { waitUntil: 'load' });
    // Storybook 8+ exposes `__STORYBOOK_PREVIEW__` on the iframe global
    // once the preview module loads. Poll briefly — the global may be
    // installed a tick after `load` fires.
    const index = await page.waitForFunction(
      async (storyId: string) => {
        const preview = (globalThis as unknown as { __STORYBOOK_PREVIEW__?: unknown })
          .__STORYBOOK_PREVIEW__;
        if (!preview) return null;
        interface StoryLike {
          parameters?: { screenshotIndex?: number };
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
          return typeof story.parameters?.screenshotIndex === 'number'
            ? story.parameters.screenshotIndex
            : null;
        } catch {
          return null;
        }
      },
      entry.id,
      { timeout: 10_000 },
    );
    const value = await index.jsonValue();
    return typeof value === 'number' ? value : undefined;
  } finally {
    await context.close();
  }
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
      (e) => e.type === 'story' && e.title.startsWith(SCREENSHOT_PREFIX),
    );
    if (entries.length === 0) {
      throw new Error(
        `No stories under ${SCREENSHOT_PREFIX} found in ${indexJsonPath}. ` +
          'Did the Storybook build succeed?',
      );
    }

    const captureable = entries.filter((e) => !e.tags?.includes(SKIP_CAPTURE_TAG));
    const skipped = entries.length - captureable.length;
    console.log(
      `▶ Found ${entries.length} scene stories (${captureable.length} captureable, ${skipped} skipped).`,
    );

    browser = await chromium.launch();

    for (const entry of captureable) {
      const sceneTitle = entry.title.slice(SCREENSHOT_PREFIX.length);
      const slug = kebabCase(sceneTitle);
      const locale = LOCALE_BY_STORY_NAME[entry.name];
      if (!locale) {
        console.warn(
          `  ⚠ Skipping story "${entry.title} / ${entry.name}" — no locale mapping for story name "${entry.name}"`,
        );
        continue;
      }
      const screenshotIndex = await getScreenshotIndex(browser, entry);
      if (screenshotIndex === undefined) {
        throw new Error(
          `Story "${entry.id}" has no parameters.screenshotIndex on its meta — ` +
            'set one on the story file or add it to the meta-level parameters.',
        );
      }
      const filename = `${String(screenshotIndex).padStart(2, '0')}-${slug}.png`;
      const outPath = path.resolve(screenshotsDir, locale, filename);
      console.log(`  📸 ${entry.id} → ${path.relative(extensionRoot, outPath)}`);
      await captureStory(browser, entry, outPath);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('✓ Done.');
}

await main();
