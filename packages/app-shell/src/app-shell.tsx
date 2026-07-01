import { StrictMode } from 'react';
import type { JSX, ReactNode } from 'react';
import { ErrorBoundary } from './error-boundary';

export interface AppShellProps {
  children: ReactNode;
  /** Forwarded to the {@link ErrorBoundary} — see its `fallback` prop. Lets a
   *  shadow-root host (diagnostics) swap the default popup-shaped crash panel
   *  for a compact node, or `null` to render nothing on crash. */
  fallback?: ReactNode;
}

/**
 * The shared React shell every Movar surface mounts inside: `StrictMode` over a
 * crash {@link ErrorBoundary}. The extension popup/options and the Safari host
 * app get it via {@link mountApp}; the diagnostics content script wraps its
 * shadow-root tree with this directly (its mount lifecycle is owned by wxt's
 * `createShadowRootUi`, so it can't use the `#root`-based `mountApp`).
 */
export function AppShell({ children, fallback }: Readonly<AppShellProps>): JSX.Element {
  return (
    <StrictMode>
      <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>
    </StrictMode>
  );
}
