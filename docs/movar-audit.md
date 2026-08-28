---
type: adr
id: movar-audit
status: accepted
date: 2026-08-13
summary: Movar ships a second product — **Movar Audit**, a language-conformance checker in the shape of Lighthouse. It answers "does this site honour the language it promises?" and emits a *language conformance report*: a checklist of findings, each with the evidence that produced it. The architecture's load-bearing decision is that **collection and adjudication are separate**: `evaluate(evidence, ruleset) → Report` is a pure function with zero I/O, and every runtime (Node/Playwright CLI, Swift/`URLSession` + `WKWebView` in the host app, Kotlin later, the diagnostics content script) writes its own collector emitting the same serializable `Evidence`. That is what makes the same judgement run in CI and on a phone, makes findings replayable years later from a stored bundle, and makes the report falsifiable by the site owner it accuses. The primary rule input is a **response matrix** — the same URL fetched N times varying only `Accept-Language` — because "respects language preference" is a differential property of *(site × egress IP × header × cookie state)*, not an absolute one; egress location is modelled as a first-class `vantage`. Rules grounded in the site's **own declarations** may fail a build; rules grounded in the **text classifier** are always cited observations and never aggregate into a page verdict, preserving the same separation the extension's two-layer architecture already enforces. The neutral core maps onto WCAG 2.1 SC 3.1.1 / 3.1.2; jurisdiction packs (starting with Ukraine's Law 2704-VIII Art. 27 §6) add statute-cited rules including a **version-parity** check. Zero backend: requests go only to the audited origin, provenance (hash chain, RFC 3161 timestamp, certificate chain, response headers) is always captured, heavyweight payload (response bodies, screenshots) is opt-in, and the tool holds no operator identity. `@movar/audit` publishes to npm as one self-contained bundle on its own release train, MIT.
---

# Movar Audit — a language-conformance checker

## Context

Movar the extension fixes language handling **for one user, on one page, at page-load
time**. It hides Russian cards, filters Russian entries out of language pickers, and asks
sites for Ukrainian. What it cannot do is tell the people who _build_ those sites what is
wrong with them.

Movar Audit is the other half: point it at a site and get back a checklist of what its
language handling actually does, with the evidence attached. Lighthouse's shape — a
conformance report a developer acts on — applied to the thing Movar spends every page load
working around.

**The first user is a non-technical auditor** who tests many sites and hands companies a
document. Not a developer in CI. That ordering drives most of what follows: the report is
the product, the CLI is downstream of it, and the artifact has to survive being read by
someone who will dispute it.

### Why this cannot be a web page

A browser cannot perform the central measurement. `Accept-Language` is a
[forbidden header name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name)
— JavaScript cannot set it. Cross-origin responses are unreadable under CORS. Redirect
chains are invisible to `fetch()`. So there is no `movar.fyi/audit` page: the HTTP tier
requires a native runtime or a CLI. (A future Movar-hosted `relay` vantage would unlock a
web version, which is one reason `relay` exists in the schema from day 1.)

### What already exists here

- **Pure model packages** — [`@movar/page-language`](../packages/page-language/AGENTS.md),
  [`@movar/lang-pickers`](../packages/lang-pickers/AGENTS.md),
  [`@movar/page-content`](../packages/page-content/AGENTS.md),
  [`@movar/lang-detect`](../packages/lang-detect/AGENTS.md). Sync, DOM-reading, jsdom-testable.
- **[`apps/diagnostics`](../apps/diagnostics/AGENTS.md)** already builds a per-page
  `PageDiagnostics` snapshot from those models. A per-page report partly exists; it is
  maintainer-only and in-browser.
- **[`apps/e2e/src/live/compare`](../apps/e2e/src/live/compare/README.md)** already runs a
  baseline leg against a treatment leg on live Google with curated keyword evidence — the
  differential method this ADR generalises.
- **Nothing in this repo does HTTP, and nothing has ever been published to npm.** Every
  workspace member is `private: true` and exports raw TypeScript; the whole release ritual
  is store-based.

---

## Decision

### 1. What the tool asserts

