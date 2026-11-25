import type { FetchLike, FetchLikeResponse } from './probe';

/** A real fetch is asynchronous; yielding a microtask keeps the stubs honest. */
export async function tick(): Promise<void> {
  await Promise.resolve();
}

/** Every test injects this. Nothing here touches a real network. */
export interface StubResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export function respond(stub: StubResponse): FetchLikeResponse {
  const headers = stub.headers ?? {};
  return {
    status: stub.status,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
      forEach: (fn: (value: string, key: string) => void) => {
        for (const [key, value] of Object.entries(headers)) fn(value, key);
      },
    },
    text: async () => {
      await tick();
      return stub.body ?? '';
    },
  };
}

/** A fetch that answers from a URL map and records what it was asked. */
export function stubFetch(routes: Readonly<Record<string, StubResponse>>): {
  readonly fetchImpl: FetchLike;
  readonly seen: { url: string; headers: Record<string, string> }[];
} {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url, headers: init.headers });
    const stub = routes[url];
    if (stub === undefined) throw new Error(`unstubbed ${url}`);
    await tick();
    return respond(stub);
  };
  return { fetchImpl, seen };
}

export const HOME = 'https://example.com/';

/** A transport that always fails, for the `error` outcome. */
export const failingFetch: FetchLike = async () => {
  await tick();
  throw new Error('ECONNRESET');
};

/** A redirect to a URL never seen before, forever: only the hop cap ends it. */
export function endlessChain(): FetchLike {
  let n = 0;
  return async () => {
    n += 1;
    await tick();
    return respond({ status: 302, headers: { location: `https://example.com/${n}` } });
  };
}
