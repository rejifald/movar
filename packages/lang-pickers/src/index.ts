/**
 * Language-picker discovery, classification, and redirect logic.
 *
 * Exports the full public surface for consumers that need to find language
 * switchers in the DOM, identify their active language, and pick a redirect
 * target. Pure DOM logic — no settings, no overlays, no i18n strings.
 *
 * Consumers import deep subpaths (`@movar/lang-pickers/extract`, `/redirect`, …)
 * via the wildcard export; this barrel mirrors the public surface.
 */

// ── types ─────────────────────────────────────────────────────────────────────
export type {
  ClassifiedLink,
  Picker,
  FilterResult,
  FilterOptions,
  RedirectTarget,
  PickerModel,
} from './types';
export {
  MAX_LANG_TEXT,
  MAX_PICKER_DEPTH,
  QUERY_LANG_PARAMS,
  LABEL_SEPARATORS,
  HIDDEN_ATTR,
  ORIGINAL_DISPLAY_ATTR,
  ORIGINAL_DISPLAY_PRIORITY_ATTR,
  ORIGINAL_TEXT_ATTR,
  RESTORED_ATTR,
  TEXT_DIVIDER_KIND,
  LEADING_SEPARATOR_RUN,
  TRAILING_SEPARATOR_RUN,
  COUNTRY_TO_LANG,
  CLASS_NOISE,
  SEED_SELECTORS,
} from './types';

// ── classify ──────────────────────────────────────────────────────────────────
export { classifyToken, classifyLanguageElement } from './classify';

// ── active ────────────────────────────────────────────────────────────────────
export { languagesInText, bareTextLanguagesInContainer, activeLanguageFromPicker } from './active';

// ── extract ───────────────────────────────────────────────────────────────────
export {
  dedupNested,
  classifyContainerChildren,
  deepQuerySelectorAll,
  pruneOuterContainers,
  findLanguagePickers,
} from './extract';

// ── build-model ───────────────────────────────────────────────────────────────
export { buildPickerModel } from './build-model';

// ── detect-page-language ──────────────────────────────────────────────────────
export { detectPickerActiveLanguage } from './detect-page-language';

// ── redirect ──────────────────────────────────────────────────────────────────
export { pickRedirectTarget } from './redirect';
