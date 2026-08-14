---
type: reference
id: movar-audit-dogfood-targets
status: accepted
date: 2026-08-14
summary: What the first live dogfooding pass of **Movar Audit**'s CLI collector actually measured — eight real Ukrainian commercial sites, mined from defects this repo already documents, re-verified on 2026-08-14 with one page-view budget per site, no `--follow`, sequential, per the ADR's own network posture (§6 of [movar-audit.md](./movar-audit.md)). **The hostnames are deliberately not in this file.** This repository is public, and a checked-in list naming companies alongside defects an unreleased tool believes it found would publish exactly what the pass treats as an unverified hypothesis — before `--replay` exists to let those companies check the claim. What is worth committing is here: which rules a real commercial site actually exercises, which the batch structurally could not reach and why, and — the load-bearing result — **three collector-side false positives the pass found in our own code**, one of which was a genuine bug now fixed. Sites are referred to as A–H; the mapping is held outside the repo.
---

# Movar Audit — what the first dogfood pass measured

Eight real Ukrainian commercial sites, sourced from defects this repo already documents
rather than guessed, then independently re-verified live. See [movar-audit.md](./movar-audit.md)
for the architecture and [movar-audit-rules.md](./movar-audit-rules.md) for the 41-rule
catalogue these runs were checked against.

## Why there are no hostnames here

The pass produced `fail` verdicts against named companies from a pre-release tool, on a day
when that tool turned out to have three bugs of its own. Publishing that — and committing to
a public repo is publishing — runs against several commitments in the ADR at once: a false
accusation is named as the one failure mode that ends the product; findings are meant to be
falsifiable by the site owner via `--replay`, which does not exist yet; and a hosted report
or public league table is explicitly rejected so Movar never becomes a standing publisher of
accusations about named companies.

The engineering value is the coverage map and the method. Neither needs the names. See the
public-repo question in the issue tracker for the discussion.

## Method

**Mine.** Searched `docs/pitfalls.md`, `apps/e2e/src/live/`, `apps/extension/src/sites/`,
`apps/extension/CHANGELOG.md`, and the regression corpus under `apps/extension/src/lib/` and
`packages/lang-pickers/src/` for real sites the repo already documents as broken. A site the
repo has already hit is worth ten guesses, and every candidate had a file-and-line citation
rather than a hunch.

**Verify.** One at a time, sequentially, never in parallel:

```
pnpm exec tsx src/collect/cli.ts --url <url> [--ua]
```

One URL per site (the homepage unless the documented defect lives elsewhere), no `--follow`
— five requests per site, the `DEFAULT_MATRIX_HEADERS` matrix of no-preference / `uk` / `ru`
/ `en` / `de`. That is what the ADR calls the budget for a URL a human typed. All eight runs
used a single `local` vantage, cold cookie state. **None came back `blocked`; none errored** —
a mild surprise worth flagging for calibration, since the ADR treats `blocked` as a
first-class expected outcome.

**Sanity-check.** Every CLI failure was checked against the raw page — a second `curl`, a
decoded payload, a repeated identical request — before being written down as the site's
defect. Section 2 is what that turned up, and it is the most useful part of this document.

---

## 1. What the batch exercised

| Site | Shape of the defect                                                                                                                                        | Rules exercised                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | No `lang` on `<html>` at all (a non-standard `data-lang` instead); no `x-default`                                                                          | FAIL `core/lang-missing`; WARN `core/hreflang-x-default-missing`; FAIL `core/serving-vary-missing` (**false positive**, §2.1)                                                   |
| B    | Picker offers only RU + EN — no manual way to reach or leave the Ukrainian version, though the page itself is Ukrainian                                    | FAIL `core/inventory-sources-disagree`; WARN `core/picker-omits-declared-language`; `core/lang-contradicts-url` now **passes** (§4)                                             |
| C    | Every one of the five header values, including an explicit `ru`, 302-redirects to the Ukrainian path; the declared RU version is unreachable by any header | FAIL `core/serving-header-ignored`, `core/serving-header-partial`, `core/serving-declared-never-served`; WARN `core/lang-part-unmarked`                                         |
| D    | Both picker entries are `href="#"` JS-driven dead links — genuinely no navigable target for either                                                         | FAIL `core/picker-no-navigable-target` ×2; WARN `core/hreflang-self-missing`; FAIL `core/serving-vary-missing` (**false positive**, §2.2)                                       |
| E    | Switcher is a form-POST with two `<button>`s; the non-active entry exposes no `href`                                                                       | FAIL `core/picker-no-navigable-target`; FAIL `core/serving-header-ignored` and siblings (clean — all five bodies byte-identical, no noise)                                      |
| F    | Picker declares only `ru`; `uk` is declared by hreflang but has no picker entry                                                                            | FAIL `core/inventory-sources-disagree`; WARN `core/picker-omits-declared-language`; FAIL `core/serving-header-ignored` and siblings (clean)                                     |
| G    | Same shape as F: picker declares `ru` + `en`, not `uk`                                                                                                     | FAIL `core/inventory-sources-disagree`; WARN `core/picker-omits-declared-language`, `core/lang-part-unmarked`                                                                   |
| H    | Header picker's RU entry exposes no `href`; a first-visit interstitial's Ukrainian option is a pure cookie-setter (`href` = current URL)                   | FAIL `core/picker-no-navigable-target`; FAIL `core/serving-vary-missing` (**independently disproved**, §2.2); WARN `core/hreflang-x-default-missing`, `core/lang-part-unmarked` |

