import { getViteConfig } from 'astro/config';

/*
 * Component tests: `.astro` files rendered through Astro's container API
 * (`experimental_AstroContainer`). `getViteConfig` gives Vitest the same
 * compiler and integrations the site builds with, which is what lets a test
 * import a component at all.
 *
 * Tests live under `test/`, never next to the component: fixtures stay out of
 * `src/`, so nothing a test needs can ship to movar.fyi. A component that reads
 * a content collection gets its entries from a `vi.mock('astro:content')` in
 * the test, never from a fake file in `src/content/`.
 */
export default getViteConfig({
  test: {
    name: 'components',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
});