**The core is neutral i18n conformance.** _"Does this site honour the language it
declares?"_ Language-agnostic, and it maps directly onto **WCAG 2.1 SC 3.1.1 (Language of
Page, Level A)** and **SC 3.1.2 (Language of Parts, Level AA)** — which is the reason a
team with no interest in Ukrainian will still run it.

**The core never says "you should offer Ukrainian."** It says _"you declared Ukrainian and
did not deliver it."_ The first is advocacy: arguable, dismissible, and it gets the report
filed under activism by exactly the developers who need to act on it. The second is a
defect report with a repro.

**Statutory obligations live in jurisdiction packs**, not in the core, and each rule cites
its source. The first pack is `ua`, grounded in Ukraine's Law 2704-VIII ("On ensuring the
functioning of Ukrainian as the state language"), Art. 27 §6: a business selling goods or
services in Ukraine must have a state-language version that **loads by default**, no
lesser in volume and content than its other-language versions. This is not advocacy — it
is the same class of check as a GDPR cookie audit.

The pack yields two rule shapes the core structurally cannot produce:

- **Absence.** No `uk` declared anywhere _and_ not served by default. Safe to assert
  despite §4's declared-only discipline, because the statute requires _default loading_ —
  an undeclared, unreachable Ukrainian version fails it too. So there is no inference and
  no false-accusation exposure.
- **Version parity.** `uk` has 40 pages in the sitemap, `ru` has 120. Objective,
  evidence-rich, statutory, and entirely independent of the classifier.

A pack applies only when the site **declares** its market (`.ua` TLD, UAH pricing, ЄДРПОУ
code, Ukrainian legal entity, `uk-UA` hreflang). Undeterminable market → `not-applicable`,
never `fail`. The pack reports _found / not-found violation evidence_ with a citation; it
never renders a legal verdict.

The model generalises: Quebec's Charter of the French Language, Belgium, Switzerland.

### 2. The kernel

```
evaluate(evidence: Evidence, ruleset: Ruleset) → Report
```

Pure. Zero I/O. **Collection is deliberately not shared.** Each runtime writes its own
collector emitting the same serializable `Evidence`:

| Runtime              | HTTP tier           | Rendered tier                  |
| -------------------- | ------------------- | ------------------------------ |
| CLI (Node)           | `undici`            | Playwright (optional peer dep) |
| Host app (macOS/iOS) | `URLSession`        | isolated `WKWebView`           |
| Android (later)      | OkHttp              | `WebView` + Profile            |
| `apps/diagnostics`   | — (`not-collected`) | live content script            |

`@movar/audit` also ships a thin Node runner bundling the Playwright collector, for CLI
convenience. The claim _"the same package runs in CI and on your phone"_ is true of the
**judgement**, never of the **acquisition** — and stating it that way is the version that
survives the first question about how a phone sets a request header.

### 3. The evidence model

`Evidence` and the rule IDs — not the TypeScript module graph — are the public API.

- **`source` is a discriminated union**: `{kind:'network', vantage, …}` or
  `{kind:'filesystem', root}`. A filesystem has no network location, so matrix rules become
  structurally `not-collected` on static evidence with no rule remembering to check.
- **`vantage`** is the network location an observation is made _from_ — which egress IP,
  and therefore which country the site thinks you are in. It is **part of a finding's
  identity**: the same rule legitimately passes from one vantage and fails from another,
  and the report says which. Kinds: `local` (a real value, never `null`), `proxy` (BYO —
  `undici` `ProxyAgent`, Playwright `proxy`, iOS 17+ `WKWebsiteDataStore.proxyConfigurations`),
  and `relay` (declared in the schema, unimplemented).
- **`vantage.country` is a claim, not a measurement**, and carries an optional `verified`
  flag. A mock vantage must be able to say "I am Germany" while egressing from Kyiv; the
  same field on a future paid relay is therefore also just a claim, and geo-dependent
  findings must never present a declared country as an observed fact.
