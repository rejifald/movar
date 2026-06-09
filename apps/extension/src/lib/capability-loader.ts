import { browser } from 'wxt/browser';
import type { CapabilityChunk, CapabilityNeeds } from './capabilities';

export type CapabilityModule = Record<string, unknown>;
export type ChunkLoader = (path: CapabilityChunk) => Promise<CapabilityModule>;
type RuntimeWithGetUrl = typeof browser.runtime & {
  getURL(path: string): string;
};

export interface ProvisionedCapabilities {
  conceal: CapabilityModule | null;
  model: CapabilityModule | null;
  presenter: CapabilityModule | null;
}

const defaultChunkLoader: ChunkLoader = async (path) => {
  const url = (browser.runtime as RuntimeWithGetUrl).getURL(path);
  // eslint-disable-next-line no-unsanitized/method -- CapabilityChunk is a closed packaged-path union/pattern resolved through runtime.getURL, never remote input.
  return import(/* @vite-ignore */ url) as Promise<CapabilityModule>;
};

let chunkLoader = defaultChunkLoader;
const chunkPromises = new Map<CapabilityChunk, Promise<CapabilityModule | null>>();

async function loadWithCurrentLoader(path: CapabilityChunk): Promise<CapabilityModule> {
  await Promise.resolve();
  return chunkLoader(path);
}

// Must return the cached promise object directly so concurrent callers dedupe.
// eslint-disable-next-line @typescript-eslint/promise-function-async -- async would wrap the cached promise and break identity dedupe.
export function loadCapabilityChunk(path: CapabilityChunk): Promise<CapabilityModule | null> {
  const cached = chunkPromises.get(path);
  if (cached) return cached;

  const promise = loadWithCurrentLoader(path).catch(() => null);
  chunkPromises.set(path, promise);
  return promise;
}

export async function provisionCapabilities(
  needs: CapabilityNeeds,
): Promise<ProvisionedCapabilities> {
  const [conceal, model, presenter] = await Promise.all([
    needs.conceal === undefined ? null : loadCapabilityChunk(needs.conceal),
    needs.model === undefined ? null : loadCapabilityChunk(needs.model),
    needs.presenter === undefined ? null : loadCapabilityChunk(needs.presenter),
  ]);

  return { conceal, model, presenter };
}

export function setChunkLoaderForTest(loader: ChunkLoader): void {
  chunkLoader = loader;
  chunkPromises.clear();
}

export function resetChunkLoaderForTest(): void {
  chunkLoader = defaultChunkLoader;
  chunkPromises.clear();
}
