# Compare suite — paired baseline vs treatment against real Google

This suite runs the same Google search in two parallel Chromium contexts:

- **Baseline** — plain Chromium, no Movar. Asserts Russian content appears
  (proves the bug exists upstream).
- **Treatment** — Chromium with Movar loaded. Asserts Ukrainian content
  appears, with no Russian leak words (proves Movar fixes it).

Same query, same `Accept-Language` header, same egress IP, same minute.
Any content-language delta is attributable to Movar.

## Running it

| What                                   | Command                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Full run                               | `pnpm --filter @movar/e2e test:compare`                                                     |
| From repo root                         | `pnpm test:e2e:compare`                                                                     |
| Headed (visible browser for debugging) | `pnpm --filter @movar/e2e test:compare:headed`                                              |
| Skip one scenario                      | `SKIP_VOLTAGE_RELAY=1 pnpm test:e2e:compare` (env-var names per scenario in `scenarios.ts`) |

NOT a CI gate. Runs nightly via GitHub Actions (Pass 2) and on demand.
The deterministic offline suite (`pnpm test`) stays the PR gate.

## What "pass" means

For each of the five scenarios, both legs must satisfy their contract:

| Leg       | Assertion                                                      | Source         |
| --------- | -------------------------------------------------------------- | -------------- |
| Baseline  | ≥ `minRussianLeaks` Russian-only word forms in results region  | `scenarios.ts` |
| Treatment | 0 Russian-only word forms in results region                    | `scenarios.ts` |
| Treatment | ≥ `minUkrainianMarkers` Ukrainian word forms in results region | `scenarios.ts` |
| Treatment | URL matches `urlContains` (typically `/[?&]hl=uk\b/`)          | `scenarios.ts` |
| Treatment | `<html lang>` starts with `uk`                                 | `scenarios.ts` |

The "Russian word forms" are surface lemmas that cannot appear in
Ukrainian (e.g. `напряжения` for the voltage-relay scenario). Curated
per scenario in `scenarios.ts`.

A `@movar/lang-detect` histogram over per-row snippets is captured in
evidence but NOT asserted on — it's there to help triage, not to gate.

## Per-test evidence

Every scenario produces, attached to the HTML report:

- `baseline.png` — full-page screenshot of the no-Movar SERP
- `baseline.json` — URL, html lang, region selector used, snippets,
  keyword scan result, language histogram
- `treatment.png` — full-page screenshot of the Movar SERP
- `treatment.json` — same shape as baseline

A reviewer can open the artifact and see the two screenshots side-by-side
plus read the JSON for either leg without re-running anything.

## Triage runbook

A red nightly run means ONE of the assertions failed. Read the failure
message — it names which leg, which assertion, what was expected, what
was found, and points at the attached JSON.

### 1. Baseline failed (`Baseline did NOT reproduce the bug`)

Google didn't serve Russian results to our baseline leg. **Not necessarily
a Movar problem.** Check, in order:

1. **Open `baseline.png`.** Did Google show a CAPTCHA / unusual-traffic
   page? If yes → re-run; if persistent, the runner IP is rate-limited.
2. **Open `baseline.json`.** Read `consentDismissed`. If `false` and the
   screenshot shows a consent banner, the dismiss selector list needs a
   new entry (see `measure/result-snippets.ts`, `CONSENT_ACCEPT_SELECTORS`).
3. **Check the URL geolocation.** Did Google redirect us to `google.ua`
   or another locale-default? Egress IP may be in UA → adjust the runner
   region or accept the geo-IP wins-over-Accept-Language behaviour and
   document the dropped scenario.
4. **Check `histogram`.** If `ru` is 0 and `en` or `uk` is dominant,
   Google served us something other than Russian for this query _today_.
   Sometimes a query loses topicality and English-language pages dominate.
   Re-check the query's recent SERP shape manually in an incognito window
   with `Accept-Language: ru-RU`.
5. **If the bug genuinely doesn't reproduce anymore** — i.e. Google
   permanently improved their locale logic for this query — pick a new
   query (the scenario file documents the criteria: distinct RU/UA surface
   forms, common enough to dominate top-10) and update `scenarios.ts`.

