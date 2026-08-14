---
type: reference
id: movar-audit-dogfood-targets
status: accepted
date: 2026-08-14
summary: Eight real, live websites for dogfooding **Movar Audit**'s CLI collector, mined from defects the repo already documents (regression tests, e2e fixtures, `CHANGELOG.md` entries) and independently re-verified on 2026-08-14 with `pnpm exec tsx src/collect/cli.ts --url <url>` — one page-view budget per site, no `--follow`, sequential, per the ADR's own network posture (§6 of [movar-audit.md](./movar-audit.md)). All eight are real Ukrainian businesses (an electronics shop, a tool brand, a Bosch service centre, an oncology clinic, three more shops) with in-repo-documented language-switching problems; none came back `blocked`. The pass produced genuine `core/serving-header-ignored` / `core/picker-no-navigable-target` / `core/inventory-sources-disagree` findings, confirmed one historical bug (spizhenko.clinic's `<html lang="ru">`) is now fixed, and — the more load-bearing result — caught **three collector-side false positives of its own**: a CSRF nonce and a page-generation timestamp defeating the byte-identity check `core/serving-vary-missing` relies on, a session-randomised search-suggestion widget doing the same on a second site, and a digest-memoization gap where the collector silently reuses the *first* probe's parsed document for every later leg of a genuinely varying response. `core/switch-bounces` — the rule this product exists for — could not be exercised by any of these runs: it needs `traversal` (`--follow`), which this pass's rules of engagement exclude. ds-electronics.com.ua and electrica-shop.com.ua remain the strongest candidates for a follow-up, explicitly consented `--follow` pass. Everything here is an unpublished engineering hypothesis, not a report.
---

# Movar Audit — dogfood targets

Eight sites to point [`@movar/audit`](../packages/audit/AGENTS.md) at during development,
sourced from defects the repo already documents rather than guessed, then independently
re-verified live. See [movar-audit.md](./movar-audit.md) for the architecture and
[movar-audit-rules.md](./movar-audit-rules.md) for the 41-rule catalogue these runs are
checked against.

## Method

**Step 1 — mine.** Searched `docs/pitfalls.md`, `apps/e2e/src/live/`,
`apps/extension/src/sites/`, `apps/extension/CHANGELOG.md`, and the regression-test corpus
under `apps/extension/src/lib/*.test.ts` and `packages/lang-pickers/src/*.test.ts` for real
hostnames the repo already documents as broken. This is the cheapest source of good
targets — a site the repo already hit is worth ten guesses, and every candidate below has a
file:line citation, not a hunch.

**Step 2 — verify.** Ran, one at a time, sequentially, never in parallel:

```
cd packages/audit && pnpm exec tsx src/collect/cli.ts --url <url> [--ua]
```

One URL per site (the homepage, `https://`, unless the documented defect lives on a
specific page), no `--follow` — five requests per site (the `DEFAULT_MATRIX_HEADERS` matrix:
no preference, `uk`, `ru`, `en`, `de`), matching what the ADR calls the budget for "a URL a
human typed." `--ua` where the site plausibly declares the Ukrainian market. All eight runs
used this sandbox's single `local` vantage, cold cookie state, on 2026-08-14. None came back
`blocked`; none errored.

**Sanity-checking.** Per the brief: a CLI failure was checked against the raw page — a
second `curl`, a base64-decoded payload, a repeated identical request — before being written
down as the site's defect. Section 2 is what that turned up.

---

## 1. Verified targets

| Site                                                                                     | What it appears to do wrong                                                                                                                                                                              | Rule IDs exercised (verdict)                                                                                                                                                                                                                                                                          | Mined from                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ds-electronics.com.ua** (UMI.CMS electronics shop)                                     | `<html>` carries no `lang` at all (only non-standard `data-lang`); no `x-default`; historically a `hreflang="uk-ua"` → 301 → back-to-Russian bounce (see caveat below — not re-confirmed live this pass) | FAIL `core/lang-missing`; WARN `core/hreflang-x-default-missing`; FAIL `core/serving-vary-missing` (**false positive**, §2.1); Family D not-collected                                                                                                                                                 | `apps/extension/CHANGELOG.md:132,138`; `apps/extension/src/lib/language-switch.ts:131-133`; `apps/extension/src/lib/language-switch.test.ts:327-339`; `packages/lang-pickers/src/picker.extract.test.ts:37-76`; `packages/lang-pickers/src/picker.classify.test.ts:176-181`; `packages/lang-detect/src/lang-codes.ts:26-37` |
| **spizhenko.clinic** (oncology clinic; specific page `/uk/konsultacija-vracha-onkologa`) | Picker offers only RU + EN — no way to reach or leave the Ukrainian version by hand, even though the page itself is Ukrainian                                                                            | FAIL `core/inventory-sources-disagree`; WARN `core/picker-omits-declared-language`; FAIL `core/serving-header-ignored`/`header-partial`/`declared-never-served` (**caveat**, §2.2); `core/lang-contradicts-url` now **passes** — the original bug looks fixed (§4)                                    | `apps/extension/src/lib/spizhenko-regression.test.ts` (whole file; header comment lines 1-26, real hreflang block 40-51, picker root-cause 205-271; live capture dated 2026-06-01 in the file)                                                                                                                              |
| **electrica-shop.com.ua** (Ukrainian e-com)                                              | Every one of the 5 `Accept-Language` values — including an explicit `ru` — 302-redirects to `/ua/`; the declared RU version is unreachable by any header                                                 | FAIL `core/serving-header-ignored`; FAIL `core/serving-header-partial`; FAIL `core/serving-declared-never-served`; WARN `core/lang-part-unmarked`; Family D not-collected (but see the derived bounce evidence below)                                                                                 | `apps/e2e/src/live/sites/electrica-shop.ts` (whole file); `apps/extension/src/sites/electrica-shop/index.ts`; `apps/extension/src/sites/CONTRIBUTING-A-SITE.md:79-104`                                                                                                                                                      |
| **yato.com.ua** (OpenCart tool brand)                                                    | Both picker entries ("Русский" **and** "Українська") are `href="#"` JS-driven dead links — genuinely no navigable target for either                                                                      | FAIL `core/picker-no-navigable-target` ×2; WARN `core/hreflang-self-missing`; FAIL `core/serving-header-partial`/`declared-never-served` (**caveat**, §2.3); FAIL `core/serving-vary-missing` (**false positive**, §2.2)                                                                              | `apps/extension/src/lib/yato-regression.test.ts` (whole file; live capture dated 2026-07-20)                                                                                                                                                                                                                                |
| **bosch-centre.com.ua** (Bosch UA service centre)                                        | Language switcher is a form-POST with two `<button>`s — the non-active "ru" button exposes no `href` at all                                                                                              | FAIL `core/picker-no-navigable-target`; FAIL `core/serving-header-ignored`/`header-partial`/`declared-never-served` (clean — all 5 bodies byte-identical, no noise)                                                                                                                                   | `apps/extension/src/lib/bosch-regression.test.ts` (whole file); also the namesake of the "Bosch regression" cited in `docs/movar-audit-rules.md:129` and guarded in `packages/audit/src/rules/switch.ts:124` and `packages/audit/src/url-language.test.ts:42`                                                               |
| **001.com.ua** (electronics catalogue)                                                   | Picker declares only `ru`; `uk` is declared by hreflang but has no picker entry                                                                                                                          | FAIL `core/inventory-sources-disagree`; WARN `core/picker-omits-declared-language`; FAIL `core/serving-header-ignored`/`header-partial`/`declared-never-served` (clean, no noise)                                                                                                                     | `apps/e2e/src/live/sites/001.ts` (whole file)                                                                                                                                                                                                                                                                               |
| **uamade.ua** (CS-Cart crafts marketplace)                                               | Same shape as 001.com.ua: picker declares `ru`+`en`, not `uk`                                                                                                                                            | FAIL `core/inventory-sources-disagree`; WARN `core/picker-omits-declared-language`, `core/lang-part-unmarked`; FAIL `core/serving-header-ignored`/`header-partial`/`declared-never-served` ×2 (ru, en)                                                                                                | `apps/e2e/src/live/sites/uamade.ts` (whole file)                                                                                                                                                                                                                                                                            |
| **tradeport.ua**                                                                         | Header picker's "РУС" entry exposes no `href`; a separate first-visit interstitial's "Ukrainian" option is a pure cookie-setter (`href` = current URL)                                                   | FAIL `core/picker-no-navigable-target`; FAIL `core/serving-vary-missing` (**independently disproved**, §2.2 — every request 302s to the same `/ua`); FAIL `core/serving-header-partial`/`declared-never-served` (**caveat**, §2.3); WARN `core/hreflang-x-default-missing`, `core/lang-part-unmarked` | `packages/lang-pickers/src/picker.gate.test.ts:26-30`; `apps/extension/src/lib/language-gate.test.ts:41-56,126-133,276` (movar#354)                                                                                                                                                                                         |

Full CLI output and the collected `Evidence` JSON for each run are not committed (per the
"write exactly one file" constraint on this task); rerun the command above to reproduce.

---

## 2. Collector limitations this pass surfaced

The brief warned: _"We just found three bugs in our own collector that presented as site
defects."_ Independently, this pass found what looks like the same class, three times, on
three different sites. None of these are reasons to distrust the rule catalogue's design —
they're reasons to distrust **raw byte-identity as the sole signal** the `matrix` capability
uses, on real pages that are never as static as a fixture.

### 2.1 A CSRF nonce and a timestamp defeat byte-identity (ds-electronics.com.ua)

`core/serving-vary-missing` fired: "5 different response bodies … 5 of them carried no
`Vary`." Fetching the same URL with the _same_ header twice (`curl` ×2, `Accept-Language: uk`
both times) also produced two different bodies. Diffing them showed exactly two things
changing: a quick-order form's hidden field name (`data[19417162][lname]` →
`data[19417163][lname]`) and an HTML comment, `<!-- This page generated in 1.099581 secs …
-->`, that changes every request. Every one of the 5 matrix legs would have differed from
every other **regardless of `Accept-Language`**, so `core/serving-vary-missing` was
structurally guaranteed to fire on this page's markup, independent of whether the site
respects the header at all. Not a real finding about language.

