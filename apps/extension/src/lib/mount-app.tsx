import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './error-boundary';

/** Mount a React app into the `#root` element. No-op if the element is absent.
 *  The `ErrorBoundary` wraps every surface so a storage read that throws
 *  mid-render or a deep TypeError surfaces as a calm "Reload" panel instead
 *  of a blank popup. */
export function mountApp(App: ComponentType): void {
  const root = document.querySelector('#root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