### 2. Treatment failed — Russian leak (`Movar leaked Russian content`)

This IS a Movar regression. Read the failure message — it lists the
specific leak words found. Open `treatment.png` to see where they landed
on the page.

1. **Check `treatment.url`.** Is `hl=uk&lr=lang_uk` present?
   - **No** — DNR rule regression. Look at recent changes to
     `packages/rules/src/index.ts` (the `GOOGLE_LR` map and the Google
     rule definition), `apps/extension/src/lib/strategy.test.ts`, and
     the manifest's declarativeNetRequest config.
   - **Yes** — Google served Russian under `hl=uk` anyway. Look at the
     specific result rows — did the leak come from a single domain
     (e.g. a Russian-content site that ranked for the Ukrainian query)?
     If so, that's not a Movar bug; consider tightening the keyword
     list or accepting a small minRussianLeaks budget in `scenarios.ts`.
2. **Check `regionSelectorUsed`.** If `body-fallback`, Google's results
   container moved and the keyword scan ran over the whole page text
   (including chrome). The leak may be in Google's UI, not in results.
   Update `REGION_SELECTORS` in `measure/result-snippets.ts`.

### 3. Treatment failed — not enough Ukrainian markers

Treatment didn't leak Russian, but didn't show enough Ukrainian content
either. Usually means the SERP came back English or empty.

1. **Check `treatment.png`.** Did Google return zero results / error page
   / blank?
2. **Check `histogram`.** If `en` is dominant, Google decided this
   Ukrainian query didn't have enough Ukrainian content and served
   English. Not Movar's fault. Consider:
   - Lowering `minUkrainianMarkers` for this scenario (acknowledging
     the SERP is partly English even with Movar).
   - Picking a different query with more Ukrainian-content density.

### 4. Treatment failed — URL doesn't contain `hl=uk`

DNR rule didn't fire on the treatment context. The extension may have
loaded without the rule registered, or the rule's match pattern stopped
matching.

1. **Check that the extension built before tests ran.** The Nx target
   `e2e:test:compare` depends on `extension:build` — if you ran
   `playwright test` directly, build the extension first.
2. **Inspect `chrome://extensions` in headed mode.** Use
   `test:compare:headed` and open extensions page in the treatment
   context to verify Movar loaded.
3. **Look at recent rule changes** under `packages/rules/src/`.

### 5. Treatment failed — `<html lang>` is not `uk`

Movar's URL rewrite worked but Google ignored `hl=uk` and served Russian
anyway under `<html lang="ru">`. Rare — usually means Google overrode the
hl param based on geo-IP or cookies. Worth filing as a Google-side
edge case; not a Movar fix.

## Adding a new scenario

1. Pick a Ukrainian query whose Russian translation uses _distinct_
   surface forms (not just letter swaps). Good: `вантажівка` vs
   `грузовик`. Marginal: `Україна` vs `Украина` — letter-swap, lang-detect
   handles that better than keywords.
2. Verify the bug reproduces today: open the query in an incognito
   Chromium with `Accept-Language: ru-RU,ru;q=0.9` and confirm Russian
   results dominate.
3. List 2-4 case forms of the Russian leak word (nominative, genitive,
   dative — product snippets cover these).
4. List 2-4 case forms of the Ukrainian marker word.
5. Add the entry to `SCENARIOS` in `scenarios.ts`. Start with
   `minRussianLeaks: 2`, `minUkrainianMarkers: 3`.
6. Run `pnpm test:e2e:compare:headed` and watch the console log lines —
   tune thresholds if the actual hits are far from the defaults.

## Concurrency / anti-bot note

Each scenario runs two same-host navigations to `www.google.com`
concurrently from the same egress IP. So far this hasn't triggered
Google's anti-bot, but if nightly starts seeing CAPTCHAs on the
treatment leg specifically, the fix is sequencing the two navigations
(baseline → treatment) with a short delay in `runner.spec.ts`. Adds
~10s wall-clock per scenario, removes the simultaneity signature.
