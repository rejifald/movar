import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { usePermissionStatus } from './use-permission-status';

type ContainsFn = (p: { origins: string[] }) => Promise<boolean>;
type RequestFn = (p: { origins: string[] }) => Promise<boolean>;

/** Default `resolveRequest` before a test wires up its own — calling it means
 *  the assertion ran before `request()` was actually invoked. Module-scoped
 *  (not inline) since it closes over nothing test-specific. */
function resolveRequestNotYetSet(): never {
  throw new Error('resolveRequest called before request() was invoked');
}

/** Point `browser.permissions` at a controllable object. Always a truthy object
 *  (never `undefined`) so a later `fakeBrowser.reset()` doesn't choke resetting a
 *  clobbered namespace. Omit `contains`/`request` to model the preview or Safari
 *  (no API) for each respectively. */
function setPermissions(contains?: ContainsFn, request?: RequestFn): void {
  (
    browser as unknown as { permissions: { contains?: ContainsFn; request?: RequestFn } }
  ).permissions = {
    ...(contains && { contains }),
    ...(request && { request }),
  };
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

  it('re-checks host access when the window regains focus', async () => {
    const contains = vi.fn<ContainsFn>().mockResolvedValue(true);
    setPermissions(contains);

    renderHook(() => usePermissionStatus());
    await waitFor(() => {
      expect(contains).toHaveBeenCalledTimes(1);
    });

    // Returning from the browser's extension settings fires focus → re-check.
    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(contains).toHaveBeenCalledTimes(2);
  });

  it('request() calls permissions.request, then recheck() reflects the result', async () => {
    const contains = vi.fn<ContainsFn>().mockResolvedValue(false);
    const request = vi.fn<RequestFn>().mockResolvedValue(true);
    setPermissions(contains, request);

    const { result } = renderHook(() => usePermissionStatus());
    await waitFor(() => {
      expect(result.current.status).toBe('missing');
    });

    contains.mockResolvedValue(true);
    await act(async () => {
      result.current.request();
      await Promise.resolve();
    });

    expect(request).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });
  });

  it('sets status to requesting while the native prompt is in flight', async () => {
    const contains = vi.fn<ContainsFn>().mockResolvedValue(false);
    let resolveRequest: (held: boolean) => void = resolveRequestNotYetSet;
    const request = vi.fn<RequestFn>(
      async () =>
        new Promise<boolean>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    setPermissions(contains, request);

    const { result } = renderHook(() => usePermissionStatus());
    await waitFor(() => {
      expect(result.current.status).toBe('missing');
    });

    act(() => {
      result.current.request();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('requesting');
    });

    await act(async () => {
      resolveRequest(true);
      await Promise.resolve();
    });
  });

  it('request() is a no-op where permissions.request is unavailable (preview, Safari)', () => {
    setPermissions(vi.fn<ContainsFn>().mockResolvedValue(false)); // contains only, no request
    const { result } = renderHook(() => usePermissionStatus());

    act(() => {
      result.current.request();
    });

    // No request fn to call — status never moves to 'requesting'.
    expect(result.current.status).not.toBe('requesting');
  });

  it('a rejected request still recovers via recheck (inconclusive, not a denial)', async () => {
    const contains = vi.fn<ContainsFn>().mockResolvedValue(false);
    const request = vi.fn<RequestFn>().mockRejectedValue(new Error('no user gesture'));
    setPermissions(contains, request);

    const { result } = renderHook(() => usePermissionStatus());
    await waitFor(() => {
      expect(result.current.status).toBe('missing');
    });

    await act(async () => {
      result.current.request();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('missing');
    });
  });
});
