/*
 * Fail if a link in the site's prose points at nothing.
 *
 * The articles carry a «Джерела» section whose whole premise is that the
 * reader can go and check. A rotted link there is worse than a missing one:
 * it reads as a citation right up until someone clicks it. Nothing else in
 * the repo watches those URLs — the charts guard watches figures, the README
 * guard watches the tagline, `check-changelog-urls.mts` watches one hardcoded
 * constant, and none of them looks at an `<a>` in a post.
 *
 * The check has two halves, split by whether it can be trusted to gate a PR:
 *
 *   Internal links (default, offline). `](/uk/...)` in the content markdown,
 *   resolved against the real route set — `src/pages/**` for static pages plus
 *   the blog and guide collections for the two `[...slug]` routes. Pure
 *   filesystem, deterministic, no network. This is the half that catches the
 *   likely failure: renaming an article slug silently breaks every sibling
 *   post that linked to it, and Astro will happily build the broken link.
 *   Safe to wire into CI and lefthook the way `check:charts` is.
 *
 *   External links (`--external`, network). Every http(s) URL in the content
 *   markdown and in `src/i18n.ts`. This half CANNOT gate a PR: it depends on
 *   fifty-odd third-party hosts being up and willing to answer a script, so as
 *   a required check it would fail for reasons that have nothing to do with
 *   the commit. It is for running on demand before publishing, or on a
 *   schedule. Only a 404/410 — the server saying the page is gone — counts as
 *   a failure; a refusal to talk to a bot is reported and skipped.
 *
 * That last distinction is load-bearing, not defensive coding. Several sources
 * the articles cite are documented in `docs/articles/movna-hihiiena.research.md`
 * as refusing server-side fetches ("help.x.com, facebook.com/help and
 * help.instagram.com all block server-side fetching (403/empty)") — they were
 * verified by rendering them in a real browser. A checker that called those
 * failures would train everyone to ignore it, or worse, talk someone into
 * deleting a perfectly good citation.
 *
 * Run: `pnpm check:links` (offline) or `pnpm check:links --external`.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(APP, 'src');

/**
 * Hosts that refuse automated requests as a matter of policy. A response from
 * these proves nothing either way, so they are reported as skipped rather than
 * counted. Add a host here only with evidence that the refusal is the host's
 * policy and not our bug — for these, the evidence is that a full browser
 * user-agent gets the same answer a script does.
 */
const REFUSES_BOTS = new Set([
  'help.x.com',
  'www.facebook.com',
  'help.instagram.com',
  'support.tiktok.com',
  'www.npmjs.com',
]);

const CONCURRENCY = 6;
const TIMEOUT_MS = 15_000;

interface Link {
  url: string;
  file: string;
  line: number;
}

interface Probed {
  link: Link;
  /** True for a host in REFUSES_BOTS, whose answer would prove nothing. */
  skipped: boolean;
  ok: boolean;
  status: number | string;
}

/** Every file under `dir` whose name matches `pattern`. */
async function filesUnder(dir: string, pattern: RegExp): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Collect matches of `re` (capture group 1) with the line they sit on. */
async function collect(file: string, re: RegExp): Promise<Link[]> {
  const lines = (await readFile(file, 'utf8')).split('\n');
  const found: Link[] = [];
  for (const [index, text] of lines.entries()) {
    for (const match of text.matchAll(re)) {
      const captured = match[1];
      if (captured === undefined) continue;
      // Prose runs URLs into sentence punctuation; markdown never does.
      found.push({ url: captured.replace(/[.,;:]+$/, ''), file, line: index + 1 });
    }
  }
  return found;
}

/**
 * Every path the site actually serves under a locale prefix. Built from the
 * route files rather than from a hand-kept list, so a renamed page or a
 * renamed article changes this set on its own.
 */
async function routeSet(): Promise<Set<string>> {
  const routes = new Set<string>();
  const pages = path.join(SRC, 'pages');

  for (const file of await filesUnder(pages, /\.astro$/)) {
    const rel = path.relative(pages, file).replace(/\.astro$/, '');
    if (rel.includes('[')) continue; // dynamic routes are filled from collections below
    routes.add('/' + rel.replace(/\/index$/, ''));
  }

  for (const collection of ['blog', 'guide']) {
    const dir = path.join(SRC, 'content', collection);
    for (const file of await filesUnder(dir, /\.md$/)) {
      const slug = path.relative(dir, file).replace(/\.md$/, '');
      // Both collections render under every locale that has the parent route.
      for (const locale of ['uk', 'en']) {
        if (routes.has(`/${locale}/${collection}`)) routes.add(`/${locale}/${collection}/${slug}`);
      }
    }
  }

  return routes;
}

