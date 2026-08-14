import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // The CLI is an executable entry point: it runs `main()` at module
        // scope, so importing it to measure it would run an audit. Its logic is
        // argument parsing and printing over `collect/node.ts`, which is tested.
        'src/collect/cli.ts',
      ],
    },
  },
});
