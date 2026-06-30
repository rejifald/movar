/**
 * Reusable, storage-agnostic options/popup UI. Every component takes
 * `{ settings, onChange }`-style props and pulls copy from the `@movar/i18n`
 * context — none of them touch `chrome.storage` or `wxt`/`browser`, so a host
 * app can mount them and wire its own persistence. The one host-specific value
 * a couple of these need (the browser UI language, for resolving "Auto") is
 * passed in as a prop.
 */

export { PrioritySection } from './PrioritySection';
export { PageContentSection } from './PageContentSection';
export { BlockedSection } from './BlockedSection';
export { AllowlistSection } from './AllowlistSection';
export { ContentToggle } from './ContentToggle';
export { ConcealModeField } from './ConcealModeField';
export { LanguageSelector } from './LanguageSelector';

// Small shared helpers + the supported-language catalogue, reused by the
// sections and useful to a host that builds its own pickers.
export {
  AddLanguagePicker,
  DOMAIN_PATTERN,
  SUPPORTED_LANGUAGES,
  displayLanguage,
  normaliseDomain,
} from './shared';