Two verdicts above (D and H, the non-byte-identical matrices) were produced before the
page-keying fix and are stale — see §2.3.

---

## 2. Collector limitations this pass surfaced

The most valuable output of the pass. Three of these are about **our** code, not the sites',
and all three are reasons to distrust **raw byte identity as the sole signal** the `matrix`
capability rests on, on real pages that are never as static as a fixture.

### 2.1 A CSRF nonce and a generation timestamp defeat byte identity (site A)

`core/serving-vary-missing` fired: five different bodies, none carrying `Vary`. But fetching
the same URL twice with the _same_ header also produced two different bodies. Diffing them
isolated exactly two changes: a quick-order form's hidden field name incrementing, and an
HTML comment stamping the page-generation time. Every matrix leg would have differed from
every other **regardless of `Accept-Language`**, so the rule was structurally guaranteed to
fire on this markup whether or not the site respects the header. Not a finding about
language.

### 2.2 A session-randomised widget does the same, twice (sites D and H)

On D, the `uk` leg hashed differently from the other four. Two back-to-back identical
requests came back byte-identical — ruling out per-request noise like §2.1 — and the diff
narrowed to one script block: a base64-encoded blob whose recent-search list varies in order
per session. Session churn, not language.

H was the more instructive case. The CLI recorded five distinct body hashes and flagged
`core/serving-vary-missing`; `curl -I` across all five header values showed every one
302-redirecting to the _identical_ Ukrainian URL. The header has zero effect on the
destination — the opposite of "varies but forgot `Vary`". The five different bodies were the
landing page's own per-request noise, which _also_ suppressed `core/serving-header-ignored`
(which needs byte-identical bodies to fire) even though the redirect behaviour is exactly
what that rule exists to catch.

Both of these are the same defect class, now tracked as its own issue: byte identity is not
a robust proxy for "did the language change" on a busy commerce page.

### 2.3 Digest memoization reused the first leg's document (sites D and H) — **fixed**

The mechanical cause behind §2.2. `collectNetwork`'s `digestInto` memoized pages by **final
URL**, so the second and later probes at an already-seen URL reused the first probe's
`pageId` and never had their own body parsed, even when the hash differed. Confirmed in the
evidence: all five probes carried one `pageId` while probe 2 had a distinct `bodyHash`. Every
`core/serving-header-partial` / `core/serving-declared-never-served` finding from a
non-byte-identical matrix was therefore reading the wrong leg's `<html lang>`.

> **Fixed.** `digestInto` now keys on the URL **and** the body hash, so legs that differ get
> their own page and identical ones still collapse. Guarded by `collectNetwork › keeps legs
apart when one URL serves different bodies per header` in
> [`node.test.ts`](../packages/audit/src/collect/node.test.ts). The finding stands as the
> record of how it was caught — content negotiation at a single URL is precisely what the
> response matrix exists to measure, and the project's own site could never have surfaced it,
> because its Ukrainian leg redirects to a distinct URL.

### 2.4 A fixed-locale URL is not a fair `core/serving-header-ignored` target (site B)

A scope caveat rather than a bug. B's fail came from probing a URL that already carries an
explicit language path segment. Byte-identical output regardless of `Accept-Language` is
_correct_ path-based i18n there — the URL is the language selector, not the header.
`core/serving-vary-missing` correctly read `not-applicable`, but
`core/serving-header-ignored` has no equivalent escape hatch for a URL that is already
locale-scoped. The genuinely interesting question — does the **bare root** honour a fresh
visitor's header before any locale segment exists — was outside the one-URL budget.

---

## 2b. Circumstantial evidence for `core/switch-bounces`, without `--follow`

Two sites' own matrix data, already paid for at zero extra requests, point at a real bounce
short of the tool's adjudicated verdict:

- **Site C** declares an RU alternate pointing at the exact URL this run fetched five times,
  which 302-redirected to the Ukrainian path _every single time_, including when explicitly
  asked for `ru`. Following the declared RU target would necessarily land back on Ukrainian.
- **Site A** declares an RU alternate at the bare domain — modulo a trailing slash, the same
  URL as its `uk` alternate and as this run's own fetched page. The historical bug this site
  is documented for used a different URL shape than the CMS serves today, so this is _not_ a
  live reconfirmation of that chain, just a structural reason to suspect the RU alternate is
  not a distinct reachable target.

