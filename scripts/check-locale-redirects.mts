#!/usr/bin/env node
/**
 * Parity guard: every EN page that has a Ukrainian twin actually auto-redirects
 * a Ukrainian-preferring visitor to it.
 *
 * The site's page set lives in the filesystem (`apps/marketing/src/pages/`, EN
 * at the root and UK under `uk/`), but the edge middleware that acts on it —
 * `apps/marketing/functions/_middleware.ts` — carries a hand-written
 * `UK_COUNTERPART` map. Nothing makes the two agree: the middleware is a
 * Cloudflare Pages Function, built and deployed separately from the Astro site,
 * so it cannot glob `src/pages/` at runtime.
 *
 * That gap has the failure mode the middleware's own header warns about, and it
 * is the worst kind. A missing entry breaks nothing loudly — the EN page still
 * builds, still deploys, still returns 200, still carries its `hreflang`
 * alternates. It just silently never redirects, so a Ukrainian speaker lands on
 * English and the site looks like it simply has no Ukrainian version of that
 * page. No build fails, no test goes red, no 404 shows up in a log.
 *
 * `/install` and `/why-not-ai` shipped that way. This is what would have caught
 * them.
 *
 * Run: tsx scripts/check-locale-redirects.mts  (also `pnpm check:locale-redirects`)
 */
import { readdirSync, existsSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

// By relative path with an explicit extension, not by package name: root
// scripts are not a workspace member. Same shape as `check-changelog-urls.mts`
// importing the marketing site's `i18n.ts`.
import { UK_COUNTERPART } from '../apps/marketing/functions/_middleware.ts';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = nodePath.resolve(repoRoot, 'apps/marketing/src/pages');

/**
 * Pages deliberately outside the redirect map.
 *
 * `404` is not a route a visitor navigates to — Cloudflare Pages serves it for
 * unmatched paths, and the middleware localizes the `/uk/*` case by swapping in
 * the built `/uk/404/` body (concern 3 in `_middleware.ts`). Redirecting it
 * would mean 302-ing a response that has already been decided.
 *
 * The blog is the other direction: `/uk/blog` is Ukrainian-only by design
 * (documented in `apps/marketing/src/content.config.ts` and the app's
 * AGENTS.md), so it has no EN counterpart to redirect *from*. It never appears
 * here anyway — this walks EN pages, and there is no `src/pages/blog/` — but
 * naming it keeps the reason in the file rather than in a reviewer's memory.
 */
const EXEMPT = new Set(['404']);

let failed = 0;
const ok = (label: string): void => {
  console.log(`  ✓ ${label}`);
};
const bad = (label: string, detail: string): void => {
  console.error(`  ✗ ${label}\n    ${detail}`);
  failed += 1;
};

console.log('==> locale redirect parity');

/** Route slugs from `<dir>/*.astro`, minus the extension. Directory routes and
 *  non-page files (`rss.xml.ts`) are not part of the EN canonical set. */
function astroSlugs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.astro'))
    .map((entry) => entry.name.slice(0, -'.astro'.length))
    .toSorted();
}

const enSlugs = astroSlugs(pagesDir);
if (enSlugs.length === 0) {
  bad('EN pages', `no *.astro found in ${pagesDir} — did the page directory move?`);
}

/**
 * The EN page's canonical path, as `onRequest` normalises it: `index.astro` is
 * `/`, everything else is `/<slug>` with no trailing slash.
 */
const canonicalPath = (slug: string): string => (slug === 'index' ? '/' : `/${slug}`);

/**
 * The `/uk/` target, in the trailing-slash form Cloudflare Pages serves
 * directly. Spelled out here rather than read from the map — the point is to
 * derive the expected value independently and compare, so a typo'd target in
 * the map fails instead of being echoed back as correct.
 */
const ukTarget = (slug: string): string => (slug === 'index' ? '/uk/' : `/uk/${slug}/`);

/** EN pages whose UK twin exists — the set that must be in the map. */
const mirrored = enSlugs.filter(
  (slug) => !EXEMPT.has(slug) && existsSync(nodePath.resolve(pagesDir, 'uk', `${slug}.astro`)),
);

for (const slug of mirrored) {
  const path = canonicalPath(slug);
  const expected = ukTarget(slug);
  const actual = UK_COUNTERPART[path];
  if (actual === undefined) {
    bad(
      `${path} has a UK twin but no redirect`,
      `src/pages/uk/${slug}.astro exists; add '${path}': '${expected}', to UK_COUNTERPART`,
    );
  } else if (actual === expected) {
    ok(`${path} → ${expected}`);
  } else {
    bad(`${path} redirects to the wrong target`, `map says '${actual}', expected '${expected}'`);
  }
}

/**
 * The reverse direction. An entry pointing at a page that no longer exists
 * sends a Ukrainian visitor to a 404 — louder than the missing-entry case, but
 * only for the visitors who hit it, and never on an English-speaking reviewer's
 * machine. A renamed or deleted page fails here instead.
 */
for (const [path, target] of Object.entries(UK_COUNTERPART)) {
  const slug = path === '/' ? 'index' : path.slice(1);
  if (mirrored.includes(slug)) continue;
  if (existsSync(nodePath.resolve(pagesDir, `${slug}.astro`))) {
    bad(
      `${path} is mapped but has no UK page`,
      `target '${target}' has no src/pages/uk/${slug}.astro — it would redirect into a 404`,
    );
  } else {
    bad(`${path} is mapped but has no EN page`, `no src/pages/${slug}.astro (target '${target}')`);
  }
}

if (failed > 0) {
  console.error(
    `\n✗ ${failed} locale redirect parity check(s) failed.\n` +
      '  The page set and the redirect map are maintained separately (the middleware\n' +
      '  is a Pages Function; it cannot read src/pages/ at runtime). Reconcile:\n' +
      '    apps/marketing/src/pages/              EN pages and their uk/ twins\n' +
      '    apps/marketing/functions/_middleware.ts  UK_COUNTERPART',
  );
  process.exit(1);
}

console.log(`\n✓ all ${mirrored.length} mirrored page(s) auto-redirect to their /uk/ counterpart.`);