### 2.2 A session-randomised widget does the same, twice (yato.com.ua, tradeport.ua)

On yato.com.ua, the `uk`-header leg hashed differently from the other four (which were
identical to each other). Two live `curl -H 'Accept-Language: uk'` requests, back to back,
came back byte-identical — ruling out per-request noise like §2.1 — so the diff was
isolated to one script block: a base64-encoded JSON blob whose `search_phrase_arr` field
holds a short, order-varying list of recent/suggested search terms (Cyrillic "Акумулятор" /
"Аккумулятор" in a different order each time). Session-state churn, not language.

tradeport.ua showed the more interesting version: the CLI recorded 5 distinct body hashes
and flagged `core/serving-vary-missing`. `curl -I` for all five header values (including no
header at all) showed every single one **302-redirecting to the identical
`https://tradeport.ua/ua`**, so the header genuinely has zero effect on the destination —
the opposite of "varies but forgot `Vary`." The 5 different bodies were the `/ua` landing
page's own per-request noise (this is a large catalogue site — recommendation carousels are
the likely source), which happened to also suppress `core/serving-header-ignored` (which
needs _byte-identical_ bodies to fire) even though the redirect behaviour is exactly what
that rule is meant to catch. Byte-identity is not a robust proxy for "did the language
change" on a busy commerce page.

