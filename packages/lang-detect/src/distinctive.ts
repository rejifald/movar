/**
 * Which signals actually discriminate — **given a candidate set**.
 *
 * `classifyBySnippet` is a closed-set (forced-choice) classifier: it does not
 * ask "what language is this", it asks "of these candidates, which does this
 * text look most like". Its scoring rule is what makes that concrete —
 * langtell's `tally` credits a character or word to a candidate **only when
 * exactly one candidate owns it**. A signal two candidates share is evidence for
 * neither, and is dropped.
 *
 * That rule means distinctiveness is not a property of a language. It is a
 * property of a language *within a set*, and it moves when the set moves. Among
 * {uk, ru}, `і` is decisive Ukrainian evidence. Add `be` — whose alphabet also
 * has `і` — and the same character becomes worth exactly nothing, to anyone.
 *
 * This module derives that ownership from the profiles, so a UI can show what
 * the classifier actually counted instead of asserting its own list. That
 * distinction is not academic: the host app's detector shipped a hand-written
 *
 * ```ts
 * const SIGNAL_SETS = { uk: /[іїєґ]/gi, ru: /[ыё]/gi, be: /ў/gi };
 * ```
 *
 * whose uk and ru entries are BOTH wrong for the very candidate set it used
 * them with. Belarusian has `і`, so `і` is not Ukrainian evidence among
 * {uk, ru, be}; Belarusian also has `ы` AND `ё`, so Russian's entire claimed
 * signal set is shared and the only character Russian solely owns there is `ъ`.
 * The verdicts were right the whole time — langtell computed ownership properly
 * — but the evidence shown under them described a two-candidate world that had
 * not existed since Belarusian was added. Hardcoding a derived set is how a UI
 * ends up confidently explaining a decision that was never made that way.
 *
 * `docs/native-shells.md` ("Detector — the closed set has to become visible and
 * configurable") calls for exactly this: derive the signals, and let the
 * candidate set be an input.
 */
import type { LanguageProfile } from './classify';

/**
 * How a set of signals divides among candidates.
 *
 * `shared` is not a leftover bucket — it is the load-bearing half. A closed-set
 * verdict is only interpretable next to the evidence the classifier had to throw
 * away, because "Movar found `і` and said Ukrainian" and "Movar found `і`,
 * counted it for nobody, and said Ukrainian on other grounds" are different
 * claims about the same text.
 */
export interface SignalOwnership {
  /**
   * Candidate code → the signals that candidate **solely** owns here. Every
   * candidate gets an entry, including an empty one: a candidate with nothing
   * exclusive is a real and interesting state (it cannot win at this rung), not
   * an absence to be filtered out of a report.
   */
  readonly exclusive: ReadonlyMap<string, ReadonlySet<string>>;
  /** Signals two or more candidates own. Scored for none of them. */
  readonly shared: ReadonlySet<string>;
}

/**
 * Split `signals` by sole ownership, mirroring langtell's `tally`.
 *
 * Deliberately generic over "what a signal is" so letters and words derive
 * through one implementation: the ownership rule is identical at every rung, and
 * two copies of it would be two chances to diverge from the classifier.
 */
function divideByOwner(
  candidates: readonly LanguageProfile[],
  signalsOf: (profile: LanguageProfile) => Iterable<string>,
): SignalOwnership {
  // Signal → the codes holding it. Built first because ownership is a question
  // about the whole set, not about any one candidate.
  const owners = new Map<string, Set<string>>();
  for (const profile of candidates) {
    for (const signal of signalsOf(profile)) {
      const held = owners.get(signal);
      if (held === undefined) owners.set(signal, new Set([profile.code]));
      else held.add(profile.code);
    }
  }

  // Seeded with every candidate so the empty case is a present, empty set.
  const exclusive = new Map<string, Set<string>>(
    candidates.map((profile) => [profile.code, new Set<string>()]),
  );
  const shared = new Set<string>();

  for (const [signal, held] of owners) {
    // A duplicate code in `candidates` would collapse to one entry in `held`,
    // which is the right answer: langtell's `scopeCandidates` de-duplicates by
    // code before scoring, so a repeated profile never makes a signal "shared"
    // with itself.
    if (held.size > 1) {
      shared.add(signal);
      continue;
    }
    for (const code of held) exclusive.get(code)?.add(signal);
  }

  return { exclusive, shared };
}

/**
 * Rung 1 — the characters each candidate solely owns.
 *
 * Membership is `alphabet + marks`, exactly the string langtell tallies over, so
 * Ukrainian's and Belarusian's apostrophes (`'’ʼ`) participate here as they do
 * in the real verdict. They are shared between those two and therefore always
 * land in `shared` when both are candidates — which is the derivation being
 * right, not a wrinkle to special-case.
 */
export function distinctiveLetters(candidates: readonly LanguageProfile[]): SignalOwnership {
  return divideByOwner(candidates, (profile) => profile.alphabet + (profile.marks ?? ''));
}

/**
 * Rung 2a / 2b — the words each candidate solely owns.
 *
 * `function` words are the closed-class ones (prepositions, conjunctions,
 * particles); `frequent` is the open-class frequency list. langtell tries them
 * in that order and this takes the tier as a parameter for the same reason: they
 * are two rungs, and a report that merged them would attribute a verdict to the
 * wrong one.
 */
export function discriminatingWords(
  candidates: readonly LanguageProfile[],
  tier: 'function' | 'frequent',
): SignalOwnership {
  return divideByOwner(candidates, (profile) => profile.words?.[tier] ?? []);
}
