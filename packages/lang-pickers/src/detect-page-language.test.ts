import { describe, expect, it } from 'vitest';
import { detectPickerActiveLanguage } from './detect-page-language';
import type { PickerModel } from './types';

const modelWith = (activeLanguage: PickerModel['activeLanguage']): PickerModel =>
  ({ activeLanguage }) as PickerModel;

describe('detectPickerActiveLanguage', () => {
  it('returns the active language the model already computed', () => {
    expect(detectPickerActiveLanguage(modelWith('uk'))).toBe('uk');
  });

  it('returns null when the model found no active language', () => {
    expect(detectPickerActiveLanguage(modelWith(null))).toBeNull();
  });
});
