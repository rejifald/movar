import type { LanguageCode } from '@movar/lang-detect';
import type { PickerModel } from './types';

/**
 * Return the pre-computed active language from a PickerModel.
 *
 * A trivial getter here — the aggregation work happens at `buildPickerModel`
 * time. This named hook exists for symmetry: the page-language orchestrator
 * calls `detectPickerActiveLanguage(model)` rather than reading
 * `model.activeLanguage` directly, leaving room for future per-site overrides
 * to slot in without touching the orchestrator.
 */
export function detectPickerActiveLanguage(model: PickerModel): LanguageCode | null {
  return model.activeLanguage;
}
