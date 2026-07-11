import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { mountApp } from '../../lib/mount-app';
import { App } from './App';
import { PopupCrashFallback } from './CrashFallback';
import '../../styles/globals.css';

// When the popup's React tree throws on first paint, render the StatusHeader
// crash card (brand bar + a muted "unexpected error" hero + a reload button) at
// the popup's own 360px width, so a crashed popup still reads as Movar instead of
// collapsing to a cramped default panel. See popup/CrashFallback for the inner
// ErrorBoundary that backstops it with the minimal width-fixed panel.
function mountRealPopup(): void {
  mountApp(App, { fallback: <PopupCrashFallback /> });
}

// e2e-only crash injection for the visual-regression suite: the crash screen
// can't be reached from a healthy popup, so the suite forces it via query params.
// `?__e2eCrash=card` renders the crash card directly; `=panel` forces the card to
// throw so the inner boundary drops to the minimal backstop panel; `__e2eLang`
// pins the crash-copy locale (the crash reads document.lang before I18nProvider
// mounts). Gated on `__MOVAR_E2E__` (a Vite define present only in the MOVAR_E2E
// build), so this whole block tree-shakes out of every shipped build.
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
        <PopupCrashFallback e2eForceBackstop={e2eCrash === 'panel'} />
      </StrictMode>,
    );
  }
} else {
  mountRealPopup();
}
