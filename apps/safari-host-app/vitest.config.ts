import { defineConfig } from 'vitest/config';

/**
 * Vitest for the Safari host app. jsdom so the bridge's `window.show` /
 * `window.__movarReply` installs + `navigator.language` reads work, and so the
 * shell's tab roving-tabindex / arrow-key behaviour can be exercised against a
 * real DOM. No Tailwind/Vite app plugins here — these are unit tests of pure
 * logic + light DOM, not a bundle.
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
