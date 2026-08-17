/**
 * The classifier seam.
 *
 * The classifier runs **inside** `evaluate()`. Text nodes live in `Evidence`,
 * classification is deterministic and I/O-free, so `@movar/lang-detect` is a
 * legitimate kernel dependency — and stored evidence therefore re-adjudicates
 * against an improved classifier years later, which a collector that
 * pre-classified could never offer.
 *
 * The default is the **franc-free** snippet classifier: importing this package
 * never pulls franc's ~170 KB trigram tables. A runtime that wants the rung-3
 * backstop injects `francRung3Resolver` from `@movar/lang-detect/franc` when it
 * builds its ruleset.
 *
 * Nothing here grants failing power. A finding whose language determination
 * came from this seam is `classified` (or hybrid `via: 'classified'`), and
 * `grading.ts` strips its ability to fail regardless of how confident the
 * verdict is.
 */

import { classifyBySnippet, getProfiles } from '@movar/lang-detect';
import type { LanguageCode, Rung3Resolver, SnippetVerdict } from '@movar/lang-detect';

/** A classifier verdict, narrowed to a language the caller asked about. */
export interface ClassifiedText {
  readonly language: LanguageCode;
  /** Lead over the runner-up, in the deciding rung's own unit. */
  readonly margin: number;
  readonly rung: SnippetVerdict['rung'];
  /** `true` when ≥2 same-script candidates were actually in scope. */
  readonly discriminating: boolean;
}

/**
 * Classify one text sample among an explicit candidate set. Returns `null` on
 * `'unknown'` — a tie, an empty snippet, or nothing distinctive. Callers must
 * treat `null` as "no evidence", never as "the other language".
 */
export type Classifier = (
  text: string,
  candidates: readonly LanguageCode[],
) => ClassifiedText | null;

/**
 * Build the default classifier over `@movar/lang-detect`'s snippet ladder.
 *
 * @param rung3 optional trigram backstop (`francRung3Resolver`). Omitted by
 *   default so the kernel stays franc-free.
 */
export function createSnippetClassifier(rung3?: Rung3Resolver): Classifier {
  return (text, candidates) => {
    const profiles = getProfiles([...candidates]);
    if (profiles.length === 0) return null;
    const verdict = classifyBySnippet(text, profiles, rung3);
    // `SnippetVerdict.language` is a bare string with an `'unknown'` sentinel.
    // Matching it back against the caller's own candidate list narrows it to a
    // `LanguageCode` without a cast, and drops `'unknown'` on the way.
    const language = candidates.find((candidate) => candidate === verdict.language);
    if (language === undefined) return null;
    return {
      language,
      margin: verdict.margin,
      rung: verdict.rung,
      discriminating: verdict.discriminating,
    };
  };
}
