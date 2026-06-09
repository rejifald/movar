import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONCEAL_FEATURE_CHUNK, CURTAIN_UI_FEATURE_CHUNK } from './capabilities';
import type { CapabilityChunk } from './capabilities';
import {
  loadCapabilityChunk,
  provisionCapabilities,
  resetChunkLoaderForTest,
  setChunkLoaderForTest,
} from './capability-loader';
import type { CapabilityModule, ChunkLoader } from './capability-loader';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  resetChunkLoaderForTest();
});

describe('loadCapabilityChunk', () => {
  it('memoizes loaded chunks by path', async () => {
    const module = { kind: 'conceal' };
    const loader = vi.fn<ChunkLoader>(async () => {
      await Promise.resolve();
      return module;
    });
    setChunkLoaderForTest(loader);

    const first = await loadCapabilityChunk(CONCEAL_FEATURE_CHUNK);
    const second = await loadCapabilityChunk(CONCEAL_FEATURE_CHUNK);

    expect(first).toBe(module);
    expect(second).toBe(module);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('dedupes concurrent requests for the same chunk', async () => {
    const module = { kind: 'google-model' };
    const pending = deferred<CapabilityModule>();
    const loader = vi.fn<ChunkLoader>(async () => {
      await Promise.resolve();
      return pending.promise;
    });
    setChunkLoaderForTest(loader);

    const first = loadCapabilityChunk('models/google.js');
    const second = loadCapabilityChunk('models/google.js');

    expect(first).toBe(second);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledOnce();

    pending.resolve(module);
    await expect(first).resolves.toBe(module);
    await expect(second).resolves.toBe(module);
  });

  it('resolves failed imports to null', async () => {
    const loader = vi.fn<ChunkLoader>(async () => {
      await Promise.resolve();
      throw new Error('missing chunk');
    });
    setChunkLoaderForTest(loader);

    await expect(loadCapabilityChunk(CURTAIN_UI_FEATURE_CHUNK)).resolves.toBeNull();
    expect(loader).toHaveBeenCalledOnce();
  });
});

describe('provisionCapabilities', () => {
  it('loads requested conceal, model, and presenter chunks in parallel', async () => {
    const chunks = new Map<CapabilityChunk, ReturnType<typeof deferred<CapabilityModule>>>([
      [CONCEAL_FEATURE_CHUNK, deferred<CapabilityModule>()],
      ['models/youtube.js', deferred<CapabilityModule>()],
      [CURTAIN_UI_FEATURE_CHUNK, deferred<CapabilityModule>()],
    ]);
    const loader = vi.fn<ChunkLoader>(async (path) => {
      await Promise.resolve();
      return chunks.get(path)!.promise;
    });
    setChunkLoaderForTest(loader);

    const result = provisionCapabilities({
      conceal: CONCEAL_FEATURE_CHUNK,
      model: 'models/youtube.js',
      presenter: CURTAIN_UI_FEATURE_CHUNK,
    });

    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(3);
    expect(loader.mock.calls.map(([path]) => path)).toEqual([
      CONCEAL_FEATURE_CHUNK,
      'models/youtube.js',
      CURTAIN_UI_FEATURE_CHUNK,
    ]);

    chunks.get(CONCEAL_FEATURE_CHUNK)!.resolve({ kind: 'conceal' });
    chunks.get('models/youtube.js')!.resolve({ kind: 'youtube-model' });
    chunks.get(CURTAIN_UI_FEATURE_CHUNK)!.resolve({ kind: 'presenter' });

    await expect(result).resolves.toEqual({
      conceal: { kind: 'conceal' },
      model: { kind: 'youtube-model' },
      presenter: { kind: 'presenter' },
    });
  });

  it('does not load absent needs and returns null placeholders', async () => {
    const loader = vi.fn<ChunkLoader>(async () => {
      await Promise.resolve();
      return { kind: 'unused' };
    });
    setChunkLoaderForTest(loader);

    await expect(provisionCapabilities({})).resolves.toEqual({
      conceal: null,
      model: null,
      presenter: null,
    });
    expect(loader).not.toHaveBeenCalled();
  });
});
