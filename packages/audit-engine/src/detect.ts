/**
 * The detector, as data.
 *
 * The host app's Detector tab asks one question — "of these candidates, which
 * does this text look most like" — and this answers it without deciding what the
 * answer should look like. Native renders; the engine adjudicates.
 *
 * WHY THE SHAPE IS THIS WIDE. A closed-set verdict is not interpretable on its
 * own. "Ukrainian" means something different when three languages were compared
 * than when one was, and it means something different again when the evidence
 * that decided it was a letter only Ukrainian has versus a word list. So the
 * result carries its own scope: which candidates were asked for, which were
 * actually in play, whether the comparison could discriminate at all, and what
 * each candidate had going for it — including the candidates that lost, and
 * including the signals that counted for nobody.
 *
 * The one thing this module never does is re-implement the ladder.
 * `classifyBySnippet` produces the verdict, exactly as it does inside
 * `evaluate()` and inside the extension's content filter, so the app cannot
 * drift from what Movar will actually do on a page. What is computed here is
 * only the *account* of that verdict.
 */
import {
  classifyBySnippet,
  discriminatingWords,
  distinctiveLetters,
  FRANC_RUNG,
  getProfiles,
  PROFILED_CODES,
  scopeCandidates,
} from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import type { LanguageCode, LanguageProfile, SignalOwnership } from '@movar/lang-detect';

/**
 * Transport bound on the signal lists below — NOT a display choice.
 *
 * The engine is presentation-free, so how many chips a row shows is native's
 * call. This exists only so a novel-sized paste cannot put an unbounded array
 * across the JSON bridge, and is set far above any sane display cap so the
 * shell's own limit is always the binding one.
 */
const MAX_SIGNALS_PER_ROW = 50;

/** Which rung decided, as a string the shells key their copy off. */
export type DetectRung = '1' | '2a' | '2b' | '3';

/** What one candidate had going for it, in this comparison, on this text. */
export interface CandidateEvidence {
  readonly code: string;
  /**
   * Whether this candidate was actually compared.
   *
   * `classifyBySnippet` scopes to the text's dominant script before scoring, so
   * English never competes for Cyrillic text and vice versa. An out-of-scope
   * candidate is reported rather than dropped, because "English was on your
   * list and sat this one out" is the answer to a question a reader will
   * otherwise ask of a screen that silently shows two rows where three were
   * configured.
   */
  readonly inScope: boolean;
  /** Rung 1 — letters ONLY this candidate has, among those in scope. */
  readonly letters: readonly string[];
  /** Rung 2a — function words only this candidate has. */
  readonly functionWords: readonly string[];
  /** Rung 2b — frequent words only this candidate has. */
  readonly frequentWords: readonly string[];
  /** Rung 3 — franc's letter-patterns name this candidate the closest match. */
  readonly francClosest: boolean;
}

/** A finished detection, scope included. */
export interface DetectResult {
  /** The winning code, or `null` when nothing could be picked. */
  readonly language: string | null;
  /** The rung that decided, or `null` when nothing did. */
  readonly rung: DetectRung | null;
  /** Lead over the runner-up, in the deciding rung's own unit. */
  readonly margin: number;
  /**
   * Whether two or more same-script candidates were in play.
   *
   * `false` is the honest admission that the answer was forced: with one
   * candidate in scope, every text in that script "matches" it, because there
   * was nothing for it to lose to. A shell that renders this the same as a real
   * verdict is telling the reader something untrue.
   */
  readonly discriminating: boolean;
  /** The roster as asked for, in the order asked. */
  readonly candidates: readonly string[];
  /** Those that survived script scoping — the set the verdict is relative to. */
  readonly scoped: readonly string[];
  /** Per candidate, in `candidates` order. Presentation-free; native sorts. */
  readonly evidence: readonly CandidateEvidence[];
  /**
   * Signals present in the text that two or more in-scope candidates share.
   *
   * These scored for nobody, and showing them is the difference between a
   * report and an explanation: a reader who sees `і` in their Ukrainian text
   * and no `і` in the Ukrainian evidence row has been told the tool is broken
   * unless this row exists to say Belarusian has it too.
   */
  readonly sharedLetters: readonly string[];
  readonly sharedWords: readonly string[];
}

/**
 * Every code a roster may contain, sorted so three shells draw one order.
 *
 * `PROFILED_CODES` is a `Set`, and iteration order there is insertion order —
 * an implementation detail of a module that has no idea anyone is rendering it.
 * Sorting makes the wire answer stable without making the shells sort.
 */
