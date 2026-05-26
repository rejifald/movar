import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

/** Mount a React app into the `#root` element. No-op if the element is absent. */
export function mountApp(App: ComponentType): void {
  const root = document.querySelector('#root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
