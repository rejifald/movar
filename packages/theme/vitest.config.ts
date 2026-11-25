import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      // `json-summary` feeds scripts/gen-readme-metrics.mts; without it the
      // package drops out of the README coverage denominator.
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-utils.{ts,tsx}'],
    },
  },
});