- **Schema evolution is additive by discipline, migrated by escape hatch.** Evidence carries
  `schemaVersion`; forward migrations guarantee anything ever published still replays.
  `not-collected` doubles as the mechanism: a field added in v2 is simply absent from v1
  evidence, and rules needing it degrade honestly instead of crashing. The one bump that
  added no field is v5, where a text sample's `nodePath` began pointing at the passage
  rather than at the element around it; nothing recomputes a stored bundle, so the version
  is what says which of the two a path in front of you was written under. v6 added
  `source.cookies`, the run's cookie posture — what the run _asked_ of cookies, which is
  not the same claim as what any probe's `cookieState` came back as.

### 4. Method

**The response matrix is the primary rule input.** Fetch the same URL N times varying only
`Accept-Language` (`uk` / `ru` / `en` / `de`), everything else identical. Declarations
(`<html lang>`, hreflang, picker markup) are _secondary_ evidence that explains a matrix
finding.

This is because "respects language preference" is not a property of a site. It is a
property of _(site × egress IP geo × `Accept-Language` × cookie state × prior session)_. A
GitHub runner in `us-east-1` and a phone on a Ukrainian mobile network get different HTML
from the same URL — and IP geo is precisely the signal these sites use _instead of_ the
header. Within one run all N probes share the egress, so the **differential is valid even
when the absolute is not**. That differential is also un-arguable in a way a single
observation never is: _"you served byte-identical Russian HTML for `uk`, `en`, and `de`."_

**Language inventory comes only from what the site declares** — the union of hreflang
alternates, picker options, `<link rel="alternate">`, sitemap alternates. Probing `/uk/`
or `uk.` to guess at an undeclared translation is forbidden: a false accusation is the one
failure mode that kills this product, and `/ua/` returning 200 on an SPA catch-all is not
evidence of anything. Inventory **discovery is itself a rule family** — hreflang declaring
`{uk, ru, en}` while the picker offers `{ru, en}`, or `<html lang="ru">` on a `/uk/` URL —
and the report leads with the discovered inventory so a reader can immediately see whether
the tool understood their site.

**The effective default language is always reported**, declared or inferred, with the
method stated. It is the context every other finding reads against.

**Switch verification synthesises rather than clicks.** `@movar/lang-pickers` already
computes a redirect target; fetch it directly and assert the final URL after redirects, the
served language, and the absence of a bounce. No browser, no timing, no consent banners —
and it catches the killer bug (a `uk-ua` hreflang that 301s back to Russian) as a fact that
replays. The browser click tier exists only for switchers exposing _no_ navigable target,
and that absence is itself a core finding: _"your language switcher exposes no URL — search
engines cannot index your other languages and nothing but a mouse can reach them."_ A known
blind spot in the extension becomes a rule in the audit.

**No per-site adapters.** No Google extractor, no YouTube extractor; those stay
extension-only. A checker with an allowlist is not a standard, and it would contradict the
standing claim that Movar works via common mechanisms rather than a list of sites.

**Scope** is page, cross-page, or whole site. `filesystem` + root → the whole build,
unconditionally. `network` + root → the **sitemap**, capped, falling back to page scope
(and saying so) when there is none. Non-root → that page plus its declared targets.
`--scope` overrides. **The inference lives in the CLI and the app, not the library** — the
library takes an explicit scope and holds no UX policy.

**Blocked collection is a first-class outcome.** A Cloudflare or DDoS-Guard interstitial
returns **HTTP 200** with its own `<html lang>` and its own body text, often English or
Russian. Adjudicating it manufactures a false accusation about a named company, published
as a PDF. So challenge pages are detected explicitly and produce `blocked` — distinct from
both `error` and `pass` — and nothing downstream of one is adjudicated. _"This site cannot
be audited unattended"_ is information, not a failure. **A browser `User-Agent` is never
spoofed to get past a challenge**: that makes the tool bot-protection evasion, which is
both an abuse posture and a listing risk.

### 5. Rules and verdicts

**No score.** Each rule yields `pass` / `fail` / `warn` / `not-applicable` /
`not-collected`; the headline is a **count of broken promises**. Weights would be arguments
that cannot be won, and a single number would laminate facts (a 301 chain) onto judgements
(a classifier verdict) so the weakest input sets the credibility of the whole thing.
Lighthouse's score works because Google backs it with ranking; there is no equivalent lever
here, so a score would buy gaming pressure and no compliance.

