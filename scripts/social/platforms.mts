/**
 * Graph API clients for the three networks. Every call uses the documented
 * container→publish shapes for Graph API v21.0 / Threads v1.0 (stable since
 * 2024). Confirm endpoints, permission names, and rate limits against the
 * current docs before enabling live publishing — Meta rotates these:
 *   - Facebook Pages:  https://developers.facebook.com/docs/pages-api
 *   - Instagram:       https://developers.facebook.com/docs/instagram-platform/content-publishing
 *   - Threads:         https://developers.facebook.com/docs/threads/posts
 *
 * Nothing here runs unless the orchestrator is invoked with `--publish` AND
 * the network's credentials are present in the environment. `fetch` is
 * injected so tests never touch the network.
 */

import type { Platform, PublishRecord } from './types.mts';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const THREADS_BASE = 'https://graph.threads.net/v1.0';

export type FetchFn = typeof fetch;

export interface PublishInput {
  caption: string;
  /** Public URL of the card image; undefined for a text-only post. */
  imageUrl?: string;
}

export interface PlatformClient {
  publish(input: PublishInput): Promise<PublishRecord>;
}

export interface PlatformCredentials {
  instagram?: { userId: string; accessToken: string };
  facebook?: { pageId: string; accessToken: string };
  threads?: { userId: string; accessToken: string };
}

/** Read credentials from the environment. A network is "configured" only when
 *  BOTH its id and token are present. */
export function readCredentials(
  env: Record<string, string | undefined> = process.env,
): PlatformCredentials {
  const creds: PlatformCredentials = {};
  const igId = env['IG_USER_ID'];
  const igToken = env['IG_ACCESS_TOKEN'];
  if (igId && igToken) creds.instagram = { userId: igId, accessToken: igToken };
  const fbId = env['FB_PAGE_ID'];
  const fbToken = env['FB_PAGE_ACCESS_TOKEN'];
  if (fbId && fbToken) creds.facebook = { pageId: fbId, accessToken: fbToken };
  const thId = env['THREADS_USER_ID'];
  const thToken = env['THREADS_ACCESS_TOKEN'];
  if (thId && thToken) creds.threads = { userId: thId, accessToken: thToken };
  return creds;
}

/** Resolve the client for a network, or undefined when it isn't configured. */
export function clientFor(
  platform: Platform,
  creds: PlatformCredentials,
  fetchFn: FetchFn = fetch,
): PlatformClient | undefined {
  if (platform === 'facebook' && creds.facebook) return facebookClient(creds.facebook, fetchFn);
  if (platform === 'instagram' && creds.instagram) return instagramClient(creds.instagram, fetchFn);
  if (platform === 'threads' && creds.threads) return threadsClient(creds.threads, fetchFn);
  return undefined;
}

/** Facebook Page: a photo post when an image is present, else a text status. */
export function facebookClient(
  creds: NonNullable<PlatformCredentials['facebook']>,
  fetchFn: FetchFn = fetch,
): PlatformClient {
  return {
    async publish({ caption, imageUrl }) {
      if (imageUrl) {
        const url = `${GRAPH_BASE}/${creds.pageId}/photos`;
        const res = await postForm(fetchFn, url, {
          url: imageUrl,
          caption,
          access_token: creds.accessToken,
        });
        const id = typeof res['post_id'] === 'string' ? res['post_id'] : requireId(res, url);
        return { id, at: nowIso() };
      }
      const url = `${GRAPH_BASE}/${creds.pageId}/feed`;
      const res = await postForm(fetchFn, url, {
        message: caption,
        access_token: creds.accessToken,
      });
      return { id: requireId(res, url), at: nowIso() };
    },
  };
}

/** Instagram: create an image container, then publish it (two calls). */
export function instagramClient(
  creds: NonNullable<PlatformCredentials['instagram']>,
  fetchFn: FetchFn = fetch,
): PlatformClient {
  return {
    async publish({ caption, imageUrl }) {
      if (!imageUrl) throw new Error('Instagram requires an image — this post has none');
      const createUrl = `${GRAPH_BASE}/${creds.userId}/media`;
      const container = await postForm(fetchFn, createUrl, {
        image_url: imageUrl,
        caption,
        access_token: creds.accessToken,
      });
      const creationId = requireId(container, createUrl);
      const publishUrl = `${GRAPH_BASE}/${creds.userId}/media_publish`;
      const published = await postForm(fetchFn, publishUrl, {
        creation_id: creationId,
        access_token: creds.accessToken,
      });
      const id = requireId(published, publishUrl);
      const record: PublishRecord = { id, at: nowIso() };
      const permalink = await permalinkFor(fetchFn, `${GRAPH_BASE}/${id}`, creds.accessToken);
      if (permalink !== undefined) record.permalink = permalink;
      return record;
    },
  };
}

/** Threads: create an IMAGE (or TEXT) container, then publish it. */
export function threadsClient(
  creds: NonNullable<PlatformCredentials['threads']>,
  fetchFn: FetchFn = fetch,
): PlatformClient {
  return {
    async publish({ caption, imageUrl }) {
      const createUrl = `${THREADS_BASE}/${creds.userId}/threads`;
      const container = await postForm(fetchFn, createUrl, {
        media_type: imageUrl ? 'IMAGE' : 'TEXT',
        ...(imageUrl ? { image_url: imageUrl } : {}),
        text: caption,
        access_token: creds.accessToken,
      });
      const creationId = requireId(container, createUrl);
      const publishUrl = `${THREADS_BASE}/${creds.userId}/threads_publish`;
      const published = await postForm(fetchFn, publishUrl, {
        creation_id: creationId,
        access_token: creds.accessToken,
      });
      const id = requireId(published, publishUrl);
      const record: PublishRecord = { id, at: nowIso() };
      const permalink = await permalinkFor(fetchFn, `${THREADS_BASE}/${id}`, creds.accessToken);
      if (permalink !== undefined) record.permalink = permalink;
      return record;
    },
  };
}

async function postForm(
  fetchFn: FetchFn,
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

/** Best-effort permalink lookup; a failure just leaves the record without one. */
async function permalinkFor(
  fetchFn: FetchFn,
  base: string,
  accessToken: string,
): Promise<string | undefined> {
  try {
    const res = await fetchFn(
      `${base}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<string, unknown>;
    return typeof json['permalink'] === 'string' ? json['permalink'] : undefined;
  } catch {
    return undefined;
  }
}

function requireId(obj: Record<string, unknown>, url: string): string {
  const id = obj['id'];
  if (typeof id !== 'string' || id === '') {
    throw new Error(`${url} returned no id: ${JSON.stringify(obj).slice(0, 300)}`);
  }
  return id;
}

function nowIso(): string {
  return new Date().toISOString();
}
