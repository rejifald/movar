import { browser } from 'wxt/browser';
import type { PageContentModel } from '@movar/page-content/types';
import type { CapabilityChunk, CapabilityNeeds } from './capabilities';
import type * as ConcealFeature from '../dynamic/features/conceal';
import type * as CurtainUiFeature from '../dynamic/features/curtain-ui';

export type ConcealFeatureModule = typeof ConcealFeature;
export type CurtainUiFeatureModule = typeof CurtainUiFeature;

export interface ModelFeatureModule {
  extract(root?: ParentNode): PageContentModel;
}

export interface ProvisionedCapabilityModules {
  conceal: ConcealFeatureModule | null;
  model: ModelFeatureModule | null;
  presenter: CurtainUiFeatureModule | null;
}

export type LoadedChunk = object;
/** Loads one packaged chunk. `attempt` is 0 for the first try and increments on
 *  every retry after a failure — the live loader needs it to make each retry a
 *  distinct module key (see {@link defaultChunkLoader}). */
export type ChunkLoader = (path: CapabilityChunk, attempt: number) => Promise<LoadedChunk>;

/* v8 ignore start -- live extension import path; tests exercise createCapabilityLoader with fakes. */
const defaultChunkLoader: ChunkLoader = async (path, attempt) => {
  const runtime = browser.runtime as unknown as { getURL(path: string): string };
  const url = runtime.getURL(path);
  // A retry MUST NOT reuse the first attempt's URL. A dynamic import that fails
  // is recorded as a failure in the realm's module map, and re-importing the
  // same specifier replays that stored rejection — no new fetch is even issued
  // (verified live: the chunk request appears exactly once no matter how many
  // apply ticks follow). Evicting our own cache alone would therefore retry
  // straight into a cached error forever. A unique query gives the retry a
  // distinct module key while resolving to the same packaged file —
  // `web_accessible_resources` matches on the path, so the query is invisible
  // to it.
  const specifier = attempt === 0 ? url : `${url}?retry=${attempt}`;
  // eslint-disable-next-line no-unsanitized/method -- specifier is our own packaged chunk via runtime.getURL, not external input
  return import(/* @vite-ignore */ specifier) as Promise<LoadedChunk>;
};
/* v8 ignore stop */

export interface CapabilityLoader {
  loadCapabilityChunk: (path: CapabilityChunk) => Promise<LoadedChunk | null>;
  provisionCapabilities: (needs: CapabilityNeeds) => Promise<ProvisionedCapabilityModules>;
}

export function createCapabilityLoader(chunkLoader: ChunkLoader): CapabilityLoader {
  const chunkPromises = new Map<CapabilityChunk, Promise<LoadedChunk | null>>();
  /** Failed attempts per chunk, handed to the loader so each retry can be a
   *  distinct module key. Counts attempts, not successes: a chunk that loaded
   *  first time stays at 0 and is never re-imported. */
  const attempts = new Map<CapabilityChunk, number>();

  async function loadCapabilityChunk(path: CapabilityChunk): Promise<LoadedChunk | null> {
    let promise = chunkPromises.get(path);
    if (!promise) {
      const attempt = attempts.get(path) ?? 0;
      promise = chunkLoader(path, attempt).catch(() => {
        // Memoize SUCCESS only. A rejection is usually transient — a cold
        // service worker, a chunk fetch racing a navigation — and caching the
        // resulting `null` would disable the capability for the whole life of
        // the page: every later tick would read the poisoned entry and skip the
        // import, so concealment never recovers in that tab and leaves no trace
        // that it failed. Dropping the entry costs one re-import in the rare
        // genuinely-broken case and restores the feature in every recoverable
        // one; the next apply tick (MutationObserver / locationchange / settings
        // change) is what retries.
        //
        // Evicting unconditionally is safe: this handler runs as a microtask
        // after the synchronous `set` below, and the entry is only ever replaced
        // AFTER an eviction — so the value here is always this attempt's own.
        chunkPromises.delete(path);
        attempts.set(path, attempt + 1);
        return null;
      });
      chunkPromises.set(path, promise);
    }
    return promise;
  }

  async function provisionCapabilities(
    needs: CapabilityNeeds,
  ): Promise<ProvisionedCapabilityModules> {
    const [conceal, model, presenter] = await Promise.all([
      needs.conceal ? loadCapabilityChunk(needs.conceal) : null,
      needs.model ? loadCapabilityChunk(needs.model) : null,
      needs.presenter ? loadCapabilityChunk(needs.presenter) : null,
    ]);
    return {
      conceal: conceal as ConcealFeatureModule | null,
      model: model as ModelFeatureModule | null,
      presenter: presenter as CurtainUiFeatureModule | null,
    };
  }

  return { loadCapabilityChunk, provisionCapabilities };
}

const liveCapabilityLoader = createCapabilityLoader(defaultChunkLoader);

export const provisionCapabilities: CapabilityLoader['provisionCapabilities'] = async (needs) =>
  liveCapabilityLoader.provisionCapabilities(needs);
