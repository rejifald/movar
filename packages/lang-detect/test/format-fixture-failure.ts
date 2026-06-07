import type { LanguageFixture } from './fixtures';

const PREVIEW_MAX_CHARS = 80;
const PREVIEW_HEAD_CHARS = 77;

export function formatFailureMessage(fixture: LanguageFixture, actual: string | null): string {
  const preview =
    fixture.text.length > PREVIEW_MAX_CHARS
      ? `${fixture.text.slice(0, PREVIEW_HEAD_CHARS)}…`
      : fixture.text;
  return [
    `Fixture ${fixture.id}: expected '${fixture.expectedEngineLanguage}', got '${actual}'.`,
    `  Description: ${fixture.description}`,
    `  Scenarios: ${fixture.scenarios.join(', ')}`,
    `  Text preview: ${JSON.stringify(preview)}`,
  ].join('\n');
}
