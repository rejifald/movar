/**
 * Pure post logic for the social pipeline: parse a post file, validate it,
 * resolve its card to a public URL / local path, and work out which networks
 * it still owes. No network, no process side effects beyond reading files —
 * so it's all unit-testable (`posts.test.mts`).
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PLATFORMS,
  POST_STATUSES,
  type Ledger,
  type Platform,
  type Post,
  type PostFrontmatter,
  type PostStatus,
} from './types.mts';

/**
 * Per-network caption ceilings (characters). Facebook's real limit is ~63k;
 * we cap far lower to keep captions sane. Instagram (2200) and Threads (500)
 * mirror the documented limits — confirm against current docs before relying
 * on the exact number.
 */
export const CAPTION_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  threads: 500,
  facebook: 5000,
};

const DEFAULT_SITE_URL = 'https://movar.fyi';

interface ParsedFrontmatter {
  data: Record<string, string | string[]>;
  body: string;
}

/**
 * Parse a constrained frontmatter block. Deliberately NOT a full YAML parser
 * (the repo keeps this kind of guard dependency-free — cf. check-action-pins):
 * it supports exactly what a post needs — `key: scalar` and `key: [a, b, c]`,
 * optional quotes, `#` line comments. A file with no `---` fence parses as
 * all-body, which then fails validation for the missing keys.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const normalized = raw.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(normalized);
  if (!match) return { data: {}, body: normalized.trim() };
  const [, block = '', body = ''] = match;
  const data: Record<string, string | string[]> = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed);
    if (!kv) continue;
    const [, key = '', rawValue = ''] = kv;
    data[key] = parseValue(rawValue);
  }
  return { data, body: body.trim() };
}

function parseValue(raw: string): string | string[] {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter((item) => item !== '');
  }
  return stripQuotes(value);
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]/, '').replace(/['"]$/, '');
}

function asArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value !== '') return [value];
  return [];
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Build a Post from a parsed file and collect any structural errors (empty =
 * valid). Never throws on bad input — the caller aggregates errors across all
 * posts and decides what to do.
 */
export function toPost(
  slug: string,
  filePath: string,
  raw: string,
): { post: Post; errors: string[] } {
  const { data, body } = parseFrontmatter(raw);
  const errors: string[] = [];

  const declaredPlatforms = asArray(data['platforms']);
  const platforms = declaredPlatforms.filter(isPlatform);
  if (declaredPlatforms.length === 0) {
    errors.push('`platforms` is required, e.g. `[instagram, threads, facebook]`');
  }
  for (const p of declaredPlatforms.filter((p) => !isPlatform(p))) {
    errors.push(`unknown platform "${p}" — allowed: ${PLATFORMS.join(', ')}`);
  }

  const statusRaw = typeof data['status'] === 'string' ? data['status'] : '';
  const status: PostStatus = (POST_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as PostStatus)
    : 'draft';
  if (!(POST_STATUSES as readonly string[]).includes(statusRaw)) {
    errors.push(`\`status\` must be ${POST_STATUSES.join(' | ')} (got "${statusRaw}")`);
  }

  const lang = typeof data['lang'] === 'string' ? data['lang'] : '';
  if (lang === '') errors.push('`lang` is required, e.g. `uk` or `en`');

  const image =
    typeof data['image'] === 'string' && data['image'] !== '' ? data['image'] : undefined;
  if (platforms.includes('instagram') && image === undefined) {
    errors.push(
      '`image` is required when `instagram` is targeted (Instagram has no text-only post)',
    );
  }

  if (body === '') errors.push('caption body is empty');
  for (const platform of platforms) {
    if (body.length > CAPTION_LIMITS[platform]) {
      errors.push(
        `caption is ${body.length} chars — over ${platform}'s ${CAPTION_LIMITS[platform]} limit`,
      );
    }
  }

  const frontmatter: PostFrontmatter = {
    platforms,
    lang,
    status,
    ...(image !== undefined ? { image } : {}),
  };
  return { post: { slug, filePath, frontmatter, caption: body }, errors };
}

/**
 * Read and parse every `*.md` post in `dir` (skips README + dotfiles), sorted
 * by slug. Returns each post with its structural errors. A missing directory
 * yields an empty list rather than throwing.
 */
export async function loadPosts(dir: string): Promise<{ post: Post; errors: string[] }[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files = entries
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md' && !f.startsWith('.'))
    .sort();
  const results: { post: Post; errors: string[] }[] = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const raw = await readFile(filePath, 'utf8');
    results.push(toPost(file.replace(/\.md$/, ''), filePath, raw));
  }
  return results;
}

/** Base URL a network fetches cards from; overridable via `MOVAR_SITE_URL`
 *  (e.g. to point at a preview deploy). */
export function siteBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env['MOVAR_SITE_URL'];
  return fromEnv && fromEnv !== '' ? fromEnv : DEFAULT_SITE_URL;
}

/** Public URL of a card image (what the Graph/Threads API fetches). */
export function mediaUrl(image: string, siteUrl: string = siteBaseUrl()): string {
  return `${siteUrl.replace(/\/+$/, '')}/${image.replace(/^\/+/, '')}`;
}

/** Absolute path to the committed card under marketing `public/`. */
export function mediaFilePath(image: string, repoRoot: string): string {
  return path.resolve(repoRoot, 'apps/marketing/public', image.replace(/^\/+/, ''));
}

/** Networks this post still owes: targeted minus already in the ledger. The
 *  idempotency core. */
export function pendingPlatforms(post: Post, ledger: Ledger): Platform[] {
  const done = ledger[post.slug] ?? {};
  return post.frontmatter.platforms.filter((p) => done[p] === undefined);
}
