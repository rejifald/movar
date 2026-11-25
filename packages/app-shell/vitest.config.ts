import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The shell renders React (StrictMode + ErrorBoundary) and mounts into the
    // DOM (`createRoot(#root)`), so the tests need a DOM environment.
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.tsx', 'src/test-setup.ts'],
    },
  },
});
