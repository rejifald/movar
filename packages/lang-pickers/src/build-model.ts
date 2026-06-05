import type { LanguageCode } from '@movar/lang-detect';
import type { Picker, PickerModel } from './types';
import { activeLanguageFromPicker } from './active';

/**
 * Build a pre-computed model from an already-collected `Picker[]` and the
 * current page URL. Callers that need both the picker list and the active
 * language should call `buildPickerModel` once and pass the model around,
 * avoiding a second DOM walk.
 *
 * Placed in its own module (not in extract.ts) to avoid a circular dependency:
 * active.ts → extract.ts (findLanguagePickers) and
 * extract.ts → active.ts (activeLanguageFromPicker) would form a cycle.
 * build-model.ts sits above both: it imports from active.ts only, while
 * callers pass the already-extracted Picker[] in.
 */
export function buildPickerModel(pickers: Picker[], currentHref: string | undefined): PickerModel {
  const votes = new Set<LanguageCode>();
  for (const picker of pickers) {
    const active = activeLanguageFromPicker(picker, currentHref);
    if (active) votes.add(active);
  }
  const activeLanguage = votes.size === 1 ? ([...votes][0] ?? null) : null;
  return { extractor: 'generic', pickers, activeLanguage };
}
