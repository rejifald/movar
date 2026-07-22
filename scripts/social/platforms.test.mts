#!/usr/bin/env node
/**
 * Unit test for the platform clients — the network-touching code that
 * `posts.test.mts` doesn't cover. Drives each client with a mock `fetch`
 * (injected), so the real container→publish request sequence runs and is
 * asserted without a network or credentials.
 *
 * Run: tsx scripts/social/platforms.test.mts   (also via `pnpm test:social`)
 */
import {
  clientFor,
  facebookClient,
  instagramClient,
  readCredentials,
  threadsClient,
  type FetchFn,
} from './platforms.mts';

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
const truthy = (v: unknown, label: string): void => (v ? ok(label) : bad(label));

interface MockResponse {
  ok?: boolean;
  status?: number;
  body: unknown;
}
interface RecordedCall {
  url: string;
  params: URLSearchParams;
}

/** A `fetch` stub that returns queued responses and records each call's URL +
 *  posted form params. Supports both `.text()` (postForm) and `.json()`
 *  (permalink lookup). */
function mockFetch(queue: MockResponse[]): { fn: FetchFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url: String(url), params: new URLSearchParams(bodyStr) });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch to ${String(url)}`);
    const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      text: () => Promise.resolve(text),
      json: () => Promise.resolve(JSON.parse(text) as unknown),
    } as Response;
  }) as FetchFn;
  return { fn, calls };
}

console.log('==> social platform clients unit test');

// 1. Facebook photo post → /photos with url+caption, id from post_id.
{
  const { fn, calls } = mockFetch([{ body: { post_id: 'fb_1' } }]);
  const client = facebookClient({ pageId: 'PAGE', accessToken: 'TK' }, fn);
  const rec = await client.publish({ caption: 'hi', imageUrl: 'https://movar.fyi/x.png' });
  eq(calls.length, 1, 'facebook photo: one call');
  truthy(calls[0]?.url.endsWith('/PAGE/photos'), 'facebook photo: posts to /{page}/photos');
  eq(calls[0]?.params.get('url'), 'https://movar.fyi/x.png', 'facebook photo: sends image url');
  eq(calls[0]?.params.get('caption'), 'hi', 'facebook photo: sends caption');
  eq(rec.id, 'fb_1', 'facebook photo: id from post_id');
}

// 2. Facebook text-only → /feed with message.
{
  const { fn, calls } = mockFetch([{ body: { id: 'fb_2' } }]);
  const client = facebookClient({ pageId: 'PAGE', accessToken: 'TK' }, fn);
  const rec = await client.publish({ caption: 'text only' });
  truthy(calls[0]?.url.endsWith('/PAGE/feed'), 'facebook text: posts to /{page}/feed');
  eq(calls[0]?.params.get('message'), 'text only', 'facebook text: sends message');
  eq(rec.id, 'fb_2', 'facebook text: id from id');
}

// 3. Instagram → create container, then publish, then permalink.
{
  const { fn, calls } = mockFetch([
    { body: { id: 'ig_container' } },
    { body: { id: 'ig_media' } },
    { body: { permalink: 'https://instagram.com/p/ig' } },
  ]);
  const client = instagramClient({ userId: 'IGU', accessToken: 'TK' }, fn);
  const rec = await client.publish({ caption: 'hi', imageUrl: 'https://movar.fyi/x.png' });
  eq(calls.length, 3, 'instagram: three calls (create, publish, permalink)');
  truthy(calls[0]?.url.endsWith('/IGU/media'), 'instagram: creates media container');
  eq(
    calls[0]?.params.get('image_url'),
    'https://movar.fyi/x.png',
    'instagram: container image_url',
  );
  truthy(calls[1]?.url.endsWith('/IGU/media_publish'), 'instagram: publishes the container');
  eq(calls[1]?.params.get('creation_id'), 'ig_container', 'instagram: publish uses creation_id');
  eq(rec.id, 'ig_media', 'instagram: id from media_publish');
  eq(rec.permalink, 'https://instagram.com/p/ig', 'instagram: permalink captured');
}

// 4. Instagram without an image throws (no text-only IG post).
{
  const { fn } = mockFetch([]);
  const client = instagramClient({ userId: 'IGU', accessToken: 'TK' }, fn);
  let threw = false;
  try {
    await client.publish({ caption: 'no image' });
  } catch {
    threw = true;
  }
  truthy(threw, 'instagram: throws when no image is provided');
}

// 5. Threads image → IMAGE container; text-only → TEXT container.
{
  const withImg = mockFetch([
    { body: { id: 'th_c' } },
    { body: { id: 'th_post' } },
    { body: { permalink: 'https://threads.net/@movar/1' } },
  ]);
  const rec = await threadsClient({ userId: 'THU', accessToken: 'TK' }, withImg.fn).publish({
    caption: 'hi',
    imageUrl: 'https://movar.fyi/x.png',
  });
  truthy(withImg.calls[0]?.url.endsWith('/THU/threads'), 'threads: creates a thread container');
  eq(withImg.calls[0]?.params.get('media_type'), 'IMAGE', 'threads: media_type IMAGE with image');
  truthy(
    withImg.calls[1]?.url.endsWith('/THU/threads_publish'),
    'threads: publishes the container',
  );
  eq(rec.id, 'th_post', 'threads: id from threads_publish');

  const textOnly = mockFetch([
    { body: { id: 'th_c2' } },
    { body: { id: 'th_post2' } },
    { body: {} },
  ]);
  await threadsClient({ userId: 'THU', accessToken: 'TK' }, textOnly.fn).publish({ caption: 'hi' });
  eq(textOnly.calls[0]?.params.get('media_type'), 'TEXT', 'threads: media_type TEXT without image');
  eq(textOnly.calls[0]?.params.get('image_url'), null, 'threads: no image_url when text-only');
}

// 6. A non-OK response surfaces as a thrown error (with the status).
{
  const { fn } = mockFetch([{ ok: false, status: 400, body: '{"error":{"message":"bad token"}}' }]);
  const client = facebookClient({ pageId: 'PAGE', accessToken: 'TK' }, fn);
  let message = '';
  try {
    await client.publish({ caption: 'hi', imageUrl: 'https://movar.fyi/x.png' });
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  truthy(message.includes('400'), 'error path: a 400 response throws with the status');
}

// 7. readCredentials + clientFor gate on presence of both id and token.
{
  const empty = readCredentials({});
  eq(clientFor('facebook', empty), undefined, 'clientFor: undefined when unconfigured');

  const partial = readCredentials({ IG_USER_ID: 'x' }); // token missing
  eq(partial.instagram, undefined, 'readCredentials: id without token → not configured');

  const full = readCredentials({
    FB_PAGE_ID: 'p',
    FB_PAGE_ACCESS_TOKEN: 't',
    THREADS_USER_ID: 'u',
    THREADS_ACCESS_TOKEN: 't',
  });
  truthy(clientFor('facebook', full), 'clientFor: returns a client when configured');
  truthy(clientFor('threads', full), 'clientFor: threads client when configured');
  eq(
    clientFor('instagram', full),
    undefined,
    'clientFor: still undefined for unconfigured network',
  );
}

console.log(
  failed === 0 ? '\n✓ all platform-client checks passed' : `\n✗ ${failed} check(s) failed`,
);
process.exit(failed > 0 ? 1 : 0);