**`not-collected` is never `pass`.** The default failure mode of every audit tool is
silently passing what it did not check.

**Failing power is granted by grounding, not by topic.**

- Rules grounded in the site's **own declarations** may fail a build. The site convicts
  itself out of its own markup.
- Rules grounded in **text classification** are always cited observations. Never a build
  failure, and never aggregated into "this page is Russian" — the report states the
  denominator (_"3 of 340 text nodes"_), which is the difference between a finding and a
  smear. This is the same invariant the content-filter layer already holds; here the
  consequence of breaking it is published rather than a curtained card.
- **Mixed-language content is a WCAG 3.1.2 finding**, because the failing condition is the
  _missing `lang` attribute_, not the presence of another language. The classifier only
  points at where to look. English fragments inside Ukrainian pages are common and often
  deliberate, so `ru`-in-`uk` and `en`-in-`uk` grade at different severities, short strings
  and proper nouns are excluded, and `lang-detect`'s rungs plus the franc cross-check gate
  confidence.

**The ruleset floats with the package version and is stamped on every report.** Upgrading
`@movar/audit` applies new rules immediately; opting out is a suppression, not a pin. The
stamp is what keeps replay meaningful — without it, re-adjudicated evidence cannot
distinguish "the site changed" from "the rules changed."

**Suppressions follow the existing house doctrine** in
[`scripts/check-suppressions.mts`](../scripts/check-suppressions.mts): an allowlist of
suppressible rules, no file-level blanket ignores, mandatory justification, a budget that
only ratchets down, and — critically — **stale-suppression detection**, without which the
file becomes a graveyard that hides the next regression.

Implemented in `packages/audit/src/suppress.ts`. Two details the doctrine did not
prescribe and this one settles. First, **the allowlist is derived, not hand-maintained**: a
jurisdiction-pack rule is never suppressible (a statute is not a config option) and a
`classified` rule is never suppressible (it cannot fail, so an entry silencing one only
rots). Both fall out of the grading law, so the allowlist tracks the catalogue instead of
lagging behind a copy of it. Second, **a suppression never rewrites the `Report`**.
`evaluate()` is the instrument; a policy is a _reading_ of its output, and folding one into
the report would put "what this team agreed to ignore" inside the artifact that is supposed
to replay identically in three years. `applySuppressions` therefore returns which findings
were silenced, which stand, which entries went stale, and which broke the doctrine — and
hands the report back untouched.

**The first consumer is this repo.** `nx run marketing:audit` adjudicates the built
`apps/marketing/dist` on every PR (the `audit-site` job) and fails on a broken promise. A
language-conformance checker whose vendor's own site quietly fails its rules is a marketing
page, not an instrument — and the traffic runs both ways, since auditing our own build is
what caught the collector's first-response-header bug and a real `Vary` defect of ours (see
[the dogfood record](./movar-audit-dogfood-targets.md) §4). The build is audited rather
than the live URL because the whole page set is then available at once, offline and
deterministically, before anything ships; that is the only way `core/hreflang-not-reciprocal`
and `core/inventory-varies-across-pages` can be adjudicated at all, and the serving family
reads `not-collected` rather than passing silently.

**The library is neutral about what blocks.** No mode enum, no opinion about production
versus a local build. Coverage honesty is already structural: unrun rules read
`not-collected`, every probe carries its environment, and vantage sits in the finding's
identity. A report from `localhost` therefore already states on its face that geo-override
was not observed.

### 6. Network posture

**Zero backend.** Requests go only to the audited origin, from the user's own device.
Reports are local files; sharing is an export, never a hosted URL. This keeps _"Movar never
sends your data anywhere"_ intact across the seven mirrored privacy surfaces and both store
reviews, and it preserves the phone's one structural advantage — a real Ukrainian mobile IP
is a vantage no datacenter can buy honestly.

