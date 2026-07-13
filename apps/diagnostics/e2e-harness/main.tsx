/**
 * E2E visual harness for the diagnostics panel.
 *
 * The panel normally mounts inside a content-script shadow root, driven by a
 * live-DOM snapshot that drifts per page — untestable as a pixel baseline. This
 * harness instead renders the REAL `Widget` (the FAB + floating panel, unchanged)
 * against a hand-pinned {@link FIXTURE} snapshot, so the e2e spec can open the
 * panel, page through its four tabs, and compare deterministic pixels.
 *
 * Built standalone by `vite.harness.config.ts` (mirroring the Safari host app's
 * `file://`-loadable bundle) into `dist/harness/`, NOT by `wxt build` — it lives
 * outside `src/`, so it never enters the shipped extension. `onHighlight` /
 * `onRefresh` are inert stubs: the visual suite drives the panel, never a native
 * side effect.
 */
import { createRoot } from 'react-dom/client';
import { Widget } from '../src/ui/Widget';
import { FIXTURE } from './fixture';
import './harness.css';

const container = document.getElementById('app');
if (container) {
  createRoot(container).render(
    <Widget
      snapshot={FIXTURE}
      onHighlight={() => true}
      onRefresh={() => {
        /* static fixture — nothing to re-sweep */
      }}
    />,
  );
}
