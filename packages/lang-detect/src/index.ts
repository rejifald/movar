/**
 * Cyrillic-language detection — single-sourced from `langtell/cyrillic`.
 *
 * The letter-signal heuristic (`detectCyrillicLanguage`/`isRussian`, plus the
 * `isUkrainian` convenience) was ported byte-for-byte into langtell's roster-free
 * `langtell/cyrillic` fast-path; re-export it here under the existing names
 * rather than carry a second copy. `DetectionResult` is langtell's
 * `CyrillicVerdict` (the identical `{ language, ukScore, ruScore }` shape).
 * `index.test.ts` and the `test/fixtures.test.ts` corpus keep the full
 * characterization, so any drift in langtell's port fails loudly here.
 */
export { detectCyrillicLanguage, isRussian, isUkrainian } from 'langtell/cyrillic';
export type { CyrillicLanguage, CyrillicVerdict as DetectionResult } from 'langtell/cyrillic';

export type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from './engine';
// Franc-free barrel: the dispatcher + the franc-free per-snippet classifier and
// its types. The batteries-included roster (`detectLanguageFromText`/`ENGINES`)
// and the franc oracle/rung-3 resolver live behind `@movar/lang-detect/franc`,
// so importing this entry never pulls franc's trigram tables.
export { detectLanguageFromTextWith } from './orchestrator';
export { chromeAiEngine, createChromeAiEngine } from './engines/chrome-ai';
export { classifyBySnippet } from './classify';
// `scopeCandidates` is the script narrowing the classifier applies before it
// scores. Surfaced because anything explaining a verdict has to describe the set
// that was actually compared, not the one that was requested.
export { scopeCandidates } from './classify';
// The rung number franc answers on. Exported so a consumer testing "did rung 3
// decide this" names the rung instead of writing `=== 3`.
export { FRANC_RUNG } from './classify';
export type { LanguageProfile, Rung3Resolver, SnippetVerdict } from './classify';
// Which signals discriminate GIVEN a candidate set — the derivation a closed-set
// verdict has to be read next to. Data-free itself (it takes the profiles it is
// asked about), so this adds nothing to a bundle that already has them.
export { discriminatingWords, distinctiveLetters } from './distinctive';
export type { SignalOwnership } from './distinctive';
// Per-node declared-language fusion (worker-side builder + wire types). The
// builder pulls langtell's `compile`; the content bundle references only the
// types + `isFusedVerdict` guard, which are import-light and tree-shake clean.
export { buildDeclaredClassifier, DECLARED_ATTR, isFusedVerdict } from './declared';
export type { FusedVerdict, SnippetItem } from './declared';
export { PROFILES, getProfiles } from './profiles';
export { hasProfile, PROFILED_CODES } from './profile-codes';
export { classifyDivergence } from './shadow';
export type { DivergenceKind, OracleVerdict } from './shadow';
export { normalizeBCP47, normalizeLanguageCode } from './lang-codes';
export type { LanguageCode } from './lang-codes';
