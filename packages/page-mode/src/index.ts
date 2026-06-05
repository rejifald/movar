/**
 * Page-mode detection: figure out whether a page is rendering in a light or
 * dark color scheme, watch for changes, and apply a matching scheme to Movar's
 * injected overlays. Pure DOM logic — no overlays, no i18n, no settings.
 *
 * Consumers import deep subpaths (`@movar/page-mode/context`, `/registry`, …)
 * via the wildcard export; this barrel mirrors the public surface.
 */

export { COLOR_SCHEME_ATTR, applyColorSchemeToAll, detachAllBySelector } from './apply';
export {
  getCurrentColorScheme,
  setCurrentColorScheme,
  resetColorSchemeForTesting,
} from './context';
export {
  detectPageMode,
  modeFromColorSchemeAttr,
  modeFromColorSchemeMeta,
  modeFromComputedBackground,
  modeFromPrefersColorScheme,
} from './detect';
export { watchPageMode } from './observer';
export {
  registerModeDetector,
  lookupModeDetector,
  detectModeForHost,
  clearModeDetectorsForTesting,
} from './registry';
export type { PageMode, PageModeDetector } from './types';
