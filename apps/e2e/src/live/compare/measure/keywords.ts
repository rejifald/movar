/**
 * Keyword presence scanner — the primary signal for the compare suite.
 *
 * Per scenario we curate two word-lists:
 *   - `russianLeakKeywords` — surface forms that ONLY appear in Russian.
 *     For "реле напруги" the leak word is "напряжения" (and case variants);
 *     the equivalent Ukrainian "напруги" doesn't share these letter
 *     sequences. So a snippet containing "напряжения" is, with very high
 *     confidence, Russian content that leaked through.
 *   - `ukrainianMarkers`   — surface forms that mark Ukrainian content for
 *     the same query. Used to assert the treatment leg returned Ukrainian
 *     results, not just "not Russian" (which would also pass if Google
 *     served English).
 *
 * Why surface forms, not lemma matching: we control the queries, we know
 * which case forms appear in result snippets (Russian nominative,
 * genitive, dative cover ≈ all snippets for product/news queries), and a
 * regex over Unicode-normalised lowercase text is deterministic across
 * runners. No NLP, no stemmer, no surprises.
 *
 * Why scan the concatenated results region text, not per-snippet: a single
 * Russian leak anywhere in the top results is what we want to detect. If
 * the selector for individual result rows drifts under us (Google ships
 * a redesign), the concatenated-text scan still works — we lose the
 * per-row histogram (in `lang-histogram.ts`), not the assertion.
 */

/** A single keyword-list scan result. `matched` is the de-duplicated set
 *  of forms actually found, useful in failure messages so a triage
 *  reader sees which form leaked without re-reading the snippet text. */
export interface KeywordScan {
  /** Total occurrences across all words (caps at `text.length`, no
   *  pathological growth from regex backtracking — patterns are literal
   *  alternations). */
  hits: number;
  /** Subset of the input list that fired at least once. Empty when
   *  nothing matched. */
  matched: string[];
}

/** Unicode NFC + lowercase, the canonical pre-scan transform. NFC folds
 *  decomposed combining marks (rare in Cyrillic but free insurance);
 *  lowercase matches case-insensitively without per-word RegExp `i`
 *  flags. */
function normalise(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/** Escape regex metacharacters in a literal keyword. Our curated word
 *  lists are plain letters today, but a future entry like "1-фазне"
 *  contains `-` which is metacharacter-inside-a-character-class only;
 *  belt-and-braces escape keeps the call site safe. */
function escapeForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Count occurrences of any keyword in `keywords` inside `text`. Matching
 * is case-insensitive, NFC-normalised, and word-boundary anchored via
 * `\b` with the Unicode flag (`u`). The word boundary prevents false
 * positives where a Ukrainian form is a prefix of a Russian form (e.g.
 * Ukrainian `продаж` matching inside Russian `продажа`).
 *
 * Note: `\b` with `u` flag treats Unicode letters as word characters,
 * so Cyrillic word edges are detected correctly.
 *
 * Returns total hits + the subset of keywords that fired.
 *
 * The single combined regex is built once per call; for our scale
 * (≤ 10 keywords, ≤ 50KB text) this is microseconds.
 */
export function scanKeywords(text: string, keywords: readonly string[]): KeywordScan {
  if (keywords.length === 0 || !text) {
    return { hits: 0, matched: [] };
  }
  const normalisedText = normalise(text);

  // One pass for total hits — catches multiple distinct forms appearing
  // in the same snippet (Russian product listings often show both
  // "напряжение" and "напряжения" within one row).
  const combined = new RegExp(
    `\\b(?:${keywords.map((k) => escapeForRegex(normalise(k))).join('|')})\\b`,
    'gu',
  );
  const allMatches = normalisedText.match(combined) ?? [];

  // Separate pass to determine which individual keywords fired. Uses the
  // same word-boundary anchoring so `продаж` won't fire on `продажа`.
  const matched = keywords.filter((kw) => {
    const kwNorm = escapeForRegex(normalise(kw));
    return new RegExp(`\\b${kwNorm}\\b`, 'u').test(normalisedText);
  });

  return { hits: allMatches.length, matched };
}
