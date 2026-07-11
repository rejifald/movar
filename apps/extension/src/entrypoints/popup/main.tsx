import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@movar/app-shell';
import { mountApp } from '../../lib/mount-app';
import { App } from './App';
import { PopupCrashFallback } from './CrashFallback';
import { SafeCrashCard } from './SafeCrashCard';
import '../../styles/globals.css';

/* v8 ignore start -- Popup entrypoint: untested wiring plus an e2e-only crash
   probe. The whole file is glue between unit-tested modules — the mount
   (mount-app + app-shell), the crash card (CrashFallback), and the backstop
   panel (app-shell's ErrorBoundary) each have their own tests. The crash probe
   is gated on __MOVAR_E2E__ and tree-shakes out of every shipped build. Not
   worth instrumenting; excluded from coverage like capability-loader's
   live-import guard. */

// e2e-only crash injection for the visual-regression suite: the crash screen
// can't be reached from a healthy popup, so the suite forces it via query params.
// `?__e2eCrash=card` renders the crash card; `=panel` throws inside the crash
// boundary so it drops to the minimal backstop panel; `__e2eLang` pins the
// crash-copy locale (the crash reads document.lang before I18nProvider mounts).
// Gated on `__MOVAR_E2E__` (a Vite define present only in the MOVAR_E2E build).
function E2eCrashProbe(): never {
  throw new Error('e2e: forced popup crash');
}

const e2eCrash =
  typeof __MOVAR_E2E__ !== 'undefined' && __MOVAR_E2E__
    ? (new URLSearchParams(location.search).get('__e2eCrash') ?? null)
    : null;

if (e2eCrash === 'card' || e2eCrash === 'panel') {
  const root = document.querySelector('#root');
  const lang = new URLSearchParams(location.search).get('__e2eLang');
  if (lang !== null && lang !== '') document.documentElement.lang = lang;
  if (root !== null) {
    createRoot(root).render(
      <StrictMode>
        {e2eCrash === 'panel' ? (
          <ErrorBoundary fallback={<SafeCrashCard />}>
            <E2eCrashProbe />
          </ErrorBoundary>
        ) : (
          <PopupCrashFallback />
        )}
      </StrictMode>,
    );
  }
} else {
  // When the popup's React tree throws on first paint, render the StatusHeader
  // crash card at the popup's own 360px width, so a crashed popup still reads as
  // Movar instead of collapsing to a cramped default panel. See CrashFallback
  // for the inner ErrorBoundary that backstops it with the minimal panel.
  mountApp(App, { fallback: <PopupCrashFallback /> });
}
/* v8 ignore stop */
