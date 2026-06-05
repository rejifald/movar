/**
 * Page-content extraction: site-specific strategies that walk the DOM and
 * produce filterable ContentNode lists, plus text-serialization helpers and
 * the extractor registry. Pure DOM logic — no concealment, no i18n, no
 * settings.
 *
 * Consumers import deep subpaths (`@movar/page-content/google`,
 * `/youtube`, …) via the wildcard export to activate self-registering
 * extractors; this barrel mirrors the public surface for shared types and
 * registry utilities.
 */

export type {
  CardKind,
  HideMode,
  ContentNode,
  PageContentModel,
  PageExtractor,
  FilteredCard,
} from './types';

export { serializeNodeText, serializeElementText, serializeModelText } from './serialize';

export { registerExtractor, lookupExtractor, buildModelForHost } from './registry';

export { GOOGLE_EXTRACTOR } from './google';
export { YOUTUBE_EXTRACTOR } from './youtube';
