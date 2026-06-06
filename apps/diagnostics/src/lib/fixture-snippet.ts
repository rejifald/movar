/**
 * Render a classified content card as a `LanguageFixture`-shaped TS snippet for
 * pasting into `packages/lang-detect/test/fixtures.ts`. Most useful on cards
 * where the franc cross-check disagreed with the classifier (a calibration
 * miss). The maintainer reviews/trims before committing — this only removes the
 * transcription toil.
 */
import type { DiagCard } from '../types';

/** Best-effort "truth": the franc cross-check if it opined, else the
 *  classifier's call. The maintainer verifies before committing. */
function expectedLanguage(card: DiagCard): string {
  if (card.francLanguage != null) return card.francLanguage;
  return card.language === 'unknown' ? 'uk' : card.language;
}

export function buildFixtureSnippet(card: DiagCard): string {
  const expected = expectedLanguage(card);
  const franc = card.francLanguage == null ? '' : `; franc said ${card.francLanguage}`;
  return [
    '{',
    `  id: 'card-${card.kind}-${expected}',`,
    `  description: 'Classifier said ${card.language} (rung ${String(card.rung)})${franc}. ${card.kind} card. VERIFY.',`,
    `  scenarios: ['${card.kind}', 'classifier-${card.language}'],`,
    `  text: ${JSON.stringify(card.sample)},`,
    `  expectedEngineLanguage: '${expected}',`,
    `  expectedCyrillicHeuristic: '${expected}',`,
    '},',
  ].join('\n');
}
