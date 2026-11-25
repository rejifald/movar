import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every component here renders React (via @testing-library/react), so the
    // tests need a DOM environment.
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
