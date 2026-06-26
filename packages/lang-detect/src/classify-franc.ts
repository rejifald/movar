/**
 * franc-backed pieces of the snippet classifier, split out of classify.ts so
 * that module stays franc-free (importable without pulling franc's trigram
 * tables). Provides:
 *  - `francRung3Resolver` — the rung-3 backstop injected into classifyBySnippet
 *  - `francOracle` — the off-path oracle for the shadow comparison (shadow.ts)
 *
 * Pure + isomorphic. This is the ONLY franc importer on the classify side, so
 * a consumer reaches franc here only by explicitly importing this module (or
 * the `@movar/lang-detect/franc` subpath that re-exports it).
 */
import { francAll } from 'franc';
import type { LanguageCode } from './lang-codes';
import { FRANC_RUNG, RUNG3_MIN_LENGTH, scopeCandidates } from './classify';
import type { LanguageProfile, Rung3Resolver, RungVerdict } from './classify';

/** Oracle franc floor — lower than rung 3; the divergence margin gate filters weak calls. */
const ORACLE_MIN_LENGTH = 12;

/**
 * Run franc scoped to the candidates' ISO 639-3 codes. Returns null when fewer
 * than two candidates carry an `iso6393` code or franc abstains (`und`). The
 * margin is franc's own score-gap (top1 − top2, 0..1).
 */
// Gated franc call; its branchiness is all necessary guards on a small function.
// fallow-ignore-next-line complexity
function francScore(
  text: string,
  scoped: readonly LanguageProfile[],
  minLength: number,
): { language: LanguageCode; margin: number } | null {
  const byIso = new Map<string, LanguageCode>();
  for (const c of scoped) if (c.iso6393 != null) byIso.set(c.iso6393, c.code);
  if (byIso.size < 2) return null;
  const ranked = francAll(text, { only: [...byIso.keys()], minLength });
  const top = ranked[0];
  if (!top || top[0] === 'und') return null;
  const language = byIso.get(top[0]);
  if (language === undefined) return null;
  return { language, margin: top[1] - (ranked[1]?.[1] ?? 0) };
}

/**
 * Rung 3 — franc backstop (gated, residual-only): only when rungs 1–2 abstain
 * and the text clears the length floor. The conceal predicate gates the hide.
 * Injected into {@link classifyBySnippet} via its `rung3` parameter.
 */
export const francRung3Resolver: Rung3Resolver = (text, scoped) => {
  if (text.length < RUNG3_MIN_LENGTH) return null;
  const r = francScore(text, scoped, RUNG3_MIN_LENGTH);
  return r ? { language: r.language, margin: r.margin, rung: FRANC_RUNG } : null;
};

/**
 * Full rung-3 verdict for one snippet given UNSCOPED candidates — scopes to the
 * dominant script (as classifyBySnippet does internally), then applies the franc
 * backstop. Convenience for hosts that hold the candidate profiles but not the
 * per-text scoping classifyBySnippet does — e.g. the extension's background
 * worker resolving the content filter's residual snippets by message.
 */
export function francResidualVerdict(
  text: string,
  candidates: readonly LanguageProfile[],
): RungVerdict | null {
  return francRung3Resolver(text, scopeCandidates(text, candidates));
}

/**
 * Off-path franc oracle for the shadow comparison (see shadow.ts). Scopes to the
 * text's dominant script like the classifier and opines whenever franc can (a
 * lower floor than rung 3) — the divergence margin gate filters weak calls.
 */
export function francOracle(
  text: string,
  candidates: readonly LanguageProfile[],
): { language: LanguageCode; margin: number } | null {
  return francScore(text, scopeCandidates(text, candidates), ORACLE_MIN_LENGTH);
}
