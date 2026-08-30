# Movar roadmap

The map for wrapping up the current push and stepping away on solid ground. It
defines the **next version** (scope + Definition of Done) and the **deferred
lane** that is planned now but built later.

- **GitHub milestones:** [v1.3.0 — Safari + Diagnostics view](https://github.com/rejifald/movar/milestone/1) (shipped) · [vNext (backlog)](https://github.com/rejifald/movar/milestone/2)
- **Last published:** `@movar/extension` v1.7.0 (tag `extension-v1.7.0`, GitHub Release published 2026-08-22) — submitted from CI to the Chrome Web Store, Firefox AMO, and Edge Add-ons. The App Store is a version behind on v1.6.2; see "Where things stand".
- **v1.5.1 was cut but never published.** `apps/extension/package.json` was bumped to `1.5.1` and the `extension-v1.5.1` tag pushed (commit `3575d61`), but no GitHub Release was ever published on that tag — and `.github/workflows/release.yml` triggers on `release: [published]`, not on a tag push, so no store job ran and `1.5.1` never reached a user. Its single fix (YouTube search-result video clicks) folds into v1.5.2.
- **v1.1.0 was skipped.** `apps/extension/package.json` was bumped to `1.1.0` (commit `ef7121e`) but never tagged or released; that work folded into v1.2.0. The number `1.1.0` was never published to any store and will not be.

---

## Where things stand (v1.7.0 on the browser stores; v1.6.2 on the App Store; v1.8.0 being cut)

- **v1.8.0 is the release being cut**, and it is an Apple-led one. The three
  `minor` changesets are all host-app work — macOS gets a layout of its own instead
  of the phone screen in a window ([#551](https://github.com/rejifald/movar/pull/551)),
  the Detector's roster editor folds into the tab it describes
  ([#522](https://github.com/rejifald/movar/pull/522)), and the verdict and its
  evidence become one card ([#540](https://github.com/rejifald/movar/pull/540)) —
  joined by the iPad's measured column
  ([#553](https://github.com/rejifald/movar/pull/553)) and the macOS clipping fixes
  ([#552](https://github.com/rejifald/movar/pull/552)). The remaining changesets are
  `@movar/audit` / `@movar/audit-engine` and reach a user only through the Audit tab.
  **No manifest-permission change since v1.5.0**, so the permission-justification
  surfaces need no re-sync.
- **v1.7.0 never reached the App Store.** Its `release-safari` job uploaded a build
  on 2026-08-22 and succeeded, but `altool --upload-app` only _delivers_; the
  submission is `safari-submit.yml`, a separate manual dispatch, and it was never run
  for that version. The build is superseded rather than rescued — it predates every
  macOS change above.
- **A tag alone ships nothing.** `.github/workflows/release.yml` submits to the
  Chrome Web Store, Firefox AMO, and Edge Add-ons only when the `extension-vX.Y.Z`
  **GitHub Release is published** (the tag must match `apps/extension/package.json`);
  a bare tag push or a `release/**` branch push validates only and never reaches a
  store. v1.5.1 is the standing proof of this failure mode — see the header above and
  [docs/release-credentials.md](release-credentials.md).
- **The Version workflow is broken.** `.github/workflows/changesets.yml` fails with
  `GitHub Actions is not permitted to create or approve pull requests`, so the
  `chore: version packages` PR is never opened. Until that repo setting is flipped
  (Settings → Actions → General → Workflow permissions), cut the bump by hand on a
  `release/extension-vX.Y.Z` branch with `pnpm version:packages`.
- **The Ukrainian store listings are stale.** The «Мовар» rename changed
  `store-assets/copy/summary.uk.md` and `description.uk.md`; the CWS, AMO, and Edge
  Ukrainian listings still carry the old wordmark and need re-uploading with this
  submission.
- **Safari ships from CI — in two steps, and the second one is manual.**
  `release-safari` archives, notarizes and uploads on a published GitHub Release;
  `safari-submit.yml` then creates the version, attaches the build, fills "What's
  New" per localization and submits (`plan` → `prepare` → `submit`). Both have worked
  since [#386](https://github.com/rejifald/movar/pull/386) — v1.6.2 went up and into
  review entirely from CI on 2026-08-11. The long-standing "headless provisioning
  401" diagnosis was wrong; the 401 was a malformed `APPLE_ASC_ISSUER_ID`. Xcode
  Organizer is now the fallback, not the route
  ([docs/safari-deploy.md](safari-deploy.md)). Safari's version lives in the Xcode
  project's `MARKETING_VERSION`, not `package.json`, and App Store Connect requires a
  "What's New" entry **per localization** on every version after the first — so each
  release needs a uk + en block in
  [`apps/extension/store-assets/RELEASE-NOTES.md`](../apps/extension/store-assets/RELEASE-NOTES.md).
  **Screenshots are still hand-uploaded** in App Store Connect: `scripts/apple-submit.mjs`
  handles versions, notes, compliance and submission, and no screenshots at all.
  **macOS and iOS/iPadOS are both live** on one listing
  ([id6779282071](https://apps.apple.com/app/id6779282071); macOS since 2026-06-30),
  serving v1.6.2 with **v1.8.0 in review** on both platforms (submitted from CI
  2026-08-30) — as recorded in `deployment-checklist.md`'s store table.
- **Diagnostics lives outside the product.** Content-retaining/analysing tooling ships
  separately, never in the trust-critical MIT artifact. It lives in
  `apps/diagnostics`, a private, never-published dev extension that re-runs
  `@movar/lang-detect` over **generic** page text and records
  classifier-vs-franc-oracle divergences.
- **Calibration harness exists.** `packages/lang-detect/scripts/calibrate.mts`
  sweeps a labeled residual corpus → recommends `(lengthFloor, hideMargin)` vs
  the current `(24, 0.22)`. Today the loop from "a corrected snippet" to "new
  thresholds" is manual.

---

## v1.3.0 — "Safari + Diagnostics view" (shipped)

> **Kept for the record.** Both themes closed and shipped in v1.3.0; the current
> published version is v1.5.0 (see "Where things stand" above). The goal below was:
> make Movar available on the iOS, iPadOS, and macOS App Stores, and turn the
> diagnostics dev extension into a **card-scoped view** that shows how the page was
> broken into items and what language each item was detected as.
>
> The only **user-facing** change is Safari availability. The diagnostics work
> is dev-only and never ships in the product — the boundary invariant holds.

### Theme A — Safari on iOS, iPadOS & macOS · [#56](https://github.com/rejifald/movar/issues/56)

The extension code is ready (every API in use is Safari-compatible); the work is
**distribution**. App Store only — iOS + iPadOS as one universal app, macOS as a
second app. The gaps: Apple Developer enrollment, App Store Connect listings +
metadata + screenshots, signing/notarization secrets, a `release-safari` CI job,
and finishing `docs/safari-deploy.md` from the worktree.

> **Top risk — verify early.** The iOS Safari MV3 **static-import smoke test**
> (`deployment-checklist.md`): confirm the content script's static imports of
> `@movar/lang-detect/engines/*` load without error on iOS, where Chrome
> built-in AI doesn't exist and the franc fallback must carry detection. This is
> the riskiest unverified claim for the target — test it before committing to
> the store timeline.

Full DoD: [#56](https://github.com/rejifald/movar/issues/56).

### Theme B — Card-scoped diagnostics view · [#57](https://github.com/rejifald/movar/issues/57)

Upgrade `apps/diagnostics` from generic text sampling to running the product's
**actual extractor**, so each _item_ is shown with its structural kind and its
per-item language verdict.

A note on "page structure": Movar doesn't classify arbitrary structure — it runs
per-host extractors (currently **Google SERP + YouTube**,
`apps/extension/src/lib/page-content/`) that emit typed `ContentNode` cards. This
view surfaces exactly that — which extractor matched, each card's `CardKind`, its
sampled text, the `SnippetVerdict` (language, rung, margin), and whether the
product would hide it — and falls back to generic sampling where no extractor
matches. **Read-only this version**; the override is deferred (below).

Key sub-task: promote `page-content/` into a shared package consumed by both the
product and diagnostics (ADR `diagnostics-devtools-panel.md` decision 7). Full
DoD: [#57](https://github.com/rejifald/movar/issues/57).

### Explicitly out of scope for v1.3.0

- **Override → back-feed loop** → deferred to vNext ([#58](https://github.com/rejifald/movar/issues/58)).
- **Belarusian / multi-language** — separate theme; not this version.
- **New site extractors** beyond Google/YouTube.
- **macOS direct-download DMG** — App Store only this version.

### Version Definition of Done (the wrap-up gate)

Call v1.3.0 done — and safe to step away — when:

- [ ] Theme A ([#56](https://github.com/rejifald/movar/issues/56)) and Theme B ([#57](https://github.com/rejifald/movar/issues/57)) DoD are met.
- [ ] `main` is green: `pnpm validate` (typecheck + lint + test + publint) and e2e.
- [ ] v1.3.0 is **live on all four stores** — Chrome / Firefox / Edge (as before)
      and **Safari** on the iOS, iPadOS, and macOS App Stores.
- [ ] In-flight branches are landed or archived; scattered WIP
      (`reconcile/stash-*`, stale `feat/*`) is triaged so no orphaned work is
      left behind.
- [ ] This roadmap and the GitHub milestones reflect what shipped vs. what's
      deferred.

### Suggested sequencing

1. **Phase 0 — done.** The diagnostics dev extension and the Safari build
   scaffolding are already merged to `main` (shipped under v1.2.0); the base is clean.
2. **Phase 1 — Safari App Store** ([#56](https://github.com/rejifald/movar/issues/56)). User-facing and the crucial milestone;
   front-load the iOS static-import smoke test.
3. **Phase 2 — Card-scoped diagnostics view** ([#57](https://github.com/rejifald/movar/issues/57)). Independent of Phase 1;
   maintainer tooling, no store gating.

---

## vNext (backlog)

### Diagnostics override → calibration back-feed loop · [#58](https://github.com/rejifald/movar/issues/58)

The deferred half of the diagnostics work: let a maintainer **override** a
per-item language verdict in the panel and **back-feed** it into the classifier.
Intended shape (decided 2026-06-05) — override sets the correct gold label →
corrections accumulate on-device → an export emits `CalibrationSample[]` in the
exact shape `calibrate.mts` already consumes → feed the corpus and run the sweep
→ commit `thresholds.ts` if leak/false-hide improves (`maxFalseHide = 0`).
Depends on the card-scoped view ([#57](https://github.com/rejifald/movar/issues/57)); additive, and best tuned once
there's real card-scoped observation data. Full design: [#58](https://github.com/rejifald/movar/issues/58).

### Other future lanes (not yet issues)

- **Belarusian (be→uk), then multi-language separability.** Reuses the existing
  blocking; the constraint is linguistic separability, not politics. Belarusian
  is the natural first addition; the diagnostics candidate set already hints `be`.
- **More site extractors** — broaden card-scoped coverage beyond Google/YouTube.
- **macOS direct-download** — a notarized, Developer-ID-signed DMG (the worktree
  already scaffolds `exportOptions/developer-id.plist`).

---

## References

- **Diagnostics architecture:** [docs/diagnostics-devtools-panel.md](diagnostics-devtools-panel.md)
- **Per-snippet detection & oracle:** [docs/per-snippet-language-detection.md](per-snippet-language-detection.md)
- **Calibration harness:** [docs/rung3-threshold-calibration-harness.md](rung3-threshold-calibration-harness.md)
- **Page-language detection tiers:** [docs/on-device-language-detection.md](on-device-language-detection.md)
- **Shipping:** [deployment-checklist.md](../deployment-checklist.md), [docs/release-credentials.md](release-credentials.md)
