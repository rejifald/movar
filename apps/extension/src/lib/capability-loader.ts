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
export type ChunkLoader = (path: CapabilityChunk) => Promise<LoadedChunk>;

/* v8 ignore start -- live extension import path; tests exercise createCapabilityLoader with fakes. */
const defaultChunkLoader: ChunkLoader = async (path) => {
  const runtime = browser.runtime as unknown as { getURL(path: string): string };
  const url = runtime.getURL(path);
  // eslint-disable-next-line no-unsanitized/method -- url is our own packaged chunk via runtime.getURL, not external input
  return import(/* @vite-ignore */ url) as Promise<LoadedChunk>;
};
/* v8 ignore stop */

export interface CapabilityLoader {
  loadCapabilityChunk: (path: CapabilityChunk) => Promise<LoadedChunk | null>;
  provisionCapabilities: (needs: CapabilityNeeds) => Promise<ProvisionedCapabilityModules>;
}

export function createCapabilityLoader(chunkLoader: ChunkLoader): CapabilityLoader {
  const chunkPromises = new Map<CapabilityChunk, Promise<LoadedChunk | null>>();

  async function loadCapabilityChunk(path: CapabilityChunk): Promise<LoadedChunk | null> {
    let promise = chunkPromises.get(path);
    if (!promise) {
      promise = chunkLoader(path).catch(() => null);
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
