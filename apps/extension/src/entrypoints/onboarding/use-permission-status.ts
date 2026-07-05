import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

/**
 * Best-effort read of whether Movar actually holds host access to every site —
 * the permission the onboarding page exists to secure — plus the ability to
 * request it.
 *
 * - `granted`   — `permissions.contains({ origins: ['<all_urls>'] })` is true.
 * - `missing`   — it's false: on Chromium/Firefox this is now the honest,
 *                 actionable starting state (`<all_urls>` is requested at
 *                 runtime, not granted at install — see wxt.config.ts), or a
 *                 Firefox user who revoked "Access your data for all websites".
 *                 Either way the access step's button calls `request()`.
 * - `requesting` — a `request()` call is in flight (the native prompt is up).
 * - `unavailable` — no `browser.permissions` (the static-serve preview) — the
 *                 page falls back to instructions only, no status line.
 *
 * Re-checks when the tab regains focus so returning from the browser's
 * settings (e.g. a manual grant/revoke outside our button) updates the line
 * without a manual poke.
 */
export type PermissionStatus = 'checking' | 'granted' | 'missing' | 'requesting' | 'unavailable';

const ALL_SITES = { origins: ['<all_urls>'] };

/** `browser.permissions` is typed as always-present, but the static-serve
 *  preview has no WebExtension APIs — narrow to a possibly-absent shape so the
 *  unavailable branch is real (and not a lint "unnecessary condition"). Safari
 *  has no `request` (its grant path is Safari-Settings-native, not exposed
 *  through this API) — narrowed separately so `request()` can no-op there. */
type MaybePermissions =
  | {
      contains?: (p: { origins: string[] }) => Promise<boolean>;
      request?: (p: { origins: string[] }) => Promise<boolean>;
    }
  | undefined;

export interface PermissionStatusHandle {
  readonly status: PermissionStatus;
  /** Re-run the check now (the access step's "Check again" affordance). */
  readonly recheck: () => void;
  /** Fire the native "allow access" prompt for every site. No-op where
   *  `browser.permissions.request` is unavailable (preview, Safari). */
  readonly request: () => void;
}

export function usePermissionStatus(): PermissionStatusHandle {
  const [status, setStatus] = useState<PermissionStatus>('checking');

  const recheck = useCallback(() => {
    const permissions = browser.permissions as MaybePermissions;
    const check = permissions?.contains;
    if (check == null) {
      // No WebExtension permissions API (preview). Resolve on a microtask so a
      // caller inside an effect never triggers a synchronous setState.
      void Promise.resolve().then(() => {
        setStatus('unavailable');
      });
      return;
    }
    check.call(permissions, ALL_SITES).then(
      (held) => {
        setStatus(held ? 'granted' : 'missing');
      },
      () => {
        // A rejected check is inconclusive, not a denial — don't cry "missing".
        setStatus('unavailable');
      },
    );
  }, []);

  const request = useCallback(() => {
    const permissions = browser.permissions as MaybePermissions;
    const requestFn = permissions?.request;
    if (requestFn == null) return;
    setStatus('requesting');
    // Whether the user allows or denies, `recheck()` is the single source of
    // truth for the resulting status — no need to interpret the resolved
    // boolean here. A rejected call (e.g. no user gesture) is inconclusive
    // the same way a rejected `contains()` is; recheck still reads the real
    // held state either way.
    requestFn.call(permissions, ALL_SITES).then(recheck, recheck);
  }, [recheck]);

  useEffect(() => {
    // recheck settles asynchronously (contains() is async; the no-API branch
    // defers), so it never setStates synchronously in this effect. Returning
    // from the browser's extension settings fires focus; visibilitychange covers
    // tab switches — both re-check so a just-made grant reflects immediately.
    recheck();
    const onFocus = (): void => {
      recheck();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [recheck]);

  return { status, recheck, request };
}
