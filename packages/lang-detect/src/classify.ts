/**
 * The candidate-relative snippet classifier — single-sourced from `langtell`.
 *
 * `langtell`'s `classifyBySnippet` was ported from this module, so the two were
 * byte-equivalent forks. Rather than carry a second copy that would drift, this
 * package now re-exports the shared core from `langtell/classify`; the
 * convergence is guarded by `langtell-equivalence.test.ts`, which drives both
 * ports across every rung and asserts an identical `{ language, margin, rung }`.
 *
 * The rung ladder, candidate scoping, and the verdict types all live in langtell
 * now. What stays movar-only is the franc-backed rung-3 resolver injected into
 * `classifyBySnippet` (see `classify-franc.ts` / the `@movar/lang-detect/franc`
 * subpath): langtell stays franc-free and takes the resolver as a seam.
 *
 * `scopeCandidates` and `RUNG3_MIN_LENGTH` are surfaced (from langtell 0.5.0) for
 * `classify-franc.ts`'s off-path franc oracle, which scopes raw candidates the
 * same way the classifier does internally — so the two never drift.
 */
export {
  classifyBySnippet,
  FRANC_RUNG,
  RUNG3_MIN_LENGTH,
  scopeCandidates,
} from 'langtell/classify';
export type { Rung3Resolver, RungVerdict, SnippetVerdict } from 'langtell/classify';
export type { LanguageProfile } from 'langtell';
