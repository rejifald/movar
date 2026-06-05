import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  // Mirror the `@product` alias from wxt.config.ts so tests can exercise the
  // reused product models (page-content extractor + language-picker model).
  resolve: {
    alias: { '@product': path.resolve(import.meta.dirname, '../extension/src/lib') },
  },
  test: {
    environment: 'jsdom',
  },
});
