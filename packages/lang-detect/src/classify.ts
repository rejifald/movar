/**
 * Per-snippet language classification by candidate-set-relative set-difference.
 *
 * Design: docs/per-snippet-language-detection.md. A ladder of rungs; the first
 * rung whose leader clears a lead (margin) of ≥1 wins; otherwise 'unknown'
 * (which always means "do not conceal"):
 *
 *   1   alphabet       — characters distinctive within the candidate set
 *   2a  function words — curated grammatical markers (highest precision)
 *   2b  frequent words — corpus content words
 *   3   franc          — Phase 3 backstop; not implemented here
 *
 * "Distinctive" is ALWAYS relative to the candidate set: a signal counts for a
 * candidate iff it appears in that candidate's profile and in NO other
 * candidate's. So `і` decides {uk, ru} (only uk has it) but is inert in
 * {uk, be} (both have it), and `и` (as a standalone word) decides {uk, ru} even
 * though the *letter* `и` is shared. Nothing is precomputed — uniqueness is the
 * runtime output, never stored.
 *
 * The classifier is symmetric: it returns the leading candidate whenever the
 * lead is ≥1 at a rung. The block-only asymmetry (a *hide* needs a per-rung
 * minimum margin; a *keep* is free) lives in the conceal predicate, not here.
 */
import type { LanguageCode } from './engine';

export interface LanguageProfile {
  code: LanguageCode;
  /** Lowercased alphabet. Rung 1. Raw — never pre-differenced. */
  alphabet: string;
  words: {
    /** Curated grammatical markers (conjunctions, prepositions, pronouns,
     *  particles). Hand-auditable. Rung 2a. */
    function: readonly string[];
    /** Corpus-frequent words (title/subtitle register). Rung 2b. */
    frequent: readonly string[];
  };
}

export interface SnippetVerdict {
  /** Winning language, or 'unknown' (= do not conceal). */
  language: LanguageCode | 'unknown';
  /** Lead of the winner over the runner-up, in the rung's own unit (distinctive
   *  char/word count for rungs 1–2; franc score-gap for rung 3). 0 when unknown. */
  margin: number;
  /** Which rung decided; null when unknown. */
  rung: 1 | '2a' | '2b' | 3 | null;
}

const UNKNOWN: SnippetVerdict = { language: 'unknown', margin: 0, rung: null };

const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

/** The script most of `text` is written in, or null if it carries no letters. */
function dominantScript(text: string): 'cyrillic' | 'latin' | null {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (CYRILLIC_RE.test(ch)) cyr += 1;
    else if (LATIN_RE.test(ch)) lat += 1;
  }
  if (cyr === 0 && lat === 0) return null;
  return cyr >= lat ? 'cyrillic' : 'latin';
}

/** The script of a profile's alphabet. */
function profileScript(profile: LanguageProfile): 'cyrillic' | 'latin' | null {
  for (const ch of profile.alphabet) {
    if (CYRILLIC_RE.test(ch)) return 'cyrillic';
    if (LATIN_RE.test(ch)) return 'latin';
  }
  return null;
}

interface Membership {
  code: LanguageCode;
  set: ReadonlySet<string>;
}

/** Lowercased Unicode letter-run tokens. Keeps single-char tokens (`і`, `и`). */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

/**
 * Tally how many items (characters or word tokens) are distinctive to each
 * candidate — i.e. present in exactly one candidate's set. Items owned by zero
 * or by ≥2 candidates contribute nothing.
 */
function tally(
  items: Iterable<string>,
  membership: readonly Membership[],
): Map<LanguageCode, number> {
  const scores = new Map<LanguageCode, number>(membership.map((m) => [m.code, 0]));
  for (const item of items) {
    let owner: LanguageCode | null = null;
    let owners = 0;
    for (const m of membership) {
      if (m.set.has(item)) {
        owners += 1;
        if (owners > 1) {
          owner = null;
          break;
        }
        owner = m.code;
      }
    }
    if (owner !== null) scores.set(owner, (scores.get(owner) ?? 0) + 1);
  }
  return scores;
}

/** The leading candidate and its lead over the runner-up, or null if the lead is <1. */
function leader(scores: Map<LanguageCode, number>): { code: LanguageCode; margin: number } | null {
  let max = -1;
  let second = -1;
  let code: LanguageCode | null = null;
  for (const [c, score] of scores) {
    if (score > max) {
      second = max;
      max = score;
      code = c;
    } else if (score > second) {
      second = score;
    }
  }
  if (code === null || max < 1) return null;
  const margin = max - Math.max(second, 0);
  return margin >= 1 ? { code, margin } : null;
}

function membershipFor(
  candidates: readonly LanguageProfile[],
  pick: (p: LanguageProfile) => Iterable<string>,
): Membership[] {
  return candidates.map((c) => ({ code: c.code, set: new Set(pick(c)) }));
}

/**
 * Classify `text` among `candidates` (the user's enabled languages ∪ imposed
 * overlay). Synchronous and allocation-light. Returns 'unknown' on empty
 * evidence, on a tie inside the candidate set, or when nothing is distinctive.
 */
export function classifyBySnippet(
  text: string,
  candidates: readonly LanguageProfile[],
): SnippetVerdict {
  if (candidates.length === 0 || !text) return UNKNOWN;

  // Restrict to candidates in the text's dominant script, so minority-script
  // tokens (a Latin brand name in a Cyrillic title, a Cyrillic name in an
  // English sentence) can't tip the verdict.
  const script = dominantScript(text);
  const scoped = script === null ? [] : candidates.filter((c) => profileScript(c) === script);
  if (scoped.length === 0) return UNKNOWN;

  // Rung 1 — alphabet (characters).
  const r1 = leader(
    tally(
      text.toLowerCase(),
      membershipFor(scoped, (p) => p.alphabet),
    ),
  );
  if (r1) return { language: r1.code, margin: r1.margin, rung: 1 };

  const tokens = tokenize(text);
  if (tokens.length === 0) return UNKNOWN;

  // Rung 2a — function words.
  const r2a = leader(
    tally(
      tokens,
      membershipFor(scoped, (p) => p.words.function),
    ),
  );
  if (r2a) return { language: r2a.code, margin: r2a.margin, rung: '2a' };

  // Rung 2b — frequent words.
  const r2b = leader(
    tally(
      tokens,
      membershipFor(scoped, (p) => p.words.frequent),
    ),
  );
  if (r2b) return { language: r2b.code, margin: r2b.margin, rung: '2b' };

  // Rung 3 — franc: Phase 3 (gated, residual-only). Not implemented yet.
  return UNKNOWN;
}
