/**
 * Declared-language fusion for per-node classification — the adapter over
 * langtell's per-node pipeline (`compile` + `DetectInput.attrs`).
 *
 * A node can carry the page's own label for its language (a `DeclaredLangNode`
 * in @movar/page-content — e.g. Google's `data-rl` on an AI Overview).
 * Classification fuses that declaration with the node's own text: the
 * declaration decides when text evidence is weak or absent (a block whose
 * answer hasn't streamed in yet), and loses to a confident text read via
 * langtell's context-never-overrides-clear-script guard — a mislabeled node
 * can't override what the classifier actually read.
 *
 * The wire and model layers stay vendor-neutral. The extractor already reduced
 * whatever attribute carried the label to a normalized code, so the fusion
 * keys the declaration under the synthetic {@link DECLARED_ATTR} name rather
 * than any vendor attribute name — nothing outside the extractor re-couples to
 * a vendor convention.
 *
 * Franc-free: `compile`'s built-in text source runs the distinctive
 * letter/word rungs (1–2), which are what an override needs — real generated
 * prose carries distinctive letters, so a mislabeled Ukrainian answer trips the
 * `і`/`ї`/`є` rungs and pins Ukrainian without franc's trigram tables. This
 * keeps the adapter out of the franc-heavy import path, so it stays safe for
 * the content bundle to reference its types.
 */
import { compile } from 'langtell';
import type { LanguageProfile, SnippetVerdict } from './classify';
import type { LanguageCode } from './lang-codes';

/** The synthetic attribute name declarations ride under in the fusion. The
 *  model layer already normalized the vendor attribute away; this key exists so
 *  fuse weights and audit trails read `node-lang:declared`, not a vendor name. */
export const DECLARED_ATTR = 'declared';

/** One content-filter card on the classify wire: its serialized text, plus the
 *  page-declared language when the model carries one. `text` may be empty for a
 *  declared card whose content hasn't streamed in yet — the declaration alone
 *  still classifies it. */
export interface SnippetItem {
  text: string;
  declared?: LanguageCode;
}

/** Verdict for a declared card: langtell's fused classification reduced to what
 *  the conceal gate needs. The `fused` brand distinguishes it from the
 *  rung-margin `SnippetVerdict`s of the text-only path — the two carry
 *  incomparable confidence semantics (a 0..1 fused score vs a per-rung lead),
 *  so the gate must dispatch on which it holds. */
export interface FusedVerdict {
  /** Winning language code, or the sentinel `'unknown'`. */
  language: LanguageCode;
  /** Fused 0..1 confidence — NOT a rung margin. */
  confidence: number;
  fused: true;
}

/** True when a classify-wire verdict came from the declared-language fusion
 *  rather than the text-only rung classifier. */
export function isFusedVerdict(verdict: SnippetVerdict | FusedVerdict): verdict is FusedVerdict {
  return 'fused' in verdict && verdict.fused;
}

/**
 * Build the fused classifier for one candidate roster: a langtell detector
 * compiled once, reading the declaration from {@link DECLARED_ATTR} and the
 * text evidence roster-relative. Call it per declared card with the card's
 * text (possibly empty) and its normalized declared code.
 *
 * Worker-only in practice (it pulls langtell's `compile`); the content bundle
 * references only {@link SnippetItem}/{@link FusedVerdict}/{@link isFusedVerdict}
 * from this module, which carry no such import.
 */
export function buildDeclaredClassifier(
  candidates: readonly LanguageProfile[],
): (text: string, declared: LanguageCode) => FusedVerdict {
  const detect = compile({ candidates, nodeLangAttributes: [DECLARED_ATTR] });
  return (text, declared) => {
    const verdict = detect({ text, attrs: { [DECLARED_ATTR]: declared } });
    return { language: verdict.language, confidence: verdict.confidence, fused: true };
  };
}
