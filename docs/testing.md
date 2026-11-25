---
summary: Canonical testing guide — which layer to use, where tests live, how they run locally and in CI, and the traps that make a green run lie.
---

# Testing conventions

This is the **canonical guide** for where Movar's tests live, which layer a change belongs in,
and how tests run locally and in CI. Executable behaviour belongs in test files; this file
defines **scope, placement and workflow** so humans and agents stay aligned.

Per-member detail (a package's own fixtures, a suite's spec table) stays in that member's
`AGENTS.md`; this doc links to it rather than repeating it.

---

## What belongs in Markdown vs in code

| In **this doc**                              | In **test files**                    |
| -------------------------------------------- | ------------------------------------ |
| When to add unit vs corpus vs e2e vs visual  | Concrete inputs, outputs, assertions |
| Directory layout and naming                  | Regression coverage for behaviour    |
| Hook / CI order, baseline workflow, env vars | Edge cases and error paths           |

When behaviour changes, **update tests in the same change**. Update this doc only when a
convention, a location or a CI expectation changes.

---

## Layers (decision guide)

Prefer the **fastest layer that still catches the real failure mode**.

1. **Unit** (Vitest, node or jsdom) — pure logic, detectors, normalisers, model builders, React
   components via Testing Library (roles and text, not pixels). The default for new code.
2. **Corpus** (Vitest + saved real pages) — a trimmed, PII-scrubbed copy of a real site in
   [`packages/page-content/fixtures/`](../packages/page-content/fixtures/README.md), mounted in
   jsdom and run through the real model packages. Use it whenever the question is "does Movar
   read _this site's_ markup correctly?" — pickers, language gates, SERP/feed cards, redirect
   rules.
3. **Offline e2e** (Playwright, `apps/e2e/src/offline`) — the built extension loaded into
   Chromium against local fixtures: popup, options, onboarding, the content pipeline end to end.
   Deterministic, no network, runs in CI.
