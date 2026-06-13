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
 *   3   franc          — gated trigram backstop for the distinctive-free residual
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
import type { LanguageCode } from './lang-codes';

export interface LanguageProfile {
  code: LanguageCode;
  /** Lowercased alphabet. Rung 1. Raw — never pre-differenced. */
  alphabet: string;
  /** Orthographic marks that count as rung-1 evidence for this language but are
   *  not alphabet letters — e.g. the intra-word apostrophe uk/be use where ru
   *  uses `ъ`/nothing (`комп'ютер`, `сім'я`). Merged into the rung-1 character
   *  set alongside {@link alphabet}; distinctiveness is still candidate-relative,
   *  so a mark shared by ≥2 candidates cancels out. Optional — omit for
   *  languages with no such marks. Only ever argues that language → keep. */
  marks?: string;
  words: {
    /** Curated grammatical markers (conjunctions, prepositions, pronouns,
     *  particles). Hand-auditable. Rung 2a. */
    function: readonly string[];
    /** Corpus-frequent words (title/subtitle register). Rung 2b. */
    frequent: readonly string[];
  };
  /** ISO 639-3 code for franc's `only` restriction at rung 3. Omit to skip
   *  rung 3 for this profile (e.g. synthetic test profiles). */
  iso6393?: string;
}

export const FRANC_RUNG = 3;

export interface SnippetVerdict {
  /** Winning language, or the string 'unknown' (= do not conceal). `LanguageCode`
   *  is `string`, so the sentinel lives here as documentation, not in the type. */
  language: LanguageCode;
  /** Lead of the winner over the runner-up, in the rung's own unit (distinctive
   *  char/word count for rungs 1–2; franc score-gap for rung 3). 0 when unknown. */
  margin: number;
  /** Which rung decided; null when unknown. */
  rung: 1 | '2a' | '2b' | typeof FRANC_RUNG | null;
}

const UNKNOWN: SnippetVerdict = { language: 'unknown', margin: 0, rung: null };

/** Resolver for rung 3 (the franc trigram backstop), injected into
 *  {@link classifyBySnippet} by callers that have franc available. Kept as an
 *  injected seam — not a direct import — so this module stays franc-free and
 *  importable without pulling franc's tables. The franc-backed implementation
 *  is `francRung3Resolver` in classify-franc.ts. Returns a rung-3 verdict or
 *  null (abstain). */
export type Rung3Resolver = (
  text: string,
  scoped: readonly LanguageProfile[],
) => SnippetVerdict | null;

const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

/** Below this length, trigrams are too noisy to justify a rung-3 verdict. */
export const RUNG3_MIN_LENGTH = 24;

/**
 * Trailing/inline Latin "noise" tokens — URLs, @handles, #hashtags — that a
 * Cyrillic title commonly carries (a Russian headline followed by a link or a
 * social handle). These are almost always Latin even on Cyrillic-language
 * content, so left in they can flip {@link dominantScript} to Latin and let a
 * genuinely-Russian card scope to {en} and escape detection. Stripped before
 * the script vote AND before the rung tallies so the URL's letters never
 * contribute either.
 *
 * Kept as separate simple patterns (applied in order — schemes/www before bare
 * domains) rather than one big alternation, so each stays readable and low
 * complexity. ASCII-only `[a-z0-9-]` in the domain pattern means a Cyrillic word
 * is never mistaken for a domain.
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /\bhttps?:\/\/\S+/gi, // full URLs
  /\bwww\.\S+/gi, // www.… without a scheme
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/gi, // bare domains (example.com/path)
  /[@#][\p{L}\p{N}_]+/gu, // @handles and #hashtags
];

/** Drop URLs / @handles / #hashtags so trailing Latin noise can't outvote the
 *  prose's script or pollute the per-rung tallies. */
export function stripNoise(text: string): string {
  let out = text;
  for (const re of NOISE_PATTERNS) out = out.replace(re, ' ');
  return out;
}

/** The script most of `text` is written in, or null if it carries no letters.
 *  Noise (URLs/handles/hashtags) is stripped first so a single trailing link
 *  can't flip a multi-word Cyrillic title's vote to Latin. */
