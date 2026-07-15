#!/usr/bin/env node
/**
 * Publish queued social posts.
 *
 * Reads `posts/*.md`, validates every one, and — for each `ready` post —
 * publishes to the networks it still owes (targeted minus the ledger),
 * recording results in `posts/.published.json` so re-runs never double-post.
 *
 * Modes:
 *   (default)  dry run — validate, assert each referenced card exists, and
 *              print exactly what WOULD be posted (with the public media
 *              URL). Never touches the network or the ledger.
 *   --check    validate only; exit non-zero if any post is malformed. Wired
 *              as `pnpm social:check` — safe to run on every PR.
 *   --publish  actually post. A network fires only when BOTH its credentials
 *              are set AND `--publish` is passed. Missing credentials → the
 *              network is skipped with a ::warning::, never an error, so a
 *              partially-configured run still does what it can.
 *
 * Run: tsx scripts/social/publish-posts.mts [--check | --publish]
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPosts, mediaFilePath, mediaUrl, pendingPlatforms } from './posts.mts';
import { clientFor, readCredentials } from './platforms.mts';
import type { Ledger, Post } from './types.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const postsDir = path.resolve(repoRoot, 'posts');
const ledgerPath = path.resolve(postsDir, '.published.json');

const CHECK_ONLY = process.argv.includes('--check');
const PUBLISH = process.argv.includes('--publish');

interface Checked {
  post: Post;
  errors: string[];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readLedger(): Promise<Ledger> {
  try {
    return JSON.parse(await readFile(ledgerPath, 'utf8')) as Ledger;
  } catch {
    return {};
  }
}

async function writeLedger(ledger: Ledger): Promise<void> {
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

/** Structural validation + card-existence check for every post. */
async function checkAll(): Promise<Checked[]> {
  const results = await loadPosts(postsDir);
  const checked: Checked[] = [];
  for (const { post, errors } of results) {
    const all = [...errors];
    const { image } = post.frontmatter;
    if (image && !(await fileExists(mediaFilePath(image, repoRoot)))) {
      all.push(
        `card not found: apps/marketing/public/${image} — run \`pnpm --filter @movar/marketing capture:social\``,
      );
    }
    checked.push({ post, errors: all });
  }
  return checked;
}

function reportValidation(checked: Checked[]): number {
  let errorCount = 0;
  for (const { post, errors } of checked) {
    const fm = post.frontmatter;
    if (errors.length === 0) {
      console.log(
        `  ✓ ${post.slug} [${fm.status}] → ${fm.platforms.join(', ')} · ${post.caption.length} chars`,
      );
      continue;
    }
    errorCount += errors.length;
    console.log(`  ✗ ${post.slug}`);
    for (const e of errors) {
      console.log(`      - ${e}`);
      console.log(`::error::${post.slug}: ${e}`);
    }
  }
  return errorCount;
}

/** Dry-run: show exactly what would be posted, and the public card URL. */
function planPublish(checked: Checked[], ledger: Ledger): void {
  console.log('\n▶ Publish plan (dry run — pass --publish to send):');
  for (const { post } of checked) {
    if (post.frontmatter.status !== 'ready') {
      console.log(`  • ${post.slug}: status "${post.frontmatter.status}" — skipped`);
      continue;
    }
    const pending = pendingPlatforms(post, ledger);
    if (pending.length === 0) {
      console.log(`  • ${post.slug}: already posted everywhere — nothing to do`);
      continue;
    }
    const media = post.frontmatter.image ? mediaUrl(post.frontmatter.image) : '(text only)';
    console.log(`  → ${post.slug} to ${pending.join(', ')}`);
    console.log(`      media: ${media}`);
  }
}

/** Live publish. Each pending network posts only when configured. Returns the
 *  updated ledger plus failure count. */
async function runPublish(
  checked: Checked[],
  ledger: Ledger,
): Promise<{ ledger: Ledger; published: number; failed: number }> {
  const creds = readCredentials();
  let published = 0;
  let failed = 0;
  console.log('\n▶ Publishing:');
  for (const { post } of checked) {
    if (post.frontmatter.status !== 'ready') continue;
    for (const platform of pendingPlatforms(post, ledger)) {
      const client = clientFor(platform, creds);
      if (!client) {
        console.log(
          `::warning::${post.slug}: ${platform} not configured (missing credentials) — skipped`,
        );
        continue;
      }
      try {
        const { image } = post.frontmatter;
        const record = await client.publish(
          image ? { caption: post.caption, imageUrl: mediaUrl(image) } : { caption: post.caption },
        );
        (ledger[post.slug] ??= {})[platform] = record;
        await writeLedger(ledger);
        published += 1;
        console.log(`  ✓ ${post.slug} → ${platform}: ${record.permalink ?? record.id}`);
      } catch (err) {
        failed += 1;
        console.log(
          `::error::${post.slug} → ${platform}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  return { ledger, published, failed };
}

async function main(): Promise<void> {
  console.log(`▶ Validating posts in ${path.relative(repoRoot, postsDir)}/`);
  const checked = await checkAll();
  if (checked.length === 0) {
    console.log('  (no posts found)');
    return;
  }
  const errorCount = reportValidation(checked);

  if (CHECK_ONLY) {
    console.log(errorCount === 0 ? '\n✓ all posts valid' : `\n✗ ${errorCount} problem(s) found`);
    process.exit(errorCount > 0 ? 1 : 0);
  }

  if (errorCount > 0) {
    console.log(`\n✗ ${errorCount} problem(s) — fix these before publishing`);
    process.exit(1);
  }

  const ledger = await readLedger();
  if (!PUBLISH) {
    planPublish(checked, ledger);
    console.log('\n✓ dry run complete — no posts were sent');
    return;
  }

  const result = await runPublish(checked, ledger);
  console.log(
    `\n${result.failed === 0 ? '✓' : '✗'} published ${result.published} · failed ${result.failed}`,
  );
  process.exit(result.failed > 0 ? 1 : 0);
}

await main();