/** HEAD first, then GET — see the comment inside for why the fallback is total. */
async function probe(url: string): Promise<{ ok: boolean; status: number | string }> {
  const init = {
    redirect: 'follow' as const,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // Some documentation hosts refuse an obviously scripted agent but answer a
    // normal one. This is not evasion — the page is public either way.
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; movar-link-check/1.0)' },
  };

  try {
    const head = await fetch(url, { ...init, method: 'HEAD' });
    if (head.ok) return { ok: true, status: head.status };
    // HEAD is an optimisation, never an oracle. Google's support pages answer
    // it with 404 and serve the article fine on GET. Calling a link dead on a
    // HEAD alone would have argued for "fixing" two correct citations the
    // first time this script ran.
    const get = await fetch(url, { ...init, method: 'GET' });
    return { ok: get.ok, status: get.status };
  } catch (error) {
    return { ok: false, status: error instanceof Error ? error.name : 'network error' };
  }
}

/** Run `task` over `items`, at most CONCURRENCY at a time. */
async function pooled<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  // One shared iterator is the work queue: every worker pulls the next entry,
  // so nothing indexes back into the array and nothing tracks a cursor.
  const queue = items.entries();
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      for (const [index, item] of queue) results[index] = await task(item);
    }),
  );
  return results;
}

const where = ({ file, line }: Link) => `${path.relative(APP, file)}:${line}`;

// ---------------------------------------------------------------- internal

const contentFiles = await filesUnder(path.join(SRC, 'content'), /\.md$/);
const routes = await routeSet();

const internal = (
  await Promise.all(contentFiles.map((file) => collect(file, /\]\((\/[^)\s]+)\)/g)))
).flat();

const broken = internal.filter((link) => {
  const target = (link.url.split('#')[0] ?? '').replace(/\/$/, '');
  return target !== '' && !routes.has(target);
});

console.log(`internal: ${internal.length} links across ${contentFiles.length} files`);
for (const link of broken) console.error(`  BROKEN   ${link.url} — ${where(link)}`);

// ---------------------------------------------------------------- external

let rotted: Link[] = [];

if (process.argv.includes('--external')) {
  const externalFiles = [...contentFiles, path.join(SRC, 'i18n.ts')];
  const all = (
    await Promise.all(externalFiles.map((file) => collect(file, /(https?:\/\/[^\s"'`)<>\]]+)/g)))
  ).flat();

  // One request per distinct URL, reported against the first place it appears.
  const byUrl = new Map<string, Link>();
  for (const link of all) if (!byUrl.has(link.url)) byUrl.set(link.url, link);
  const unique = [...byUrl.values()];

  const checked = await pooled(unique, async (link): Promise<Probed> => {
    if (REFUSES_BOTS.has(new URL(link.url).hostname)) {
      return { link, skipped: true, ok: true, status: 'refused by policy' };
    }
    return { link, skipped: false, ...(await probe(link.url)) };
  });

  const skipped = checked.filter((result) => result.skipped);
  // Only the server saying "gone" is rot. A refusal is a refusal, not a 404.
  const isGone = (status: number | string) => status === 404 || status === 410;
  rotted = checked
    .filter((result) => !result.skipped && isGone(result.status))
    .map((result) => result.link);
  const unclear = checked.filter(
    (result) => !result.skipped && !result.ok && !isGone(result.status),
  );

  console.log(`external: ${unique.length} distinct URLs across ${externalFiles.length} files`);
  for (const r of skipped) console.log(`  skipped  ${r.link.url} — host refuses bots by policy`);
  for (const r of unclear) console.log(`  unclear  ${r.link.url} — ${r.status}, check by hand`);
  for (const link of rotted) console.error(`  ROTTED   ${link.url} — ${where(link)}`);
} else {
  console.log('external: skipped (pass --external to check them over the network)');
}

// ------------------------------------------------------------------ verdict

if (broken.length > 0 || rotted.length > 0) {
  throw new Error(
    `${broken.length} broken internal and ${rotted.length} rotted external link(s), listed above.`,
  );
}

console.log('\nAll links resolve.');
