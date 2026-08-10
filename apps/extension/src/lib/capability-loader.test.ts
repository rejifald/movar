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

  it('resolves a failed import to null', async () => {
    const loader = vi.fn(async () => {
      await Promise.resolve();
      throw new Error('boom');
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    await expect(loadCapabilityChunk('features/curtain-ui.js')).resolves.toBeNull();
  });

  it('does NOT memoize a failure — the next call retries and can succeed', async () => {
    // A rejection is usually transient (cold worker, fetch racing a navigation).
    // Caching its `null` used to disable the capability for the page's whole
    // life: concealment silently did nothing in that tab forever, with no mark
    // on the DOM to say so. Every later tick must get a fresh attempt.
    let attempt = 0;
    const loader = vi.fn(async () => {
      await Promise.resolve();
      attempt += 1;
      if (attempt === 1) throw new Error('transient');
      return { path: 'features/conceal.js' };
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    await expect(loadCapabilityChunk('features/conceal.js')).resolves.toBeNull();
    await expect(loadCapabilityChunk('features/conceal.js')).resolves.toEqual({
      path: 'features/conceal.js',
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('memoizes the recovered module, so the retry costs exactly one re-import', async () => {
    let attempt = 0;
    const loader = vi.fn(async () => {
      await Promise.resolve();
      attempt += 1;
      if (attempt === 1) throw new Error('transient');
      return { path: 'models/google.js' };
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    await loadCapabilityChunk('models/google.js');
    const recovered = await loadCapabilityChunk('models/google.js');
    const third = await loadCapabilityChunk('models/google.js');

    expect(third).toBe(recovered);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('hands each retry an incrementing attempt number', async () => {
    // The live loader turns this into a distinct module specifier. Without it
    // the retry replays the realm module map's stored failure and never even
    // issues a fetch, so evicting our own cache would buy nothing.
    const seen: number[] = [];
    const loader = vi.fn(async (_path: CapabilityChunk, attempt: number) => {
      await Promise.resolve();
      seen.push(attempt);
      if (attempt < 2) throw new Error('transient');
      return { path: 'features/conceal.js' };
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    await loadCapabilityChunk('features/conceal.js');
    await loadCapabilityChunk('features/conceal.js');
    await expect(loadCapabilityChunk('features/conceal.js')).resolves.toEqual({
      path: 'features/conceal.js',
    });

    expect(seen).toEqual([0, 1, 2]);
  });

  it('counts attempts per chunk, so one chunk failing never re-imports another', async () => {
    const seen: [string, number][] = [];
    const loader = vi.fn(async (path: CapabilityChunk, attempt: number) => {
      await Promise.resolve();
      seen.push([path, attempt]);
      if (path === 'models/google.js' && attempt === 0) throw new Error('transient');
      return { path };
    });
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    await loadCapabilityChunk('features/conceal.js');
    await loadCapabilityChunk('models/google.js');
    await loadCapabilityChunk('features/conceal.js');
    await loadCapabilityChunk('models/google.js');

    expect(seen).toEqual([
      ['features/conceal.js', 0],
      ['models/google.js', 0],
      ['models/google.js', 1],
    ]);
  });

  it('still dedupes concurrent callers across a FAILING load', async () => {
    // The eviction must not reopen the dedupe window it lives in: callers that
    // arrive while one doomed import is in flight share that attempt (one
    // import, all null), and only a call made after it settles retries.
    let reject!: (error: Error) => void;
    const loader = vi.fn(
      async () =>
        new Promise<object>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const { loadCapabilityChunk } = createCapabilityLoader(loader);

    const first = loadCapabilityChunk('models/youtube.js');
    const concurrent = loadCapabilityChunk('models/youtube.js');
    reject(new Error('transient'));

    await expect(first).resolves.toBeNull();
    await expect(concurrent).resolves.toBeNull();
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
