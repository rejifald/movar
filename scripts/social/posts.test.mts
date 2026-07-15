#!/usr/bin/env node
/**
 * Unit test for the social pipeline's pure post logic.
 *
 * The repo has no vitest project that globs the root `scripts/` dir, so this
 * is a self-contained assertion runner (same pattern as
 * scripts/lib/promises.test.mts). It exercises frontmatter parsing,
 * validation, media-URL resolution, and the idempotency subtraction — the
 * logic the publisher is built on — without touching the network.
 *
 * Run: tsx scripts/social/posts.test.mts   (also `pnpm test:social`)
 */
import { CAPTION_LIMITS, mediaUrl, parseFrontmatter, pendingPlatforms, toPost } from './posts.mts';
import type { Ledger, Post } from './types.mts';

let failed = 0;
const ok = (label: string): void => console.log(`  ✓ ${label}`);
const bad = (label: string): void => {
  console.error(`  ✗ ${label}`);
  failed += 1;
};
const eq = (actual: unknown, expected: unknown, label: string): void => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(label);
  else bad(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log('==> social posts pipeline unit test');

// 1. Frontmatter: scalars, inline arrays, comments, quotes, body split.
{
  const { data, body } = parseFrontmatter(
    [
      '---',
      '# a comment',
      'platforms: [instagram, threads]',
      'lang: uk',
      'status: "ready"',
      '---',
      '',
      'Hello world',
      '',
    ].join('\n'),
  );
  eq(data['platforms'], ['instagram', 'threads'], 'parses an inline array');
  eq(data['lang'], 'uk', 'parses a scalar');
  eq(data['status'], 'ready', 'strips quotes from a scalar');
  eq(body, 'Hello world', 'splits and trims the body');
}

// 2. No fence → all body, no data.
{
  const { data, body } = parseFrontmatter('just a caption, no frontmatter');
  eq(Object.keys(data).length, 0, 'no-fence file yields no data');
  eq(body, 'just a caption, no frontmatter', 'no-fence file keeps the whole body');
}

// 3. CRLF line endings parse the same as LF.
{
  const { data, body } = parseFrontmatter('---\r\nlang: en\r\n---\r\nBody here');
  eq(data['lang'], 'en', 'parses CRLF frontmatter');
  eq(body, 'Body here', 'parses CRLF body');
}

// 4. A well-formed post validates clean with typed fields.
{
  const { post, errors } = toPost(
    '2026-07-15-meet-movar',
    '/x.md',
    '---\nplatforms: [instagram, threads, facebook]\nlang: uk\nimage: social/uk/01-meet-movar.png\nstatus: ready\n---\nCaption body.',
  );
  eq(errors, [], 'valid post has no errors');
  eq(post.frontmatter.platforms, ['instagram', 'threads', 'facebook'], 'platforms parsed');
  eq(post.frontmatter.status, 'ready', 'status parsed');
  eq(post.caption, 'Caption body.', 'caption is the body');
}

// 5. Missing / unknown / bad fields are reported.
{
  const missing = toPost('p', '/x.md', '---\nlang: uk\nstatus: ready\n---\nBody');
  eq(missing.errors.length >= 1, true, 'missing platforms is an error');

  const unknown = toPost(
    'p',
    '/x.md',
    '---\nplatforms: [twitter]\nlang: uk\nstatus: ready\n---\nBody',
  );
  eq(
    unknown.errors.some((e) => e.includes('twitter')),
    true,
    'unknown platform is reported',
  );
  eq(unknown.post.frontmatter.platforms, [], 'unknown platform filtered from the typed list');

  const noLang = toPost('p', '/x.md', '---\nplatforms: [threads]\nstatus: ready\n---\nBody');
  eq(
    noLang.errors.some((e) => e.includes('lang')),
    true,
    'missing lang is reported',
  );

  const badStatus = toPost(
    'p',
    '/x.md',
    '---\nplatforms: [threads]\nlang: uk\nstatus: live\n---\nBody',
  );
  eq(badStatus.post.frontmatter.status, 'draft', 'unknown status falls back to draft');
  eq(
    badStatus.errors.some((e) => e.includes('status')),
    true,
    'unknown status is reported',
  );
}

// 6. Instagram demands an image; text-only networks do not.
{
  const noImage = toPost(
    'p',
    '/x.md',
    '---\nplatforms: [instagram]\nlang: uk\nstatus: ready\n---\nBody',
  );
  eq(
    noImage.errors.some((e) => e.includes('image')),
    true,
    'instagram without an image is an error',
  );
  const textOnly = toPost(
    'p',
    '/x.md',
    '---\nplatforms: [threads]\nlang: uk\nstatus: ready\n---\nBody',
  );
  eq(textOnly.errors, [], 'threads text-only post is fine without an image');
}

// 7. Caption-limit guard fires on the tightest targeted network.
{
  const longCaption = 'x'.repeat(CAPTION_LIMITS.threads + 1);
  const over = toPost(
    'p',
    '/x.md',
    `---\nplatforms: [threads]\nlang: uk\nstatus: ready\n---\n${longCaption}`,
  );
  eq(
    over.errors.some((e) => e.includes('threads')),
    true,
    'caption over the threads limit is reported',
  );
}

// 8. mediaUrl joins cleanly regardless of stray slashes + honours the base.
{
  eq(
    mediaUrl('social/uk/01.png', 'https://movar.fyi'),
    'https://movar.fyi/social/uk/01.png',
    'joins base + path',
  );
  eq(
    mediaUrl('/social/uk/01.png', 'https://movar.fyi/'),
    'https://movar.fyi/social/uk/01.png',
    'collapses stray slashes',
  );
}

// 9. pendingPlatforms subtracts what the ledger already recorded.
{
  const post: Post = {
    slug: 'meet-movar',
    filePath: '/x.md',
    frontmatter: { platforms: ['instagram', 'threads', 'facebook'], lang: 'uk', status: 'ready' },
    caption: 'hi',
  };
  const ledger: Ledger = { 'meet-movar': { instagram: { id: '1', at: '2026-07-15T00:00:00Z' } } };
  eq(
    pendingPlatforms(post, ledger),
    ['threads', 'facebook'],
    'already-posted network is not pending',
  );
  eq(
    pendingPlatforms(post, {}),
    ['instagram', 'threads', 'facebook'],
    'empty ledger → all pending',
  );
}

console.log(
  failed === 0 ? '\n✓ all social-pipeline checks passed' : `\n✗ ${failed} check(s) failed`,
);
process.exit(failed > 0 ? 1 : 0);