### 2.3 Digest memoization silently reuses the first leg's document (yato.com.ua, tradeport.ua)

Mechanically, the deeper issue behind 2.2: `collectNetwork`'s `digestInto`
(`packages/audit/src/collect/node.ts:188-197`) memoizes by **final URL** — the second and
later probes at an already-seen URL reuse the first probe's `pageId` and never get their own
body parsed, even when that body's hash differs. Confirmed directly in the yato.com.ua
evidence: all 5 probes carry `pageId: "page-1"`, but probe 2 (`uk` header) has a different
`bodyHash` from probes 1/3/4/5. `core/serving-header-partial`'s "honoured for uk" claim is
therefore reading `page-1`'s (leg 1's) `<html lang>` for leg 2 too — it happens to be right
here (both legs are in fact Ukrainian), but the collector never actually checked leg 2's own
declared language, and on a site where the diverging leg were the one that changed language,
this would silently attribute the _wrong_ leg's `<html lang>` to the request that produced a
different body. Every `core/serving-header-partial` / `core/serving-declared-never-served`
finding in this batch that came from a **non-byte-identical** matrix (yato.com.ua,
tradeport.ua) carries this caveat; the ones from a **byte-identical** matrix
(bosch-centre.com.ua, 001.com.ua, electrica-shop.com.ua) do not, because there was only ever
one body to digest.

> **Fixed.** `digestInto` now keys on the URL **and** the body hash, so legs that differ get
> their own page and identical ones still collapse. Guarded by `collectNetwork › keeps legs
apart when one URL serves different bodies per header` in
> [`node.test.ts`](../packages/audit/src/collect/node.test.ts). The finding above stands as
> the record of how it was caught — content negotiation at a single URL is precisely what the
> response matrix exists to measure, and movar.fyi could never have surfaced it because its
> Ukrainian leg redirects to a distinct URL. Re-run these two sites to refresh their verdicts.

### 2.4 A fixed-locale URL is not a fair `core/serving-header-ignored` target (spizhenko.clinic)

