/**
 * The candidate-relative snippet classifier — single-sourced from `langtell`.
 *
 * `langtell`'s `classifyBySnippet` was ported from this module, so the two were
 * byte-equivalent forks. Rather than carry a second copy that would drift, this
 * package now delegates to the shared core in `langtell/classify`; the
 * convergence is guarded by `langtell-equivalence.test.ts`, which drives both
 * across every rung and asserts an identical `{ language, margin, rung }`.
 *
 * The rung ladder, candidate scoping, and the verdict types all live in langtell
 * now. What stays movar-only is the franc-backed rung-3 resolver injected into
 * `classifyBySnippet` (see `classify-franc.ts` / the `@movar/lang-detect/franc`
 * subpath): langtell stays franc-free and takes the resolver as a seam.
 *
 * movar classifies with {@link MOVAR_CLASSIFY_OPTIONS}, applied here once so
 * every consumer — the extension's worker, Movar Audit, the diagnostics panel,
 * the Safari host app and the test suites — judges a snippet the same way.
 *
 * `scopeCandidates`, `textInScope` and `RUNG3_MIN_LENGTH` are surfaced for
 * `classify-franc.ts`'s off-path franc callers, which scope raw candidates and
 * feed franc the same way the classifier does internally — so they never drift.
 */
import { classifyBySnippet as classifyWithOptions } from 'langtell/classify';
import type { ClassifyOptions, Rung3Resolver, SnippetVerdict } from 'langtell/classify';
import type { LanguageProfile } from 'langtell';

export { FRANC_RUNG, RUNG3_MIN_LENGTH, scopeCandidates, textInScope } from 'langtell/classify';
export type { Rung3Resolver, RungVerdict, SnippetVerdict } from 'langtell/classify';
export type { LanguageProfile } from 'langtell';

/**
 * How movar classifies. `isolateScripts` judges each script of a mixed-script
 * snippet on its own evidence: a Russian clause beside a longer Latin product
 * name is read as Russian, and franc never judges a short Cyrillic name on the
 * strength of the English around it. See docs/mixed-script-snippets.md.
 */
export const MOVAR_CLASSIFY_OPTIONS: Readonly<ClassifyOptions> = { isolateScripts: true };

/** langtell's `classifyBySnippet` under {@link MOVAR_CLASSIFY_OPTIONS}. */
export function classifyBySnippet<P extends LanguageProfile = LanguageProfile>(
  text: string,
  candidates: readonly P[],
  rung3?: Rung3Resolver<P>,
): SnippetVerdict {
  return classifyWithOptions(text, candidates, rung3, MOVAR_CLASSIFY_OPTIONS);
}