export function catalogue(): readonly string[] {
  return [...PROFILED_CODES].toSorted((left, right) => left.localeCompare(right));
}

/** langtell's own tokenizer, so the words listed are the words tallied. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

/** Distinct members of `owned` present in `items`, in first-seen order. */
function found(items: Iterable<string>, owned: ReadonlySet<string> | undefined): string[] {
  if (owned === undefined || owned.size === 0) return [];
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!owned.has(item) || seen.has(item)) continue;
    seen.add(item);
    hits.push(item);
    if (hits.length >= MAX_SIGNALS_PER_ROW) break;
  }
  return hits;
}

/** The shared half of an ownership split, restricted to what the text contains. */
function sharedFound(items: Iterable<string>, ownership: SignalOwnership): string[] {
  return found(items, ownership.shared);
}

/**
 * Which rung `classifyBySnippet` reported, as a wire string.
 *
 * `SnippetVerdict.rung` is `1 | '2a' | '2b' | 3 | null` — a union of numbers and
 * strings that no Swift/Kotlin decoder should have to model. Normalised once,
 * here, rather than three times across three shells.
 *
 * Handles the `null` case itself rather than being guarded by the caller:
 * langtell's `UNKNOWN` verdict carries `rung: null`, which stringifies to
 * `'null'` and falls through to `null` here. Testing the language for
 * `'unknown'` a second time at the call site was a redundant condition that
 * said the same thing in a second place.
 */
function rungKey(rung: unknown): DetectRung | null {
  const key = String(rung);
  return key === '1' || key === '2a' || key === '2b' || key === '3' ? key : null;
}

/**
 * Run the detector over `text` against `candidates`.
 *
 * `candidates` arrives as bare codes off a native bridge and is resolved through
 * `getProfiles`, which drops anything Movar ships no profile for — so an
 * unknown code weakens the comparison rather than crashing it. The result still
 * lists every code that was asked for, because a roster entry that resolved to
 * nothing is exactly the sort of silent no-op a reader deserves to see.
 *
 * Rung 3 is franc-backed here, matching what the detector has always offered.
 * The audit kernel deliberately does NOT inject a rung-3 resolver; that stays
 * true — this is a second, separate caller.
 */
export function detect(text: string, candidates: readonly string[]): DetectResult {
  const profiles = getProfiles([...candidates] as LanguageCode[]);
  const verdict = classifyBySnippet(text, profiles, francRung3Resolver);

  // Scoped exactly as the classifier scopes internally, so the ownership split
  // below describes the comparison that actually happened rather than the
  // roster that was requested. (Scoping on the raw text rather than langtell's
  // noise-stripped copy, which it does not export — the same approximation
  // `francResidualVerdict` makes. It can only differ for text whose dominant
  // script is decided by URLs or handles, and it never affects the verdict,
  // which comes from `classifyBySnippet` itself.)
  const scoped = scopeCandidates(text, profiles);
  const scopedCodes = new Set(scoped.map((profile: LanguageProfile) => profile.code));

  const letters = distinctiveLetters(scoped);
  const functionWords = discriminatingWords(scoped, 'function');
  const frequentWords = discriminatingWords(scoped, 'frequent');

  const lowered = text.toLowerCase();
  const tokens = tokenize(text);

  const evidence: CandidateEvidence[] = candidates.map((code) => ({
    code,
    inScope: scopedCodes.has(code),
    letters: found(lowered, letters.exclusive.get(code)),
    functionWords: found(tokens, functionWords.exclusive.get(code)),
    frequentWords: found(tokens, frequentWords.exclusive.get(code)),
    francClosest: verdict.rung === FRANC_RUNG && verdict.language === code,
  }));

  return {
    language: verdict.language === 'unknown' ? null : verdict.language,
    rung: rungKey(verdict.rung),
    margin: verdict.margin,
    discriminating: verdict.discriminating,
    candidates: [...candidates],
    scoped: scoped.map((profile: LanguageProfile) => profile.code),
    evidence,
    sharedLetters: sharedFound(lowered, letters),
    // Both word tiers share one row: the distinction that matters to a reader is
    // "this word pointed nowhere", not which list it failed to be exclusive in.
    sharedWords: [
      ...new Set([...sharedFound(tokens, functionWords), ...sharedFound(tokens, frequentWords)]),
    ].slice(0, MAX_SIGNALS_PER_ROW),
  };
}
