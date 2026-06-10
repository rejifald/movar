/**
 * Corpus-driven test: runs `detectCyrillicLanguage` over the language-detection
 * fixtures and asserts `expectedCyrillicHeuristic`.
 *
 * The companion `expectedEngineLanguage` field on each fixture is consumed
 * separately by tier-7 engine corpus tests (chrome-ai / franc) once
 * those engines exist — see docs/on-device-language-detection.md.
 *
 * Adding a fixture here exercises BOTH the heuristic (immediately, via this
 * file) and the future engines (when their test files land), with no
 * additional plumbing.
 */

import { describe, expect, it } from 'vitest';
import { detectCyrillicLanguage } from '../src/index';
import { FIXTURES, type LanguageFixture } from './fixtures';

describe('detectCyrillicLanguage — corpus', () => {
  it.each(FIXTURES)('$id — expects expectedCyrillicHeuristic', (fixture: LanguageFixture) => {
    const result = detectCyrillicLanguage(fixture.text);
    // eslint-disable-next-line vitest/valid-expect -- vitest's expect() takes a custom failure message as its 2nd arg (verified at runtime); the rule's maxArgs:1 default is a Jest-ism
    expect(result.language, formatFailureMessage(fixture, result.language)).toBe(
      fixture.expectedCyrillicHeuristic,
    );
  });
});

function formatFailureMessage(fixture: LanguageFixture, actual: string): string {
  // The default it.each name only shows the fixture id; on failure we want
  // the description and a text preview so reviewers can decide whether the
  // fixture is wrong or the detector is.
  const preview = fixture.text.length > 80 ? `${fixture.text.slice(0, 77)}…` : fixture.text;
  return [
    `Fixture ${fixture.id}: expected '${fixture.expectedCyrillicHeuristic}', got '${actual}'.`,
    `  Description: ${fixture.description}`,
    `  Scenarios: ${fixture.scenarios.join(', ')}`,
    `  Text preview: ${JSON.stringify(preview)}`,
  ].join('\n');
}