function dominantScript(text: string): 'cyrillic' | 'latin' | null {
  let cyr = 0;
  let lat = 0;
  for (const ch of stripNoise(text)) {
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

/** Candidates whose script matches the text's dominant script (others can't tip
 *  the verdict). Empty when the text carries no letters. */
export function scopeCandidates(
  text: string,
  candidates: readonly LanguageProfile[],
): LanguageProfile[] {
  const script = dominantScript(text);
  if (script === null) return [];
  // Keep one profile per code. A language listed twice (an imposed overlay that
  // is also user-enabled) would otherwise make its own distinctive chars/words
  // read as "owned by ≥2 candidates" in `tally`, cancelling them out and
  // collapsing the verdict to 'unknown' — silently disabling concealment.
  const seen = new Set<LanguageCode>();
  const scoped: LanguageProfile[] = [];
  for (const c of candidates) {
    if (profileScript(c) !== script || seen.has(c.code)) continue;
    seen.add(c.code);
    scoped.push(c);
  }
  return scoped;
}

/**
 * Per-language set of characters that are globally unique within `profiles` —
 * present in exactly one profile's alphabet. A word containing such a char is
 * always caught at rung 1 (in any candidate set that includes its language), so
 * it is dead weight in the word lists. Relative to the given profile set:
 * recompute when the supported profiles change (the unique set shrinks as
 * languages are added — e.g. adding a second Latin language un-uniques a–z).
 */
export function distinctiveChars(
  profiles: readonly LanguageProfile[],
): Map<LanguageCode, Set<string>> {
  const owners = new Map<string, LanguageCode[]>();
  for (const p of profiles) {
    for (const ch of new Set(p.alphabet)) {
      const list = owners.get(ch);
      if (list) list.push(p.code);
      else owners.set(ch, [p.code]);
    }
  }
  const result = new Map<LanguageCode, Set<string>>(profiles.map((p) => [p.code, new Set()]));
  for (const [ch, codes] of owners) {
    const [only] = codes;
    if (codes.length === 1 && only !== undefined) result.get(only)?.add(ch);
  }
  return result;
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

/** Rung 1 — characters (alphabet + orthographic {@link LanguageProfile.marks})
 *  distinctive within the scoped candidate set. The apostrophe family lives in
 *  `marks`, so `комп'ютер`/`сім'я` count their `'` for uk/be here even though the
 *  word tokenizer drops it. Distinctiveness stays candidate-relative: a mark
 *  shared by ≥2 candidates cancels, so this only ever argues uk/be → keep. */
function letterRung(text: string, scoped: readonly LanguageProfile[]): SnippetVerdict | null {
  const r = leader(
    tally(
      text.toLowerCase(),
      membershipFor(scoped, (p) => p.alphabet + (p.marks ?? '')),
    ),
  );
  return r ? { language: r.code, margin: r.margin, rung: 1 } : null;
}

/** Rung 2 — distinctive words from the given tier (2a function, 2b frequent). */
function wordRung(
  tokens: readonly string[],
  scoped: readonly LanguageProfile[],
  tier: 'function' | 'frequent',
  rung: '2a' | '2b',
): SnippetVerdict | null {
  const r = leader(
    tally(
      tokens,
      membershipFor(scoped, (p) => p.words[tier]),
    ),
  );
  return r ? { language: r.code, margin: r.margin, rung } : null;
}

/**
 * Classify `text` among `candidates` (the user's enabled languages ∪ imposed
 * overlay). Synchronous and allocation-light. Returns 'unknown' on empty
 * evidence, on a tie inside the candidate set, or when nothing is distinctive.
 */
export function classifyBySnippet(
  text: string,
  candidates: readonly LanguageProfile[],
  rung3?: Rung3Resolver,
): SnippetVerdict {
  if (!text || candidates.length === 0) return UNKNOWN;

  // Drop URLs / @handles / #hashtags once, up front: trailing Latin noise must
  // not flip the dominant-script vote (a Russian title + a link still scopes
  // Cyrillic) nor pollute the per-rung tallies. Every rung below reads `cleaned`.
  const cleaned = stripNoise(text);

  // Restrict to candidates in the text's dominant script, so minority-script
  // tokens (a Latin brand name in a Cyrillic title) can't tip the verdict.
  const scoped = scopeCandidates(cleaned, candidates);
  if (scoped.length === 0) return UNKNOWN;

  const byLetter = letterRung(cleaned, scoped);
  if (byLetter) return byLetter;

  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return UNKNOWN;

  return (
    wordRung(tokens, scoped, 'function', '2a') ??
    wordRung(tokens, scoped, 'frequent', '2b') ??
    rung3?.(cleaned, scoped) ??
    UNKNOWN
  );
}
