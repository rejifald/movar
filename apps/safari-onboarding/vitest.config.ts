import { defineConfig } from 'vitest/config';

/**
 * Vitest for the Safari onboarding app. jsdom so the bridge's `window.show`
 * install + `navigator.language` reads work; React component behaviour is
 * covered by `App.test.tsx`. No Tailwind/Vite app plugins here — these are
 * unit tests of pure logic + light DOM, not a bundle.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
