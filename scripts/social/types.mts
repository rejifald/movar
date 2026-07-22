/**
 * Shared types for the social publishing pipeline (`scripts/social/`).
 *
 * A "post" is a Markdown file in `posts/`: a small frontmatter block (which
 * networks, which locale, which committed card image, draft vs. ready) plus
 * the caption as the body. The pipeline validates every post, then — only
 * with credentials and an explicit `--publish` — pushes each `ready` post to
 * the networks it names, recording what it published in a ledger so re-runs
 * never double-post.
 */

export const PLATFORMS = ['instagram', 'threads', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const POST_STATUSES = ['draft', 'ready'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export interface PostFrontmatter {
  /** Networks this post targets. At least one; each must be a Platform. */
  platforms: Platform[];
  /** Locale tag for the human record + which card to use; free-form, but
   *  the site's locales are `en` / `uk`. */
  lang: string;
  /** Path to the committed card under `apps/marketing/public/`, e.g.
   *  `social/uk/01-meet-movar.png`. Optional in general, but REQUIRED when
   *  `instagram` is targeted — Instagram has no text-only post. */
  image?: string;
  /** Only `ready` posts publish; `draft` posts are validated and skipped. */
  status: PostStatus;
}

export interface Post {
  /** Filename without `.md`; the ledger key. */
  slug: string;
  /** Absolute path to the source file. */
  filePath: string;
  frontmatter: PostFrontmatter;
  /** Caption = the Markdown body after the frontmatter, trimmed. */
  caption: string;
}

/** One network's published-post record, kept in the ledger. */
export interface PublishRecord {
  id: string;
  permalink?: string;
  /** ISO-8601 UTC; stamped by the publisher after a successful post. */
  at: string;
}

/**
 * `posts/.published.json` — slug → per-network record. Idempotency lives
 * here: a network already present for a slug is never re-posted. Committed
 * back by CI (with `[skip ci]`) after a successful publish.
 */
export type Ledger = Record<string, Partial<Record<Platform, PublishRecord>>>;
