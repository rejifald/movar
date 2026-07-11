import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, cn } from '@movar/ui';
import { messagesEn, messagesUk } from '@movar/i18n';

interface Props {
  children: ReactNode;
  /**
   * Replaces the default full-surface fallback panel. A shadow-root host (the
   * diagnostics widget) passes a compact node — or `null` to render nothing on
   * crash — because the default panel's `h-full` styling and page-reloading
   * button suit a popup/options surface, not a floating in-page widget. Omit it
   * (popup, options, Safari host) to get the default panel.
   */
  fallback?: ReactNode;
  /**
   * Extra classes appended to the default panel's own layout classes. The
   * extension popup passes `w-[360px]` so a crash keeps the same fixed width the
   * healthy popup uses: `popup/App` renders a `w-[360px]` card that
   * Chrome/Firefox/macOS Safari size the floating popup window around. The
   * fallback panel sets no width of its own, so without this the browser has
   * nothing to size the window to and collapses the popup to a cramped default —
   * the wrapped, clipped crash screen this prop exists to prevent. Ignored when
   * {@link Props.fallback} is supplied (that replaces the panel wholesale); omit
   * it for surfaces that fill their host (options, Safari host).
   */
  panelClassName?: string | undefined;
}

interface State {
  hasError: boolean;
}

/** Choose the fallback locale at render time. The popup/options i18n context is
 *  exactly what the boundary is here to survive — if rendering it threw, we
 *  cannot call into it. So we read `document.documentElement.lang`, which
 *  mount-app seeds best-effort before React renders and `I18nProvider`'s effect
 *  keeps in sync with the resolved settings locale — meaning a Ukrainian user
 *  who hits a render crash now sees the Ukrainian fallback. Falls back to
 *  English when the attribute is absent or not `uk`. */
function pickFallbackCopy(): typeof messagesEn.errorBoundary {
  const lang = (typeof document === 'undefined' ? '' : document.documentElement.lang).toLowerCase();
  return lang.startsWith('uk') ? messagesUk.errorBoundary : messagesEn.errorBoundary;
}

/** Last-resort boundary around a Movar React tree. A storage read that throws
 *  mid-render, a malformed value in `storage.sync`, or a stray TypeError in a
 *  deep component would otherwise blank the surface with no recovery path. We
 *  render a calm fallback and a Reload button — the failure path the user can
 *  actually take — or the caller-supplied {@link Props.fallback}. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Stays on-device; the popup/options have no telemetry endpoint by
    // design. Console output is visible to a user who opens devtools on
    // the surface, which is the support path the README points at.
    // eslint-disable-next-line no-console -- deliberate on-device diagnostic; the boundary has no telemetry sink by design and devtools is the documented support path
    console.error('[movar] ErrorBoundary caught error:', error, info.componentStack);
  }

  override render(): ReactNode {
    // Fragment-wrap the pass-through so both branches return a JSX element
    // (a bare `ReactNode` child vs. a `<div>` otherwise reads as two return
    // types). The fragment renders its children transparently — no DOM node,
    // no behaviour change.
    if (!this.state.hasError) return <>{this.props.children}</>;
    // A caller-supplied fallback wins (diagnostics passes a compact node / null).
    // Fragment-wrapped like the branches above so every return is a JSX element
    // (a bare `ReactNode` would read as a second return type); transparent — no
    // DOM node, so a `null` fallback still renders nothing.
    if (this.props.fallback !== undefined) return <>{this.props.fallback}</>;
    const copy = pickFallbackCopy();
    return (
      <div
        role="alert"
        className={cn(
          'text-ink-strong bg-bg flex h-full min-h-full flex-col gap-4 p-6',
          this.props.panelClassName,
        )}
      >
        <h1 className="font-display text-lg font-bold tracking-tight">{copy.title}</h1>
        <p className="text-ink-soft text-sm">{copy.description}</p>
        <div>
          <Button
            onClick={() => {
              location.reload();
            }}
          >
            {copy.reload}
          </Button>
        </div>
      </div>
    );
  }
}