Less a bug than a scope caveat: spizhenko.clinic's fail came from probing
`/uk/konsultacija-vracha-onkologa` — a URL that already carries an explicit language path
segment. Byte-identical output regardless of `Accept-Language` is _correct, expected_
path-based i18n there (the URL is the language selector, not the header), not evidence the
site ignores what a visitor asked for. `core/serving-vary-missing` correctly read
`not-applicable` here — the design note in `probe.ts` about "a fixed-locale URL … correctly
does not vary" is exactly on point — but `core/serving-header-ignored` has no equivalent
escape hatch for a URL that is already locale-scoped. The genuinely interesting test — does
the **bare root** honour a fresh visitor's header before any locale segment exists — was not
run here (would cost a second URL against the same site, outside this pass's one-URL-per-site
budget).

---

## 2b. Circumstantial evidence for `core/switch-bounces`, without `--follow`

Two sites' own matrix data (already paid for, zero extra requests) point strongly at a real
bounce, short of the tool's own adjudicated verdict:

- **electrica-shop.com.ua** declares `hreflang="ru"` → `https://electrica-shop.com.ua/` — the
  _exact_ URL this run fetched five times, under five different `Accept-Language` values,
  and which 302-redirected to `/ua/` **every single time**, including when explicitly asked
  for `ru`. Following the declared RU target would necessarily land back on the Ukrainian
  version.
- **ds-electronics.com.ua** declares `hreflang="ru-ua"` → `https://ds-electronics.com.ua`
  (no path — the bare domain), which is, modulo a trailing slash, the same URL as the
  `uk-ua` alternate and this run's own fetched page (served with `Set-Cookie: lang=ua` from
  this vantage). The historical bug (CHANGELOG `a448116`: `hreflang="uk-ua"` →
  `/ua/ru/…` → 301 → `/ru/…`) used a different URL shape than what the CMS serves today,
  so this is _not_ a live reconfirmation of that specific chain — just a structural reason
  to suspect the RU alternate is still not a real, distinct, reachable target.

Neither of these is `core/switch-bounces: fail` — that requires `traversal`, which requires
`--follow`, which this pass did not use. They are the strongest candidates for a follow-up
run that does.

---

## 3. Rule coverage — the honest gap

**`core/switch-bounces` — the flagship rule — was not exercised by any of the 8 runs**, and
could not have been: it needs `http` **and** `traversal`, and `traversal` is only granted
when the collector actually followed a declared target (`followDeclaredTargets: true`, i.e.
`--follow`; see `hasTraversal` in `packages/audit/src/capability.ts:91-94`). This pass's own
rules of engagement — one URL per site, no `--follow` — are exactly the ADR's page-view
budget for an unconsented look at a site a human typed in, and they structurally exclude
this rule along with the rest of family D. Every run below shows it, correctly, as
`not-collected`, never a silent pass.

