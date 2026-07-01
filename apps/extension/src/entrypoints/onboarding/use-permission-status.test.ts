import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { usePermissionStatus } from './use-permission-status';

type ContainsFn = (p: { origins: string[] }) => Promise<boolean>;

/** Point `browser.permissions` at a controllable object. Always a truthy object
 *  (never `undefined`) so a later `fakeBrowser.reset()` doesn't choke resetting a
 *  clobbered namespace. Omit `contains` to model the preview (no API). */
function setPermissions(contains?: ContainsFn): void {
  (browser as unknown as { permissions: { contains?: ContainsFn } }).permissions = contains
    ? { contains }
    : {};
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePermissionStatus', () => {
  it('reports granted when host access to every site is held', async () => {
    const contains = vi.fn<ContainsFn>().mockResolvedValue(true);
    setPermissions(contains);

    const { result } = renderHook(() => usePermissionStatus());

    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });
    expect(contains).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
  });

  it('reports missing when host access is not held (e.g. revoked on Firefox)', async () => {
    setPermissions(vi.fn<ContainsFn>().mockResolvedValue(false));

    const { result } = renderHook(() => usePermissionStatus());

    await waitFor(() => {
      expect(result.current.status).toBe('missing');
    });
  });

  it('reports unavailable when the permissions API is absent (preview)', async () => {
    setPermissions(); // no contains — mirrors the static-serve preview

    const { result } = renderHook(() => usePermissionStatus());

    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('reports unavailable when the check rejects (inconclusive, not a denial)', async () => {
    setPermissions(vi.fn<ContainsFn>().mockRejectedValue(new Error('inconclusive')));

    const { result } = renderHook(() => usePermissionStatus());

    await waitFor(() => {
      expect(result.current.status).toBe('unavailable');
    });
  });

  it('recheck re-queries and flips missing → granted', async () => {
    const contains = vi.fn<ContainsFn>().mockResolvedValue(false);
    setPermissions(contains);

    const { result } = renderHook(() => usePermissionStatus());
    await waitFor(() => {
      expect(result.current.status).toBe('missing');
    });

    contains.mockResolvedValue(true);
    await act(async () => {
      result.current.recheck();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });
  });
});
