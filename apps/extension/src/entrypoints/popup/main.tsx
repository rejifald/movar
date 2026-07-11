import { mountApp } from '../../lib/mount-app';
import { App } from './App';
import '../../styles/globals.css';

// Give the crash path the popup's own fixed width. `App` renders a `w-[360px]`
// card that Chrome/Firefox/macOS Safari size the floating popup window around,
// but the ErrorBoundary fallback (rendered when `App` throws on first paint)
// sets no width of its own — so an unhandled render error would otherwise
// collapse the popup to a cramped default and wrap/clip the message. Matching
// `w-[360px]` keeps the crashed popup the same size as the healthy one;
// `max-w-full` stops it overflowing a narrower iOS sheet.
mountApp(App, { panelClassName: 'w-[360px] max-w-full' });
