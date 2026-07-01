import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

/**
 * Best-effort read of whether Movar actually holds host access to every site —
 * the permission the onboarding page exists to secure.
 *
 * - `granted`   — `permissions.contains({ origins: ['<all_urls>'] })` is true.
 * - `missing`   — it's false (a Firefox user who revoked "Access your data for
 *                 all websites"; the step's copy tells them how to restore it).
 * - `unavailable` — no `browser.permissions` (the static-serve preview) — the
 *                 page falls back to instructions only, no status line.
 *
 * Honest by browser: on Firefox `contains` tracks the real grant, so `missing`
 * is actionable. On Chromium `<all_urls>` is a required permission granted at
 * install, so this reads `granted` right away — a correct positive signal that
 * the permission is held (it can't see Chrome's separate "On click" site-access
 * scoping, which the step's instructions cover instead). Re-checks when the tab
 * regains focus so returning from the browser's settings updates the line
 * without a manual poke.
 */
export type PermissionStatus = 'checking' | 'granted' | 'missing' | 'unavailable';

const ALL_SITES = { origins: ['<all_urls>'] };

/** `browser.permissions` is typed as always-present, but the static-serve
 *  preview has no WebExtension APIs — narrow to a possibly-absent shape so the
 *  unavailable branch is real (and not a lint "unnecessary condition"). */
type MaybePermissions = { contains?: (p: { origins: string[] }) => Promise<boolean> } | undefined;

export interface PermissionStatusHandle {
  readonly status: PermissionStatus;
  /** Re-run the check now (the access step's "Check again" affordance). */
  readonly recheck: () => void;
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

  return { status, recheck };
}
