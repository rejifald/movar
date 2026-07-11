import { mountApp } from '../../lib/mount-app';
import { App } from './App';
import { PopupCrashFallback } from './CrashFallback';
import '../../styles/globals.css';

// When the popup's React tree throws on first paint, render the StatusHeader
// crash card (brand bar + a muted "unexpected error" hero + a reload button) at
// the popup's own 360px width, so a crashed popup still reads as Movar instead of
// collapsing to a cramped default panel. See popup/CrashFallback for the inner
// ErrorBoundary that backstops it with the minimal width-fixed panel.
mountApp(App, { fallback: <PopupCrashFallback /> });