The privacy sentence is written correctly **now**, before any relay exists: _"Movar audits
from your device. Nothing is sent anywhere unless you explicitly choose a remote vantage."_
Wording it as an absolute today would mean retracting it later in front of
`/transparency`'s machine-verified promises.

- **Hard request budget per audit**, sequential, with a declared `User-Agent` identifying
  the tool and linking to what it does.
- **No crawling, ever.** Only the URL the user typed and targets that URL's own markup
  declares. Sitemap expansion is opt-in and capped — the site declares those URLs itself,
  so reading them is not discovery.
- **`robots.txt`**: ignored for the single URL the user typed (that is a page view);
  **honoured for site-scope expansion** (that is automated multi-page access);
  `--ignore-robots` for audits of a site you own.
- **Cold by default**, per §4: no cookie jar unless `--warm` asks for one, and the choice
  is stamped on the evidence (`source.cookies`) as well as on every probe. A warm leg is
  collected _beside_ the cold matrix, never instead of it — a leg is
  _(url × vantage × cookie state)_, so the two are different legs, and
  `core/serving-cookie-overrides-header` is the rule that reads the pair. Only the URL the
  user typed goes warm: `robots.txt` and declared targets stay cold, so no cookie the run
  collected is ever presented to an origin nobody typed. **The order under one budget is
  cold matrix, then warm leg, then `--follow`'s expansion**, so `--warm --follow` under a
  tight `--budget` can spend the ceiling before the expansion and leave the run without
  `traversal`. That is the intended order — `--warm` names a rule nothing else in the
  bundle can answer, and expansion reads the pages both matrices built — and what the run
  loses it loses visibly, as `not-collected` under an absent capability rather than as a
  pass.
- **A warm run's jar is scoped to the host that set each cookie**, and to `https` where the
  cookie said `Secure`. A jar that outlives one probe and answers every request from a
  single pile is a courier: a cookie a redirect collected from a consent or analytics
  origin goes back out to the site the user typed, and the typed site's own session goes
  out to strangers. Matching is on the **exact** host rather than the registrable domain —
  the latter needs a public-suffix list to be correct, and a hand-rolled guess fails open
  across a whole registry suffix, while exact matching can only withhold. `Domain` is read
  only to refuse a cookie the responding host may not set; `Path` and an already-past
  expiry are honoured; every judgement resolves toward sending less, because under-sending
  costs one rule a reading and over-sending puts somebody's data on the wire. `CookieJar`
  in `src/collect/probe.ts` states what is deliberately not honoured and why it costs
  nothing.
- **A future `relay` is an open-proxy/SSRF surface** and must be designed as one when it
  lands: scheme allowlist, private-range blocking, per-account rate limits, no arbitrary
  response passthrough. It is infrastructure for Movar's own client, never a general proxy
  service offered to third parties.

### 7. Provenance and evidence payload

**Provenance is always captured**, from day 1, because retrofitting it is impossible:

- full response headers, including the server's own `Date`
- the TLS certificate chain presented at fetch time
- a hash of the whole bundle, optionally **RFC 3161 timestamped** by a public TSA — a third
  party attesting the content existed at that moment, with no infrastructure of Movar's
- request timing and the full environment stamp

**Payload is opt-in.** Full response bodies and full-page screenshots sit behind an
evidence toggle — **off by default in the app**, a flag in the CLI. They are what make
replay byte-exact, but a site-scope audit is megabytes, and a page captured while logged in
contains the operator's own session. Publishing that would be a privacy incident with
Movar's name on it.

**Optional Internet Archive "Save Page Now" submission** creates an independent, citable
snapshot on a neutral third party — the strongest cheap corroboration for press or
regulatory use. It publishes the URL, so it is explicit opt-in per run.

**The report says what this proves and what it does not.** It is a reproducible record, not
legal proof; admissibility turns on jurisdiction, chain of custody, and usually an
affidavit from whoever ran it. Detection is not 100% accurate and a human must judge.
Claiming more would be the one overreach that discredits everything else.

**The tool holds no operator identity.** No names, no accounts, no signatures, nothing
personal in the evidence. It emits a measurement record; whoever needs to attest wraps it
in their own document. Movar Audit is an instrument, in the way Lighthouse is an
instrument — not an audit firm's workflow product.

