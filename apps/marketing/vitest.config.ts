import { defineConfig } from 'vitest/config';

/*
 * Unit tests for the site's pure-logic modules — `src/lib/**`.
 *
 * The app had no vitest setup at all until the guide's diagnosis model landed:
 * everything else here is `.astro`, which is templating rather than logic, and
 * is covered where it belongs — by `apps/e2e`'s marketing suites, against a
 * real build in a real browser.
 *
 * `src/lib` is different. It is a fault model, a user-agent table and a set of
 * per-platform instructions: branchy, order-dependent, and driven entirely by
 * its inputs. Exercising a user-agent table through a browser costs a whole
 * page load per row; here it costs a line.
 *
 * **No `json-summary`, deliberately.** `scripts/gen-readme-metrics.mts` builds
 * the repo-wide coverage number by summing every project's
 * `coverage-summary.json`, and this project is not a participant in that number
 * — it was outside the denominator before this file existed, and adding it now
 * would say something false either way. Most of `src/lib` is covered by
 * `apps/e2e`'s marketing suites rather than by vitest (`download-cta.ts` and
 * `install-handoff.ts` are exercised end-to-end in `marketing.install-cta.spec.ts`),
 * so counting them as uncovered would understate the repo; excluding them from
 * the include list would overstate it.
 *
 * `lcov` IS emitted, because that is what the code-health audit reads to
 * compute CRAP — so the modules tested here are correctly scored as tested.
 * When the rest of `src/lib` grows unit tests, add `json-summary` here and let
 * the project join the repo number honestly.
 */
export default defineConfig({
  test: {
    globals: false,
    include: ['src/lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
    },
  },
});
