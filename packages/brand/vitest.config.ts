import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      // `json-summary` is not optional: `scripts/gen-readme-metrics.mts` sums
      // every project's `coverage/coverage-summary.json`, so a package without
      // this reporter silently drops out of the README's coverage denominator.
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
