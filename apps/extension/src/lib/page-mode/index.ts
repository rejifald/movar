export type { PageMode, PageModeDetector } from './types';
export {
  detectPageMode,
  modeFromColorSchemeAttr,
  modeFromColorSchemeMeta,
  modeFromComputedBackground,
  modeFromPrefersColorScheme,
} from './detect';
export {
  clearModeDetectorsForTesting,
  detectModeForHost,
  lookupModeDetector,
  registerModeDetector,
} from './registry';
export { watchPageMode } from './observer';
export {
  getCurrentColorScheme,
  resetColorSchemeForTesting,
  setCurrentColorScheme,
} from './context';
