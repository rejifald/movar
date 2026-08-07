import { defineConfig } from 'vitest/config';

/*
 * The mockups are pure string builders, so this needs no DOM environment — but
 * it does need the coverage block: `scripts/gen-readme-metrics.mts` aggregates
 * the repo's coverage by summing every `<project>/coverage/coverage-summary.json`,
 * and a project without one is silently absent from that sum rather than
 * counted as uncovered. Without this file the package's covered lines simply
 * did not exist as far as the metrics gate was concerned.
 */
export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
