import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every component here renders React (via @testing-library/react), so the
    // tests need a DOM environment.
    environment: 'jsdom',
  },
});
