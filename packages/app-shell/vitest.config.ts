import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The shell renders React (StrictMode + ErrorBoundary) and mounts into the
    // DOM (`createRoot(#root)`), so the tests need a DOM environment.
    environment: 'jsdom',
  },
});