| Rule(s)                                                                                                       | Why unreachable from this batch            | Structural, or just this batch?                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/switch-no-effect`, `core/switch-bounces`, `core/switch-loses-path`                                      | Need `traversal` (`--follow`)              | This batch's rules of engagement. A `--follow` (or `--dist`) run would unlock these.                                                                                                                                                                                                                                                                                                                                                 |
| `core/hreflang-target-unresolvable`, `core/hreflang-target-wrong-language`, `core/picker-target-unresolvable` | Same — need `traversal`                    | Same                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `core/switch-requires-script`                                                                                 | Needs `browser` (a rendered DOM)           | **Structural today.** No Playwright collector exists yet anywhere in `packages/audit` — it's referenced only as planned future work (`packages/audit/src/index.ts:5`, the forbidden-import guard in `purity.test.ts:47`). Unreachable from _any_ CLI run right now, not just this one.                                                                                                                                               |
| `core/serving-decided-by-ip`, `ua/state-language-not-default-by-ip`                                           | Need `multi-vantage` (≥2 egress locations) | **Structurally impossible from one machine**, exactly as flagged in the brief. A `local`-only run always reads `not-collected` here, correctly, by design — `movar-audit-rules.md:215-218` states it outright: "on the free `local`-only path it reports `not-collected` — never `pass`."                                                                                                                                            |
| `core/serving-cookie-overrides-header`                                                                        | Needs a warm cookie leg                    | **CLI-surface gap.** `NetworkCollectOptions`/`ProbeRequest` support `cookieState: 'warm'` (`packages/audit/src/collect/node.ts`, `probe.ts`), but `cli.ts`'s `parseArgs` (`packages/audit/src/collect/cli.ts:32-50`) exposes no flag to request it. Every run in this batch reads `not-applicable` ("every probe … was cold"), not `not-collected` — the capability (`matrix`) is present, the warm opt-in just was never exercised. |
| `core/inventory-varies-across-pages`, `core/hreflang-not-reciprocal`                                          | Need `site` scope (≥2 collected pages)     | A single-URL, no-`--follow` run only ever collects one page. `--follow` or `--dist` would help; a future sitemap-scoped run would too.                                                                                                                                                                                                                                                                                               |
| `ua/state-language-version-lesser`                                                                            | Needs `site` scope                         | Same                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Rules that ran but never fired** across this specific 8-site sample — `core/lang-malformed`,
`core/lang-contradicts-picker`, `core/lang-part-malformed`, `core/hreflang-duplicate`,
`core/hreflang-malformed`, `core/hreflang-target-relative`, `core/picker-option-undeclared`,
`ua/state-language-absent`, `ua/state-language-not-default`,
`ua/state-language-interface-elements` — passed consistently because every site sampled
happens to (from this vantage) default to Ukrainian correctly. That is a comment on this
_sample's_ diversity, not proof those rules don't work; a differently-geo'd vantage could
easily flip `ua/state-language-absent`/`not-default` to `fail` on the same sites (see §2b and
the `core/serving-decided-by-ip` row above — this whole batch ran from a single, unidentified
vantage, and `Vantage.country` was never claimed or verified for it).

---

## 4. Candidates considered but not run

**No site in this batch came back `blocked`, unreachable, or errored** — a mild surprise
worth flagging for calibration, since the ADR treats that as a first-class, expected outcome.

- **spizhenko.clinic — partially fixed.** The original regression
  (`apps/extension/src/lib/spizhenko-regression.test.ts`, live capture dated 2026-06-01) was
  `<html lang="ru">` served on every locale path, including `/uk/…`. This run (2026-08-14)
  shows `<html lang="uk-UA">` correctly declared on the `/uk/` page —
  `core/lang-contradicts-url` now passes. The picker defect the same fixture documents
  (bare-text "UA" active entry, undiscoverable by markup) is still present and is what this
  run's `core/inventory-sources-disagree` / `core/picker-omits-declared-language` findings
  actually caught — a different bug from the same regression file, still live.
- **stls.store** — mined (`apps/extension/src/lib/picker-filter.ts:324-336`), but the
  documented issue is a pure CSS artefact (a `border-right` divider left dangling after the
  RU option is hidden) — a Movar-extension display cosmetic, not a language-serving or
  switch defect any of the 41 rules address. Out of scope for this tool.
- **prom.ua, rozetka.com.ua** — appear only as roadmap placeholders
  (`docs/page-content-and-lang-pickers-refactor.md:244`,
  `docs/dynamic-capability-loading.md:17`) or as example URLs inside an unrelated Google-SERP
  retry test fixture (`apps/extension/src/lib/google-empty-serp-retry.integration.test.ts`).
  No documented language-conformance defect to verify.
- **axiomplus.com.ua** — same file as rozetka.com.ua above; an incidental example URL, not a
  defect claim.
- **dou.ua** — cited only as a publication venue in a marketing article
  (`docs/articles/dou-tykha-kapitulyatsiya.md`), not a defect target.
- **gov.ua** — appears only as the domain of the statute citation itself
  (`zakon.rada.gov.ua`, in `packages/audit/src/rules/ua.ts`), not a site to audit.
- **google.com.ua / google.ua** — mentioned repeatedly, but exclusively in
  `docs/google-search-url-params.md` and Google-specific extension-rule tests, about a
  different product surface (search-result-language rewriting, not hreflang/picker/serving
  conformance). Also near-certain to `block` an unattended, non-browser CLI fetch, and the
  ADR's own "no per-site adapters" stance argues against centring a dogfood list on it.
- **movar.fyi** (the project's own marketing site) — a reasonable 9th/control candidate
  (bilingual `en`/`uk`, documented in `apps/marketing/src/i18n.ts:2`), deliberately not spent
  from the 8-site budget: the brief asked for sites that exhibit the defects the rules look
  for, and eight real, independently-documented, currently-reproducing defects (§1) were a
  better use of a capped run than a site with no known bug to confirm. Good next candidate if
  the shortlist is extended.

---

## 5. Scope note

Every finding above is an **engineering test target for dogfooding a pre-release tool**, not
a report, not a publication, and not something to hand to any of the eight sites' owners.
Nothing here has been shown to anyone outside this work. Given §2's three collector caveats
found in a single afternoon, treat every `fail` in this document as **a hypothesis to
re-verify** — rerun the CLI, re-check the raw response, re-read the evidence JSON — before it
is ever cited, screenshotted, or shown to anybody, exactly as `movar-audit.md` §7 says a
report must state what it proves and what it does not.
