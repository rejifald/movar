# Metrics gate

A PR-time check that fails when a change **degrades measured quality**, with a
human-only override for intentional regressions. It's the enforcement half of
the README [`## Metrics`](../README.md#metrics) story — the rendering half
(`pnpm check:readme`) keeps the README text in sync with the committed snapshot,
but can't notice when the snapshot itself drifts from reality. This gate does.

## What it checks

Implemented in [`scripts/metrics-gate.mts`](../scripts/metrics-gate.mts), run by
[`.github/workflows/metrics-gate.yml`](../.github/workflows/metrics-gate.yml) on
every PR. It recomputes the dynamic metrics for the PR head and compares them
three ways:

| #   | Check                       | Fails when                                                                   | Overridable?                                  |
| --- | --------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | **Coverage freshness**      | the committed `readme-metrics.snapshot.json` coverage ≠ recomputed coverage  | No — a wrong number is wrong, not a trade-off |
| 2   | **Coverage regression**     | recomputed line/branch coverage drops below the base commit's snapshot       | Yes (label)                                   |
| 3   | **Code-quality regression** | `fallow audit --base <base>` finds new dead code, complexity, or duplication | Yes (label)                                   |
| 4   | **Coverage floor**          | recomputed line/branch coverage drops below the absolute `COVERAGE_FLOOR`    | No — a waivable floor is the ratchet it stops |

Check 1 does double duty: enforcing it on every PR keeps `main`'s committed
snapshot honest, which is what lets check 2 use that snapshot as the baseline
instead of re-running coverage on the base commit.

Check 4 is the backstop check 2 can't be: base-relative regression only catches
a single large drop, so a run of sub-threshold PRs — or repeated use of the
override label — could ratchet coverage down indefinitely. The absolute floor
(`COVERAGE_FLOOR` in [`scripts/metrics-gate.mts`](../scripts/metrics-gate.mts),
seeded a whole point below the current snapshot at `lines 91.7 / branches 84.6`)
is a hard minimum that the `accept-metrics-regression` label does **not** bypass.
Raise it deliberately as real coverage climbs (commit the new numbers); never
lower it to make a red gate pass. A breach exits with code `3`.

The absolute fallow **health score** is intentionally _not_ gated — it folds in
git churn and drifts commit-to-commit independent of the diff, which would make
the check flaky. Base-relative quality regressions are caught by `fallow audit`
(check 3) instead.

## Fixing a red gate

- **Stale coverage (exit 2):** run `pnpm metrics` and commit the updated
  `scripts/readme-metrics.snapshot.json` (and `README.md`).
- **Coverage regression (exit 1):** add tests, or accept it (below).
- **`fallow audit` regression (exit 1):** remove the dead code / split the
  complex function / de-duplicate, or accept it (below). `pnpm metrics:audit`
  reproduces it locally.

## The override (intentional regressions)

Sometimes a regression is the right call (deleting a well-tested module, adding
inherently-untestable glue). To merge anyway, a **maintainer** adds the
`accept-metrics-regression` label to the PR. The `labeled` event re-runs the
gate, which now passes with the regression logged in the check output.

**Only a human maintainer may apply it.**
[`metrics-override-guard.yml`](../.github/workflows/metrics-override-guard.yml)
watches for the label and removes it (with an explanatory comment) when the
account that applied it is a bot or isn't on the `MAINTAINERS` allowlist in that
workflow. So `github-actions[bot]`, any GitHub App, and any non-maintainer
account are hard-blocked from waving a regression through.

> [!IMPORTANT]
> GitHub gates on **identity**, not intent. The guard hard-blocks other
> accounts, but it cannot tell an agent driving a maintainer's _own_ account
> from the maintainer. Today agents run under the `rejifald` account, so for
> agent-authored PRs the override is an **audited, deliberate action** (it shows
> in the PR timeline and the gate log) rather than a technical wall. The moment
> agents get a distinct identity, leave that identity off `MAINTAINERS` and the
> wall becomes real — no other change needed.

## Enforcement (the ruleset)

The gate only blocks merges because the branch **ruleset** marks `metrics-gate`
a required status check. The config is committed as code at
[`.github/rulesets/main-metrics-gate.json`](../.github/rulesets/main-metrics-gate.json):

- **Requires a PR** with `required_approving_review_count: 0`. Requiring a PR is
  what forces every change through the gate; 0 approvals is necessary because
  this is a solo repo and GitHub blocks self-approval — a `>= 1` requirement
  would lock the sole maintainer out of their own PRs.
- **Requires** `ci-gate` and `metrics-gate` to pass (strict / up-to-date).
  `ci-gate` (in [`ci.yml`](../.github/workflows/ci.yml)) is an aggregator that
  passes only when `verify`, the three-browser `build` matrix, and the
  `e2e-offline` visual suite all pass — so the ruleset references one stable
  context and never has to change when a job is added, renamed, or split.
  (`verify-release` runs post-merge on pushes to `main`, not on PRs, so it is
  deliberately not a merge gate.)
- **`bypass_actors: []`** — applies to admins too, so even the owner must add
  the override label rather than silently force-merging a regression. The
  committed JSON is config-as-code, not auto-synced: after editing
  `bypass_actors` you must re-apply it to GitHub with the PUT command below, or
  the live ruleset keeps its previous (possibly admin-bypassing) state.

### Applying / updating it

```sh
# Create (first time):
gh api -X POST repos/{owner}/{repo}/rulesets \
  --input .github/rulesets/main-metrics-gate.json

# Update (after editing the JSON — needs the ruleset id from `gh api repos/{owner}/{repo}/rulesets`):
gh api -X PUT repos/{owner}/{repo}/rulesets/<id> \
  --input .github/rulesets/main-metrics-gate.json
```

> **Rollout order:** land `metrics-gate.yml` on `main` **before** activating the
> ruleset. If `metrics-gate` is required before the workflow exists on `main`,
> PRs wait forever on a check that never reports. To stage safely, create it with
> `"enforcement": "evaluate"` first (logs but doesn't block), then flip to
> `"active"`.

### When a second maintainer joins

Switch the human override from "label only" to "label **and** a required Code
Owner approval": set `require_code_owner_review: true` and
`required_approving_review_count: 1` in the `pull_request` rule, and add them to
[`.github/CODEOWNERS`](../.github/CODEOWNERS). Self-approval stops being a
blocker once there are two humans.
