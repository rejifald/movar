/*
 * Capture per-locale portrait social-post cards from the marketing
 * Storybook. Sibling of `capture-og-images.mts` — same mechanics, different
 * prefix / viewport / output root:
 *
 *   - Prefix `Marketing/Social/` (OG capture takes `Marketing/OG/`).
 *   - Viewport 1080×1350 (Instagram 4:5 feed; valid Threads / Facebook
 *     image-post size) instead of the 1200×630 OG link-preview canvas.
 *   - Output `public/social/<lang>/NN-<slug>.png`.
 *   - Static server on 127.0.0.1:4327 so it can run alongside the OG
 *     (4326) and extension (4325) captures.
 *
 * Rendered at deviceScaleFactor 2 + `scale: 'css'`: the PNG stays exactly
 * 1080×1350 but rasterises at 2× density and downsamples, so text and the
 * BrandMark edges stay crisp after a feed re-encodes them.
 *
 * Pipeline (mirrors the OG script step for step):
 *   1. `storybook build -o storybook-static` (unless `--no-build`).
 *   2. Serve `storybook-static/` over a tiny `node:http` server.
 *   3. Read `index.json`; keep `Marketing/Social/*` story entries whose
 *      tags don't include `skip-capture`.
 *   4. For each: read `parameters.screenshotIndex` via the running
 *      preview's storyStore, screenshot at the fixed viewport to PNG.
 *   5. Derive `public/social/<en|uk>/<NN>-<slug>.png` from the story name
 *      (English/Ukrainian) and the kebab-cased scene title.
 *
 * Not added to `verify:release` — on-demand only. Regenerate when a
 * `Marketing/Social/*` card or its `social.*` strings change, and commit
 * the PNGs alongside the source so PR review surfaces the visual diff.
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
const socialDir = path.resolve(marketingRoot, 'public', 'social');
const indexJsonPath = path.resolve(storybookStaticDir, 'index.json');

const SCREENSHOT_PREFIX = 'Marketing/Social/';
const STATIC_PORT = 4327;
const VIEWPORT = { width: 1080, height: 1350 } as const;
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
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
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
    // 2× density + `scale: 'css'` keeps the PNG at 1080×1350 while
    // rasterising the text and BrandMark at retina sharpness.
    deviceScaleFactor: 2,
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
      // SocialCard paints an opaque light surface, so omitting alpha keeps
      // the PNG 24-bit — what social crawlers downscale most reliably.
      omitBackground: false,
      scale: 'css',
    });
  } finally {
    await context.close();
  }
}

async function getScreenshotIndex(
  browser: Browser,
  entry: StorybookIndexEntry,
): Promise<number | undefined> {
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
      `▶ Found ${entries.length} social stories (${captureable.length} captureable, ${skipped} skipped).`,
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
      const outPath = path.resolve(socialDir, locale, filename);
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
