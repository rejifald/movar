/*
 * Capture per-locale Open Graph share images from the marketing Storybook.
 *
 * Pipeline (mirrors apps/extension/scripts/capture-storybook-assets.mts —
 * see also store-assets/STORYBOOK-PIPELINE-PLAN.md for the design that
 * harness traces):
 *
 *   1. `storybook build -o storybook-static` (unless `--no-build` is
 *      passed; useful when iterating locally with an already-built
 *      bundle).
 *   2. Spin up a tiny `node:http` static server on 127.0.0.1:4326
 *      against `storybook-static/`. Port differs from the extension
 *      capture (4325) so the two can run in parallel during CI.
 *   3. Read `storybook-static/index.json`; keep entries whose `title`
 *      starts with `Marketing/OG/` and whose `tags` do not include
 *      `skip-capture`.
 *   4. For each surviving entry: launch Playwright Chromium at
 *      `viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1,
 *      colorScheme: 'light'`, navigate to
 *      `iframe.html?viewMode=story&id=…`, await `document.fonts.ready`
 *      and a network-idle settle, then `page.screenshot()` to PNG.
 *      `colorScheme: 'light'` belt-and-braces the OgCard's hard-coded
 *      light palette: social crawlers don't honour prefers-color-scheme.
 *   5. Derive the output path from the scene's `parameters.screenshotIndex`
 *      and the story's locale: `Marketing/OG/Default` + `English` →
 *      `public/og/en/01-default.png`.
 *   6. Tear everything down. On any error, the script exits non-zero
 *      and Playwright + the static server are cleaned up via
 *      finally-blocks.
 *
 * Not added to `verify:release` — on-demand only. Regenerate when the
 * card design or copy changes; commit the resulting PNGs alongside the
 * source change so PR review surfaces the visual diff.
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, type Browser } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const marketingRoot = path.resolve(here, '..');
const storybookStaticDir = path.resolve(marketingRoot, 'storybook-static');
const ogDir = path.resolve(marketingRoot, 'public', 'og');
const indexJsonPath = path.resolve(storybookStaticDir, 'index.json');

const SCREENSHOT_PREFIX = 'Marketing/OG/';
const STATIC_PORT = 4326;
const VIEWPORT = { width: 1200, height: 630 } as const;
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
      // Boundary between lower/digit and upper: `PopupOnNews` → `Popup-On-News`.
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // Boundary between consecutive uppers and a following lower:
      // `SERPLayout` → `SERP-Layout`.
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
  );
}

async function buildStorybook(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['build-storybook'], {
      cwd: marketingRoot,
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
  // HTTP request handler — branches are by file-system outcome (directory,
  // file, 403 path-escape, 404 not-found); splitting would only hide the
  // dispatch table without reducing the real branching complexity.
  // fallow-ignore-next-line complexity
  const server = http.createServer((req, res) => {
    const rawPath = decodeURI((req.url ?? '/').split('?')[0] ?? '/');
    const target = path.resolve(root, '.' + rawPath);
    const rel = path.relative(root, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    // Async IIFE handles the response inline; branches cover directory-index
    // fallback and per-extension MIME selection — inherent to a static server.
    // fallow-ignore-next-line complexity
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

async function captureStory(
  browser: Browser,
  entry: StorybookIndexEntry,
  outPath: string,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: 1,
    colorScheme: 'light',
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
    await page.screenshot({
      path: outPath,
      type: 'png',
      fullPage: false,
      // OgCard paints opaque #fafaf9 so omitting alpha keeps the PNG
      // 24-bit, which is what social network crawlers downscale most
      // reliably (PNGs with alpha sometimes pick up a black matte).
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
  // per entry keeps the capture script declarative — adding a second OG
  // scene only requires bumping its `screenshotIndex` and the script
  // picks it up.
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    const url = `http://127.0.0.1:${STATIC_PORT}/iframe.html?viewMode=story&id=${encodeURIComponent(
      entry.id,
    )}`;
    await page.goto(url, { waitUntil: 'load' });
    const index = await page.waitForFunction(
      // Browser-side evaluation closure — the inline interfaces and null-guards
      // are required to safely introspect the Storybook preview global; the
      // complexity is the safe-access chain, not nested business logic.
      // fallow-ignore-next-line complexity
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

// Capture-script orchestrator — branches are the build/skip guard, the
// empty-index error, and the per-story locale-validation guard; the cognitive
// cost is the sequential lifecycle (build → serve → capture → teardown), not
// nested logic that could be meaningfully extracted.
// fallow-ignore-next-line complexity
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
      `▶ Found ${entries.length} OG stories (${captureable.length} captureable, ${skipped} skipped).`,
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
      const outPath = path.resolve(ogDir, locale, filename);
      console.log(`  📸 ${entry.id} → ${path.relative(marketingRoot, outPath)}`);
      await captureStory(browser, entry, outPath);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('✓ Done.');
}

await main();