4. **Visual** (`*.visual.spec.ts`, Playwright `toHaveScreenshot`) — layout and theme regressions
   of the extension UI and the marketing site. Use sparingly; see [Visual baselines](#visual-baselines).
5. **Live / compare** (`apps/e2e/src/live`) — real sites over the network. Manual or nightly,
   never a merge gate.

Quick checklist:

- A wrong change fails in milliseconds with a hand-built DOM? → **Unit**.
- It depends on a real site's markup shape? → **Corpus** fixture (and keep the unit test).
- It needs the built extension (manifest, permissions, messaging, storage across contexts)? →
  **Offline e2e**.
- The main risk is "it looks wrong"? → **Visual**.
- It only reproduces against the live site? → capture it as a corpus fixture; a live spec alone
  is not a regression test.

### Synthetic fixtures lie about language

A hand-written fixture is clean, single-language text. Real pages mix the keep language into
host UI (ratings, "translate" links, counters) and serve short snippets. Classifier and
extraction bugs live exactly in that mess, so a detection or extraction change needs a
**real** saved page, not only a synthetic one. See
[pitfalls §1](./pitfalls.md#1-language-detection-fed-non-content-text-sample-contamination).

### Fixtures show the post-Movar state

A visual fixture or demo that shows Movar acting on a page reads as the product's promise: a
**Ukrainian** page (`<html lang="uk">`, uk as the active picker entry) whose Russian bits are
hidden. A wholly Russian page with one thing trimmed makes Movar look like it did nothing.

---

## Where tests live

| Kind                    | Naming                                                 | Location                                                           |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| Unit / corpus           | `*.test.ts` / `*.test.tsx`                             | Colocated in `src/` next to the code (the default)                 |
| Shared fixtures/helpers | `fixtures.ts`, `test-utils/`, `test-helpers/`          | A member's `test/` directory, or `*.test-utils.ts` beside the code |
| Playwright              | `*.spec.ts` (`*.behavior.spec.ts`, `*.visual.spec.ts`) | `apps/e2e/src/{offline,marketing,live,demo}` only                  |
| Root script self-tests  | `*.test.mts` / `*.test.mjs` / `*.test.sh`              | `scripts/`, `scripts/lib/` — run by `pnpm test:scripts`            |

Rules:

- **`.test.*` is Vitest, `.spec.*` is Playwright.** Don't add a `.spec.ts` outside `apps/e2e`.
- **A separate `test/` directory** is for fixtures and suites that aren't about one source file
  (`packages/audit/test`, `packages/lang-detect/test`, `apps/marketing/test`,
  `tooling/store-listing/test`). Keep it inside the member, never one repo-wide tree.
- **Test infrastructure stays out of production modules** (root `AGENTS.md`): no `*ForTest`,
  `__test`, reset hooks or fake loaders in `src/` code. Use injection, factories or files under
  `test/`, `__tests__/`, `test-utils/`, `test-helpers/`. The `boundaries` lint preset bans a
  production import of a test helper.
- **WXT entrypoints root: tests go in `src/entrypoints/__tests__/`.** WXT names an entrypoint by
  the first dot-segment of its file name, so `background.test.ts` at the entrypoints root collides
  with `background.ts` ("Multiple entrypoints with the same name detected"). Vitest is green
  either way; only `wxt prepare` / the build fails, at pre-push. Tests inside an entrypoint
  _folder_ (`popup/App.test.tsx`) are fine.
- **Split a suite** when one file grows unrelated `describe`s or hundreds of lines: by feature
  or surface, with descriptive names (`picker.filter.restore.test.ts`, not `picker.filter2.test.ts`), with shared helpers in a sibling `<subject>.test-utils.ts`.
  Share setup through helpers, not copied `beforeEach` blocks.

### Vitest environments

- **jsdom** for anything that reads the DOM (extension, the model packages, i18n, options-ui,
  diagnostics, safari-host-app). **node** for pure packages (audit, host-match, brand,
  lang-detect, store-listing). There is no browser mode.
- **Every jsdom member has a setup file that resets global DOM state** between tests
  (`apps/extension/src/lib/test-setup.ts`; `src/test-setup.ts` everywhere else), wired through
  `setupFiles` and excluded from coverage. A suite that leaks `<html lang>`, a curtain or a
  tooltip into the next test is a bug in the suite; add the teardown to the setup file rather
  than to one spec. A new jsdom member starts with one.
- The extension uses the `WxtVitest()` plugin, which supplies a fake `browser` API. Packages
  with no tests yet (events, fonts, ui) run `--passWithNoTests` and have no config: add a
  `vitest.config.ts` with the coverage block below when the first real test lands.
- **A mock shared across tests needs its calls cleared.** A module-level `vi.mock(…, () => ({
fn: vi.fn() }))` keeps its recorded calls between tests unless something clears them; set
  `clearMocks: true` in the member's config or call `vi.clearAllMocks()` in `afterEach`.

### Coverage: no `json-summary`, not counted

Repo coverage is the **sum** of every `<member>/coverage/coverage-summary.json`, which only a
config with the `json-summary` reporter writes:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'json-summary'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.test-utils.{ts,tsx}', 'src/test-setup.ts'],
}
```

Exclude test helpers and setup files too, or they count as production code.

A member without it is **absent** from the denominator — not uncovered, invisible. A new,
fully covered package then adds nothing while an uncovered line elsewhere counts in full, and
the [metrics gate](./metrics-gate.md) reports a regression that reads as "under-tested". When
the gate flags coverage, check `ls {apps,packages}/*/coverage/coverage-summary.json` before
hunting lines. (`apps/marketing` omits it on purpose; its config says why.)

---

## Running tests

From the repo root:

| Goal                        | Command                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| All unit tests (excl. e2e)  | `pnpm test`                                                                  |
| One member                  | `pnpm --filter @movar/<name> test` or `pnpm nx run <project>:test`           |
| One file                    | `pnpm --filter @movar/<name> exec vitest run path/to/file.test.ts`           |
| Coverage (as the gate sees) | `pnpm test:coverage`                                                         |
| Root script self-tests      | `pnpm test:scripts`                                                          |
| Offline e2e, fast subset    | `pnpm test:e2e:fast` (popup + options specs)                                 |
| Offline e2e, full           | `pnpm nx run e2e:test`                                                       |
| Marketing e2e + visual      | `pnpm nx run e2e:test:marketing`                                             |
| Live sites                  | `pnpm test:e2e:live` / `pnpm test:e2e:live:headed` / `pnpm test:e2e:compare` |
| Everything a PR is gated on | `pnpm validate`                                                              |

Discover a member's targets with `pnpm nx show project <project>` rather than trusting a list.
Per-spec documentation for the e2e suites lives in [`apps/e2e/AGENTS.md`](../apps/e2e/AGENTS.md).

### e2e needs the `build:e2e` variant

The offline suite must run against `MOVAR_E2E=1 wxt build`, not the production build. That
variant makes `<all_urls>` a **required** host permission (production only has it as
optional) and defines the `__MOVAR_E2E__` probe. Without the host permission
`tabs.query()` strips `url`, so popup tests fail as if the feature were broken.

- `nx run e2e:test` / `e2e:test:fast` depend on `extension:build:e2e`; a bare
  `playwright test` never rebuilds and uses whatever `.output/chrome-mv3` holds.
- Production `build` and `build:e2e` both write `apps/extension/.output/chrome-mv3`. On a
  `build:e2e` cache hit, Nx leaves the production bundle in place and e2e tests it. If
  host-permission tests fail after a production build, run `pnpm nx reset` and re-run.
- "Element not found" for a feature that just merged usually means a stale `.output`, not a
  broken test.

### Lint tests at package scope

Run `pnpm --filter <pkg> lint`, not `eslint path/to/file.test.ts`: the type-aware rules need the
member's own config and project, and a single-file run misfires them.

---

## Hooks and CI

| Stage            | What runs                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit       | prettier (staged) → `pnpm lint` → `pnpm typecheck` → `pnpm test`, plus globbed guards (`test:scripts`, `check:*`)                             |
| pre-push         | production build → `pnpm metrics:audit` → `pnpm test:e2e:fast` (when extension / e2e / shared packages changed)                               |
| CI `verify`      | format, lint, typecheck, `pnpm test`, `test:scripts`, the `check:*` guards                                                                    |
| CI `e2e-offline` | [`e2e.yml`](../.github/workflows/e2e.yml) in the pinned Playwright container: `e2e:test`, then `e2e:test:marketing`                           |
| CI metrics       | [`metrics-gate.yml`](../.github/workflows/metrics-gate.yml): coverage freshness, regression and floor — see [metrics-gate](./metrics-gate.md) |

Never skip hooks with `--no-verify`. A hook failure you can't explain from your diff is a
signal to check the environment (below), not to bypass it.

### A rotating e2e failure is machine load

Pre-push e2e failing with `Test timeout of 30000ms exceeded while setting up "movarContext"`
(or `while running "beforeEach" hook`), on a **different test each run**, is fixture-setup
starvation: Chromium-with-extension couldn't launch in budget. A deterministic break fails the
same test every time. Check `uptime` and `docker ps` before touching code; a recent
`pnpm e2e:baselines` run keeps the amd64 VM hot for a while. Wait for the load to drop and
re-push. Don't raise the budgets to make it pass: `E2E_SLOW_HOST=1` (`playwright.budgets.ts`)
belongs to baseline regeneration only.

The offline config runs with `retries: 0` on purpose: every spec is deterministic against a
fixed build, so a retry would only hide a real race.

---

## Visual baselines

- Baselines sit beside their spec in `*.spec.ts-snapshots/`, one `*-chromium-linux.png` per
  screenshot. There is **one** baseline per shot, captured on Linux amd64 — no macOS copy.
- **No bot updates them.** A UI change regenerates and commits its baselines in the same PR.
- **Regenerate in the container, never on the host:** `pnpm e2e:baselines` (offline) and
  `pnpm e2e:baselines:marketing` (marketing). Both run
  [`scripts/e2e-baselines.sh`](../scripts/e2e-baselines.sh) in the pinned
  `mcr.microsoft.com/playwright` image under `linux/amd64`; that tag must match
  `@playwright/test` in the lockfile and `e2e.yml`.
- **Scope the run** with positional filename substrings (`pnpm e2e:baselines -- popup options`)
  so unrelated baselines don't churn. A flag after `pnpm … --` arrives behind an extra `--` and
  Playwright reads it as a filename ("No tests found"); for `--grep`, call the script directly.
- **Check that every expected baseline actually changed.** `--update-snapshots=all` writes
  nothing for a capture that timed out, so a loaded host can leave the tallest pages at their
  old content, indistinguishable from "unchanged" until CI rejects them. The script sets
  `E2E_SLOW_HOST=1` for that reason; still regenerate on a quiet machine.
- **Run the two targets one after the other**, never together: both bind-mount the tree and
  reinstall `node_modules` in the container.
- **A marketing component change needs the marketing run too** — the marketing baselines are
  full-page captures of every route × locale × theme.
- **Finalise copy before regenerating**; every wording change re-churns the shots.
- **Snapshot only a settled frame.** The options page first renders `defaultSettings`, then
  flips to the stored settings in an effect. Waiting on headings alone can capture the
  pre-settle frame and look exactly like a regression. Wait for a signal that exists only once
  settled (e.g. the filter switch `toBeChecked()`). A visual failure with no UI change is a
  timing race first: fix the wait, don't regenerate.

---

## Assertions that cannot fail

- An async assertion nobody awaits (`expect.poll`, `.resolves`/`.rejects`, Playwright's
  web-first `expect(locator).toBeVisible()`) passes before it runs. `await` every one.
- An `expect(x)` without a matcher, or a matcher run on constants, asserts nothing.
- Playwright `page.getBy*` returns a locator, which is always truthy: `expect(locator).toBeTruthy()`
  passes whether or not the element exists. Use `await expect(locator).toBeVisible()`.
- In Vitest 4, `vi.restoreAllMocks()` does **not** clear recorded calls; it only restores
  `vi.spyOn` originals. Use `vi.clearAllMocks()` or `mockClear()` when a later test counts calls.
- A loop of assertions over a filtered list passes when the list is empty. Assert the list is
  non-empty first.
- Testing Library's `getBy*` throws when nothing matches, so `expect(getByText('x')).toBeTruthy()`
  only ever fails in the query. That is safe but says less than it seems; don't copy it into a
  `queryBy*` (which returns `null`) without switching the matcher to `.not.toBeNull()`.
- Proving that something does **not** happen (no navigation, no curtain) needs a bounded
  window. Write it as a named wait with a comment saying what it gives a chance to happen, never
  as a bare sleep used for synchronisation.
- Focused tests (`.only`) fail lint: the `tests` preset forces `vitest/no-focused-tests` to error.

---

## Related paths

| Path                                                                                                | Purpose                                                    |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`apps/e2e/AGENTS.md`](../apps/e2e/AGENTS.md)                                                       | e2e tiers, build prerequisites, per-spec table             |
| [`apps/extension/AGENTS.md`](../apps/extension/AGENTS.md)                                           | Extension test setup (`WxtVitest`, jsdom, `test-setup.ts`) |
| [`packages/page-content/fixtures/README.md`](../packages/page-content/fixtures/README.md)           | Corpus layout, PII and trim policy                         |
| [`apps/extension/src/lib/corpus-pickers.test.ts`](../apps/extension/src/lib/corpus-pickers.test.ts) | Picker / redirect corpus runner                            |
| [`tooling/eslint-config-movar/configs/tests.js`](../tooling/eslint-config-movar/configs/tests.js)   | The `tests` lint preset                                    |
| [`scripts/e2e-baselines.sh`](../scripts/e2e-baselines.sh)                                           | Containerised baseline regeneration                        |
| [`docs/metrics-gate.md`](./metrics-gate.md)                                                         | Coverage floor, freshness and the override label           |
| [`docs/pitfalls.md`](./pitfalls.md)                                                                 | Recurring bug classes and their guards                     |
| [`lefthook.yml`](../lefthook.yml)                                                                   | pre-commit / pre-push hooks                                |
