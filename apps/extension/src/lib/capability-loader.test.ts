import { describe, expect, it, vi } from 'vitest';
import { createCapabilityLoader } from './capability-loader';
import type { CapabilityChunk, CapabilityNeeds } from './capabilities';

describe('loadCapabilityChunk', () => {
  it('memoizes successful imports by chunk path', async () => {
    const loader = vi.fn(async (path: CapabilityChunk) => {
      await Promise.resolve();
      return { path };
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    const first = await loadCapabilityChunk('features/conceal.js');
    const second = await loadCapabilityChunk('features/conceal.js');

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('dedupes concurrent imports for the same chunk', async () => {
    let resolve!: (value: object) => void;
    const pending = new Promise<object>((done) => {
      resolve = done;
    });
    const loader = vi.fn(async () => {
      await Promise.resolve();
      return pending;
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    const first = loadCapabilityChunk('models/youtube.js');
    const second = loadCapabilityChunk('models/youtube.js');
    resolve({ ok: true });

    expect(await first).toEqual({ ok: true });
    expect(await second).toEqual({ ok: true });
    expect(loader).toHaveBeenCalledOnce();
  });

  it('turns failed imports into memoized null modules', async () => {
    const loader = vi.fn(async () => {
      await Promise.resolve();
      throw new Error('boom');
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    await expect(loadCapabilityChunk('features/curtain-ui.js')).resolves.toBeNull();
    await expect(loadCapabilityChunk('features/curtain-ui.js')).resolves.toBeNull();
    expect(loader).toHaveBeenCalledOnce();
  });
});

describe('provisionCapabilities', () => {
  it('loads every requested chunk and skips null needs', async () => {
    const loader = vi.fn(async (path: CapabilityChunk) => {
      await Promise.resolve();
      return { path };
    });
    const { provisionCapabilities } = createCapabilityLoader(loader);
    const needs: CapabilityNeeds = {
      conceal: 'features/conceal.js',
      model: 'models/google.js',
      presenter: null,
    };

    const modules = await provisionCapabilities(needs);

    expect(modules.conceal).toEqual({ path: 'features/conceal.js' });
    expect(modules.model).toEqual({ path: 'models/google.js' });
    expect(modules.presenter).toBeNull();
    expect(loader.mock.calls.map(([path]) => path).toSorted()).toEqual([
      'features/conceal.js',
      'models/google.js',
    ]);
  });
});