### 8. The artifact

**One self-contained HTML file** carries the readable report, the embedded evidence, and
the replay command. Report and proof cannot get separated: the thing an auditor posts is
the thing a site owner re-runs.

```bash
npx @movar/audit --replay report.html
```

That single line is what separates credible pressure from a smear. The accused
re-adjudicates the exact bytes, against the stamped ruleset, on their own machine. The
report stops being an accusation and becomes a bug report with a repro — and it is also the
defence when a finding _is_ wrong.

**PDF is a rendering of that HTML, per surface** — `WKWebView.createPDF` on Apple platforms
(free, pixel-identical to what the operator saw), Playwright as an optional peer dep in the
CLI, falling back to `--format html`. Hand-built PDF layout was rejected: owning typography
and page-breaking in code, for a document whose entire job is to look credible, is a bad
trade.

**Screenshots are attachments, never rule inputs.** The moment a rule depends on pixels,
`evaluate()` stops being pure and replay dies. One `ScreenshotAsset` per page per matrix
leg, stamped with `{width, height, dpr, viewport, fullPageHeight}`; each finding carries a
**region** rect (CSS pixels, document origin) into it. The UI decides how to present —
crop, zoom, matrix, column. Evidence stores facts; presentation decides rendering.

Three capture hazards to respect: full-page capture **resizes the viewport**, re-triggering
media queries, unsticking sticky headers and firing lazy-load — so regions must be measured
in the same layout pass as the capture, or a highlight box lands on the wrong element in a
published PDF. Long pages need a height cap, recorded when applied. And because the region
is known, sharing can **blur everything outside the finding**: full context for the tester,
redacted context for the post.

**The report needs its own type scale.** `@movar/theme`'s type roles are product-UI only —
`type-display` is size-less and has already shipped broken once on a marketing page. A
report is a document.

**Naming.** The product is **Movar Audit**; the artifact is a **language conformance
report** («звіт про мовну відповідність»). "Audit report" alone does not say what was
audited.

### 9. Delivery

- **`@movar/audit`** publishes to npm as **one self-contained bundle** (tsup `noExternal`).
  The model graph stays `private: true` and freely refactorable; in-repo consumers keep
  importing source. `franc` and `langtell` are bundled, so
  [`gen-third-party-notices.mts`](../scripts/gen-third-party-notices.mts) must cover bundled
  deps, not just declared ones.
- **Its own release train** — separate changesets group, own tag namespace, publishing on
  merge. Not the extension's train: Apple review is days to weeks (and was broken for the
  better part of a year), and a CI package whose patch releases wait on App Store review is
  not a CI package. More sharply, the `production` environment gate approves **per
  environment, not per job** — one click currently releases all four store jobs, and adding
  npm behind it would mean a store approval also publishes something that cannot be cleanly
  unpublished.
- **Surfaces**: the CLI, and a tab in [`apps/safari-host-app`](../apps/safari-host-app/AGENTS.md)
  shipping **macOS and iOS** from the same React bundle. The host app is already the right
  architecture — React in a `WKWebView` for UI, a native Swift bridge for what the web layer
  cannot do. One new bridge method backed by `URLSession`; the strict `default-src 'self'`
  CSP stays, so _all_ egress is Swift, in one auditable place. macOS first: a non-technical
  auditor producing PDFs across many sites is at a desk.
- **The probe bridge is a specified, versioned contract** —
  `probe(url, headers, vantage, coldState) → {status, headers, redirectChain, bodyRef, timing}`
  — with the Swift implementation as its first conformer rather than its definition.
  Otherwise the Kotlin port starts with a redesign.
- **The rendered tier runs cold.** Non-persistent `WKWebView` data store; Android needs
  WebView **Profiles** (androidx.webkit, WebView 118+) because `CookieManager` is effectively
  global. A warm, logged-in session silently violates the matrix's _everything-else-identical_
  requirement — warm runs are an explicit, evidence-stamped option.
