import { describe, expect, it } from 'vitest';
import { ENGINES, detectLanguageFromText } from './default-roster';

describe('detectLanguageFromText (default roster)', () => {
  it('delegates to the live ENGINES roster', async () => {
    expect(ENGINES.length).toBeGreaterThan(0);
    const result = await detectLanguageFromText(
      'Today in London a new exhibition opened. The artists presented works that reflect ' +
        'the cultural heritage of the country.',
    );
    expect(result?.language).toBe('en');
  });

  it('returns null on text every engine declines', async () => {
    const result = await detectLanguageFromText('12345 67890');
    expect(result).toBeNull();
  });
});