Neither is `core/switch-bounces: fail` — that needs `traversal`, which needs `--follow`,
which this pass did not use. They are the strongest candidates for a follow-up run that does.

---

## 3. Rule coverage — the honest gap

**`core/switch-bounces`, the flagship rule, was not exercised by any of the eight runs** and
could not have been: it needs `http` **and** `traversal`, and `traversal` is granted only
when the collector actually followed a declared target. This pass's rules of engagement — one
URL per site, no `--follow` — are exactly the ADR's page-view budget for an unconsented look
at a site a human typed, and they structurally exclude family D. Every run showed it,
correctly, as `not-collected` — never a silent pass.

| Rule(s)                                                                                                       | Why unreachable                            | Structural, or just this batch?                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/switch-no-effect`, `core/switch-bounces`, `core/switch-loses-path`                                      | Need `traversal` (`--follow`)              | This batch's rules of engagement. A `--follow` or `--dist` run unlocks them.                                                                                                  |
| `core/hreflang-target-unresolvable`, `core/hreflang-target-wrong-language`, `core/picker-target-unresolvable` | Same — need `traversal`                    | Same                                                                                                                                                                          |
| `core/switch-requires-script`                                                                                 | Needs `browser` (a rendered DOM)           | **Structural today.** No rendered-tier collector exists anywhere in `packages/audit`; it is referenced only as planned work. Unreachable from _any_ CLI run.                  |
| `core/serving-decided-by-ip`, `ua/state-language-not-default-by-ip`                                           | Need `multi-vantage` (≥2 egress locations) | **Structurally impossible from one machine.** A `local`-only run always reads `not-collected` here, by design.                                                                |
| `core/serving-cookie-overrides-header`                                                                        | Needs a warm cookie leg                    | **CLI-surface gap.** The collector and prober support `cookieState: 'warm'`; the CLI exposes no flag to request it. Every run read `not-applicable` ("every probe was cold"). |
| `core/inventory-varies-across-pages`, `core/hreflang-not-reciprocal`                                          | Need `site` scope (≥2 pages)               | A single-URL run collects one page. `--follow`, `--dist`, or a sitemap-scoped run would help.                                                                                 |
| `ua/state-language-version-lesser`                                                                            | Needs `site` scope                         | Same                                                                                                                                                                          |

**Rules that ran but never fired** across this sample — `core/lang-malformed`,
`core/lang-contradicts-picker`, `core/lang-part-malformed`, `core/hreflang-duplicate`,
`core/hreflang-malformed`, `core/hreflang-target-relative`, `core/picker-option-undeclared`,
`ua/state-language-absent`, `ua/state-language-not-default`,
`ua/state-language-interface-elements` — passed consistently because every site sampled
happens, _from this vantage_, to default to Ukrainian correctly. That is a comment on the
sample's diversity, not proof the rules don't work. A differently-geo'd vantage could flip
the `ua/` defaults to `fail` on the same sites; this whole batch ran from a single vantage
whose `country` was never claimed or verified.

---

## 4. Candidates considered but not run

- **One site turned out to be partially fixed.** Its documented regression was `<html
lang="ru">` served on every locale path including the Ukrainian one; the 2026-08-14 run
  shows the correct Ukrainian tag and `core/lang-contradicts-url` passing. The picker defect
  from the same fixture is still live, and is what this run's inventory findings caught — a
  different bug from the same regression file.
- **A CSS-artefact candidate** — a dangling border left after a hidden picker option — is a
  Movar-extension display cosmetic, not a language-serving or switch defect any of the 41
  rules address. Out of scope.
- **Several roadmap placeholders and incidental example URLs** in unrelated test fixtures had
  no documented language-conformance defect to verify.
- **A large search engine** was excluded on three grounds: the documented issues concern a
  different product surface (search-result-language rewriting, not hreflang/picker/serving
  conformance), it is near-certain to `block` an unattended non-browser fetch, and the ADR's
  "no per-site adapters" stance argues against centring a dogfood list on it.
- **The project's own marketing site** was audited separately as a control rather than spent
  from the eight-site budget — a site with no known bug is a poor use of a capped run, though
  it is what caught the collector's first-response-header bug and a real `Vary` defect of our
  own.

---

## 5. Scope note

Everything here is an **engineering test target for dogfooding a pre-release tool** — not a
report, not a publication, and not something to hand to any site owner. Nothing has been
shown to anyone outside this work, and the hostnames are deliberately absent from this file.

Given that §2 turned up three collector caveats in a single afternoon — one of them a genuine
bug — treat every `fail` recorded here as **a hypothesis to re-verify**: rerun the CLI,
re-check the raw response, re-read the evidence JSON, before it is ever cited, screenshotted,
or shown to anybody. That is exactly what [movar-audit.md](./movar-audit.md) §7 requires a
report to say about what it proves and what it does not.