- **`apps/diagnostics` reuses the engine** and contributes a collector, gaining a Findings
  tab beside its existing model-internals tabs. It is the cheapest place to discover whether
  the collection/adjudication split actually works: if a third collector with different
  capabilities cannot drop in without a single rule changing, the split is wrong.
  **The extension shares the model packages and never the judge** — wiring the rule engine
  into the content script would put audit rules on the page-load hot path and leak the
  two-layer invariant.
- **MIT, everything.** The paid tier is a _service_ (hosted vantages), never a licence. A
  tool that publicly reports on companies must be inspectable itself; "read the rules,
  here's the evidence, re-run it" is the answer that ends the argument. The moat is the rule
  corpus and reputation, not the code.

### 10. Sequencing

**Advocacy first**, because there is a real first user. The advocate's report is also the
CLI's distribution channel: a site owner's first contact with `@movar/audit` is being handed
one, with a command to disprove it.

---

## Rationale

Six decisions carry this design; the rest follow from them.

**1. Collection is separated from adjudication (load-bearing).** Playwright,
`WKWebView.evaluateJavaScript`, and `fetch` + jsdom have no honest common denominator; a
shared driver interface would either fail to express "follow the switch" or force every host
to fake it. Separating them buys three things that nothing else buys: deterministic replay
from a stored bundle, a rule set unit-testable with no network and no browser, and a
truthful version of the "same package everywhere" claim.

**2. The measurement is differential.** One observation of a site tells you nothing,
because the site's answer depends on where you stand. The compare harness in `apps/e2e`
already proved this shape with a baseline and a treatment leg. Making the matrix primary
converts geo from a hidden confounder into a declared one, and produces the class of
evidence a developer cannot argue with.

**3. Failing power tracks grounding, not topic.** A false accusation is the one failure
mode that kills this product. Declaration-grounded rules are safe to make blocking because
the site's own markup is the witness; classifier-grounded rules are not, at any accuracy,
because the blast radius is a published document about a named company rather than a
curtained card the user can reveal. The statute pack sits on the safe side because _default
loading_ is observable.

**4. Falsifiability is the credibility mechanism.** The report embeds its evidence and its
replay command, so the accused can re-run it. That is what makes a public finding a bug
report rather than a smear, and it is the only defence available on the day a finding is
wrong — which will happen.

**5. Zero backend is load-bearing, not squeamish.** Auditing from a server would replace the
user's real Ukrainian IP with a datacenter IP, and geo-gated sites would hand the tool a
different answer than they hand the user — making the product strictly worse at the thing it
exists to measure. It also keeps Apple 1.2's user-generated-content obligations out of
scope, since there is no service anything is posted to.

**6. WCAG is the adoption argument.** 3.1.1 and 3.1.2 mean the core is an accessibility
check, which gets it into pipelines that would never install a Ukrainian language tool. The
statute pack then rides on the same engine for the market that needs it.

---

## Consequences

- **This repo starts publishing to npm.** A real build (`dist` + `.d.ts`), an `exports` map,
  semver, provenance, a publish token, and a public API that cannot be refactored freely.
  `publint` in `pnpm validate` is the only existing machinery.
- **Two release rituals to document**, on top of the hardest-won doctrine in the repo.
- **Two collectors to write and keep in step** (TypeScript and Swift, Kotlin later), against
  a bridge contract that has to be specified before the first one is written.
- **`Evidence` and rule IDs become permanent public contracts.** Reports published in 2026
  must still replay in 2029, or the falsifiability claim expires.
- **A new workspace member needs its own `vitest.config.ts`** declaring the `json-summary`
  reporter, or it vanishes from the coverage denominator and trips
  [`metrics-gate`](./metrics-gate.md) — a 100%-covered new package can still fail the gate.
  It also needs an `AGENTS.md` plus a row in the root map.
- **The host app's App Store identity changes.** Its listing, screenshots and description
  stop describing an extension container. This _helps_ under guideline 4.2 (minimum
  functionality), which penalises apps that are only wrappers.
- **The statute citations must be verified by a lawyer** before they ship in a document that
  may reach a regulator or a court.
