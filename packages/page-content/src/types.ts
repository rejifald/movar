/**
 * Core types for the page-content module.
 *
 * ContentNode       — a single filterable DOM card with pre-serialized text.
 * PageContentModel  — the full extraction result for one page visit.
 * PageExtractor     — a site-specific strategy that builds a PageContentModel.
 * FilteredCard      — a card that was newly concealed by applyContentFilter.
 */
import type { LanguageCode } from '@movar/lang-detect';

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
 *   ad            — a paid/sponsored search-results block — e.g. Google's
 *                   `[data-text-ad]` text ad. Kept distinct from `result` so
 *                   telemetry can tell "hid a paid placement" from "hid an
 *                   organic result" (different provenance, same hide treatment).
 *   ai-answer     — a generated answer block (e.g. Google's AI Overview).
 */
export type CardKind =
  | 'video'
  | 'channel'
  | 'playlist'
  | 'shorts-shelf'
  | 'shelf'
  | 'post'
  | 'result'
  | 'ad'
  | 'ai-answer';

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
  /** The language the page itself declares for this node — e.g. Google's
   *  `data-rl` response-language label. Normalized to a known
   *  {@link LanguageCode} at extraction (BCP-47-aware); a value the model
   *  doesn't recognize is simply not carried, leaving the node to the text
   *  pipeline. See {@link DeclaredLangNode} for how these nodes are decided. */
  declaredLang?: LanguageCode;
}

/**
 * A {@link ContentNode} whose language the page declares outright. The
 * declaration is the strongest evidence the filter has — such a node is
 * decided on the label alone, no text sampling: it conceals before its
 * streamed text arrives, and its own UI chrome never contaminates a language
 * sample. Narrow with {@link isDeclaredLangNode}.
 */
export type DeclaredLangNode = ContentNode & { declaredLang: LanguageCode };

/** True when the page declared this node's language at extraction. */
export function isDeclaredLangNode(node: ContentNode): node is DeclaredLangNode {
  return node.declaredLang !== undefined;
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
