/**
 * Core types for the page-content module.
 *
 * ContentNode       — a single filterable DOM card with pre-serialized text.
 * PageContentModel  — the full extraction result for one page visit.
 * PageExtractor     — a site-specific strategy that builds a PageContentModel.
 * FilteredCard      — a card that was newly concealed by applyContentFilter.
 */
import type { LanguageCode } from '@movar/shared';

/**
 * What kind of card a node represents. Drives curtain copy and per-kind
 * telemetry on CorrectionEvent.subKind (wired in a later phase).
 *
 *   video         — a single video tile (search results, home grid, sidebar).
 *   channel       — a channel result card.
 *   playlist      — a playlist or mix/radio card.
 *   shorts-shelf  — the Shorts carousel as a unit.
 *   shelf         — generic horizontal carousel (e.g. "Trending in …").
 *   post          — community/backstage post or platform-agnostic feed item.
 *   result        — a search-results page result block — e.g. Google's `div.g`.
 */
export type CardKind =
  | 'video'
  | 'channel'
  | 'playlist'
  | 'shorts-shelf'
  | 'shelf'
  | 'post'
  | 'result';

/**
 * How a matched card is concealed.
 *
 *   blur — overlay a curtain, let the user peek.
 *   hide — display:none on the card itself, no curtain UI.
 */
export type HideMode = 'blur' | 'hide';

/**
 * A single filterable content unit extracted from the page.
 */
export interface ContentNode {
  el: HTMLElement;
  /** Drives curtain copy and per-kind telemetry. */
  kind: CardKind;
  /** How to conceal this node if its language is blocked. */
  hideMode: HideMode;
  /** Pre-serialized visible-text content, used for language classification. */
  text: string;
}

/**
 * The full set of content nodes extracted from a page by a PageExtractor.
 */
export interface PageContentModel {
  /** The extractor's id — for debugging and telemetry. */
  extractor: string;
  nodes: ContentNode[];
}

/**
 * A site-specific extraction strategy. Registered in the registry and looked
 * up at runtime by host name.
 */
export interface PageExtractor {
  id: string;
  /** Return true when this extractor handles the given hostname. */
  matches(host: string): boolean;
  /** Walk `root` and return every filterable node found. */
  extract(root: ParentNode): PageContentModel;
}

/**
 * A card that was newly concealed by a single applyContentFilter call.
 */
export interface FilteredCard {
  el: HTMLElement;
  fromLang: LanguageCode;
  kind: CardKind;
}
