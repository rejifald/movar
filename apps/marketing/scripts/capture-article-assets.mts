/*
 * Capture blog-article illustration PNGs from the marketing Storybook.
 *
 * Sibling of `capture-og-images.mts` (same build → serve → screenshot
 * lifecycle; see that script for the design rationale). Differences:
 *
 *   - Filters stories under `Marketing/Article/` instead of
 *     `Marketing/OG/`.
 *   - Output goes to `src/content/blog/assets/` as `<kebab-cased-scene>.png`
 *     — the published article's own asset folder, so the scene a reader sees
 *     on movar.fyi is the file this script writes. Article scenes are one-off
 *     deliverables, so there is no locale folder and no `screenshotIndex`
 *     numbering. `docs/articles/*.md` (the record of what was submitted
 *     elsewhere) links at these same files rather than keeping copies, which
 *     is why the folder lives with the content collection and not under
 *     `docs/`.
 *   - Screenshots the story's root element instead of the viewport, at
 *     `deviceScaleFactor: 2`: each scene is a fixed-size frame, and the
 *     element screenshot inherits its exact dimensions, so scenes of
 *     different sizes need no per-story viewport bookkeeping. The 2×
 *     scale keeps text crisp wherever the article column downscales it.
 *   - Static server port 4327 (extension capture holds 4325, OG 4326),
 *     so all three can run in parallel during CI.
 *
 * Not part of `verify:release` — on-demand only. Regenerate when a scene
 * or the article's numbers change; commit the PNGs alongside the source
 * change so PR review surfaces the visual diff.
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
const assetsDir = path.resolve(marketingRoot, 'src', 'content', 'blog', 'assets');
const indexJsonPath = path.resolve(storybookStaticDir, 'index.json');

const SCREENSHOT_PREFIX = 'Marketing/Article/';
const STATIC_PORT = 4327;
const VIEWPORT = { width: 1400, height: 1000 } as const;
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

function kebabCase(input: string): string {
  return (
    input
      // Boundary between lower/digit and upper: `SteamLanguages` → `Steam-Languages`.
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
    // Element screenshot: the scene frame defines its own fixed size, so
    // the PNG inherits it exactly — no viewport/frame drift to manage.
    await page.locator('#storybook-root > *').first().screenshot({
      path: outPath,
      type: 'png',
      omitBackground: false,
    });
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
      `▶ Found ${entries.length} article stories (${captureable.length} captureable, ${skipped} skipped).`,
    );

    browser = await chromium.launch();

    for (const entry of captureable) {
      const sceneTitle = entry.title.slice(SCREENSHOT_PREFIX.length);
      const outPath = path.resolve(assetsDir, `${kebabCase(sceneTitle)}.png`);
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
