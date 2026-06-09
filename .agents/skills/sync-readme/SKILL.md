---
name: sync-readme
description: |
  Fix drift between the root README.md and its sources of truth — the
  marketing hero tagline (apps/marketing/src/i18n.ts), the workspace layout
  (apps/* + packages/*), and the generated metrics badge block (code health,
  test coverage, permissions, license, and verified product promises). Use when
  `pnpm check:readme` fails, when the README parity guard reports a tagline,
  monorepo-layout, or broken-product-promise mismatch, or after you add
  / remove / rename a workspace package or change the marketing tagline and the
  README must follow. Also use when manually auditing README.md for drift from
  the product or marketing site. Do NOT use for before/after screenshot use
  cases (that's add-before-after-case) or for editing marketing copy itself —
  the README mirrors the marketing app, not the other way around.
---

# Keep README.md in sync with marketing + the workspace

`README.md` is hand-written prose that must not contradict the product. Several
facts are machine-enforced by a guard; the rest is your judgment.

## The guard

`pnpm check:readme` runs in `pnpm validate`, lefthook pre-commit, and CI's
`verify` job. It chains two scripts (`scripts/check-readme-parity.mts` and
`scripts/gen-readme-metrics.mts --check`) and fails the commit/build on any of
four machine-checkable mismatches:

1. **Tagline** — the README's first blockquote must equal the marketing hero
   headline.
2. **Monorepo layout** — the `## Monorepo layout` block must list every
   `apps/*` and `packages/*` member (each dir with a `package.json`), and
   nothing that no longer exists.
3. **Metrics block** — the generated `<!-- METRICS:START … -->` badge row must
   match a fresh render from its committed sources. Unlike 1 & 2, drift here is
   **auto-fixed**: just run `pnpm gen:readme` (then `pnpm metrics` to refresh the
   snapshotted health + coverage numbers).
4. **Product promises** — marketing claims from `i18n.ts` are verified against
   the code (LICENSE, the extension manifest + source, `defaultSettings`). A
   **broken** promise is NOT auto-fixable: `pnpm gen:readme` renders the ✗, but
   `--check` still fails until you restore the invariant — or update the
   promise/marketing copy if the product genuinely changed.

## Sources of truth

| README element       | Canonical source                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tagline (blockquote) | `strings.en.hero.headlineLine1 + ' ' + headlineLine2` in `apps/marketing/src/i18n.ts`                                                                 |
| Monorepo layout      | `apps/*` + `packages/*` dirs on disk                                                                                                                  |
| Feature claims, copy | `docs/copy.md` (voice + claims) and the marketing `i18n.ts`                                                                                           |
| Default behaviours   | `packages/settings/src/index.ts` (`defaultSettings`)                                                                                                  |
| Tech stack / deps    | the actual `package.json` dependency trees                                                                                                            |
| Metrics badges       | `pnpm gen:readme` ← wxt manifest permissions + LICENSE (live); fallow health + Vitest coverage (snapshot via `pnpm metrics`)                          |
| Product promises     | `collectPromises()` in `gen-readme-metrics.mts` ← marketing claims (`i18n.ts`) checked vs LICENSE, the extension manifest + source, `defaultSettings` |

## Procedure

1. Run `pnpm check:readme` and read exactly what it reports.
2. **Tagline mismatch** → set the README blockquote to the marketing hero
   headline verbatim. If `design-brief.md`'s tagline diverges too, fix it in
   the same pass (it's the brand spec; not machine-checked).
3. **Layout mismatch** → add every missing `apps/<x>` / `packages/<x>`, drop
   any that no longer exist, and keep the comment column aligned.
4. Re-run `pnpm check:readme` until green.

## Not machine-checked — eyeball these too

The guard can't catch prose drift. While you're in the README, confirm:

- **Feature list matches reality.** Off-by-default capabilities (e.g.
  `contentModification` in `packages/settings`) must say "Beta, off by default".
  Don't list features that were removed (the old "usefulness dashboard" was).
- **Tech stack lists only real deps.** If a library isn't in any
  `package.json` / lockfile (Tremor was a stale entry), drop it.
- **Browser targets match the marketing download buttons** (Chrome, Firefox,
  Edge, Opera, Brave, Safari).
- **Claims match `docs/copy.md`** — it's the copy authority.

## Verify

`pnpm check:readme` is green, and `pnpm exec prettier --check README.md` passes.
