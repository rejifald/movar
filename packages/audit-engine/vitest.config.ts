import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engine's whole reason for existing is that `digest-dom` needs a real
    // `Document` with real `instanceof` constructors — see the package README.
    // jsdom is the test stand-in for the offscreen WebView a native shell hosts.
    environment: 'jsdom',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