- **Screenshots and full bodies are off by default**, which is simultaneously a privacy
  measure, a size measure, and a store-risk measure.
- **Play's Device and Network Abuse policy** forbids using a service "in a manner that
  violates its terms of service", which is the clause most exposed to auditing sites you do
  not own. Android is deferred; the framing should be settled before it lands.

---

## Considered alternatives

| Rejected                                                      | Why                                                                                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A shared runner with pluggable drivers**                    | The driver interface leaks. `fetch`, Playwright and `WKWebView` share no honest common denominator, and the lowest-common-denominator surface cannot express switch traversal.    |
| **A server-side runner with a thin client**                   | Destroys the only structural advantage the phone has — a real in-country residential IP — for a product whose central variable is geo.                                            |
| **A Lighthouse-style 0–100 score**                            | Weights are unwinnable arguments; a single number averages facts with classifier judgements; and without Google's ranking lever a score buys gaming pressure and no compliance.   |
| **Inferring undeclared translations** (probing `/uk/`, `uk.`) | Manufactures false accusations, which is the one failure mode that ends the product. `/ua/` returning 200 on an SPA catch-all is not evidence.                                    |
| **Publishing the model package graph to npm**                 | Freezes seams under active churn (`page-language`'s tier chain, `lang-pickers`' known blind spots) into semver negotiations with strangers, for APIs shaped for a content script. |
| **Pinned ruleset version in config**                          | A pinned ruleset is one nobody bumps; the bar stops rising. Replaced by float-plus-stamp, which preserves replay without freezing adoption.                                       |
| **A snapshot ratchet instead of suppressions**                | Findings are site-shaped and heterogeneous, not scalar; a snapshot churns on unrelated content changes and produces a diff nobody reads.                                          |
| **`local` vs `monitor` modes in the library**                 | Redundant. `not-collected`, the environment stamp and vantage-in-identity already make coverage honest without a mode enum.                                                       |
| **A hosted report URL / public league table**                 | Makes Movar a permanent publisher of accusations about named companies, and there is no score to rank by anyway.                                                                  |
| **Operator attestation in the tool**                          | Movar holds no personal information. The instrument measures; whoever attests wraps it in their own document.                                                                     |
| **Wiring the rule engine into the extension**                 | Puts audit rules on the page-load hot path and leaks the two-layer invariant the content script exists to protect.                                                                |
| **Per-site adapters in the audit**                            | A checker with an allowlist is not a standard, and it contradicts the claim that Movar works via common mechanisms.                                                               |

---

## Open questions

- **Rule thresholds** — the catalogue exists in
  [movar-audit-rules.md](./movar-audit-rules.md); what remains open is calibration
  (rung/franc gates for `core/lang-part-unmarked`, the volume delta at which
  `ua/state-language-version-lesser` fires) and the second jurisdiction pack.
- **Legal review** of the Law 2704-VIII citations: article, effective date, enforcement
  scope, and the exact wording the report uses.
- **Android timing**, and the framing that answers Play's terms-of-service clause.
- **Host app listing rewrite** for both stores, in uk and en.
- **Whether `relay` ever ships**, and if so under what pricing and abuse controls.

---

## Related

- [movar-audit-rules.md](./movar-audit-rules.md) — the rule catalogue: 46 checks, their
  grounding, and the capability each one needs
- [priority-driven-switching.md](./priority-driven-switching.md) — the redirect layer this
  audits from the outside
- [page-content-and-lang-pickers-refactor.md](./page-content-and-lang-pickers-refactor.md) —
  the two-layer invariant the classifier rules inherit
- [no-content-translation.md](./no-content-translation.md) — the block-never-translate stance
- [no-llm-language-detection.md](./no-llm-language-detection.md) — why detection accuracy is
  bounded, and why a human judges
- [store-policy-stance.md](./store-policy-stance.md) — the existing reviewer-facing posture
- [metrics-gate.md](./metrics-gate.md) — the coverage gate a new package must satisfy
- [glossary.md](./glossary.md) — add `vantage`, `response matrix`, `language inventory`,
  `jurisdiction pack`
