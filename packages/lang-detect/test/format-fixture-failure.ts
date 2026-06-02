import type { LanguageFixture } from './fixtures';

export function formatFailureMessage(fixture: LanguageFixture, actual: string | null): string {
  const preview = fixture.text.length > 80 ? `${fixture.text.slice(0, 77)}…` : fixture.text;
  return [
    `Fixture ${fixture.id}: expected '${fixture.expectedEngineLanguage}', got '${actual}'.`,
    `  Description: ${fixture.description}`,
    `  Scenarios: ${fixture.scenarios.join(', ')}`,
    `  Text preview: ${JSON.stringify(preview)}`,
  ].join('\n');
}
