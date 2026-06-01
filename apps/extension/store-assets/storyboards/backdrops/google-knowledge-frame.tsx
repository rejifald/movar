import type { JSX, ReactNode } from 'react';
import { GoogleSerpChrome } from './GoogleSerpChrome';

/**
 * Google-style SERP with a right-column Knowledge Panel — the second
 * marketing diptych ("Searching for God of War"). The frame focuses on
 * the structural difference vs. the result-list-only `GoogleSerpFrame`:
 *
 *   - The body is a two-column flex (results + panel), not a single
 *     680-wide column.
 *   - The panel is the load-bearing visual — its language flips between
 *     the without/with halves while the results column stays in the
 *     same language across both. That's exactly the rhetorical setup
 *     the BeforeAfter "knowledge" pair leans on: a Latin query like
 *     "God of War" doesn't change the result list much, but the
 *     summary card next to it absolutely does change with `hl=uk`.
 *
 * Not a literal Google reproduction — same editorial-illustration
 * stance as `GoogleSerpFrame`. Logo geometry is approximated; result
 * domains are fictitious `.example` so the diptych stays stable across
 * Google's own layout drift.
 *
 * CSS variables are prefixed `--bd-gsk-*` to keep this frame's
 * stylesheet isolated from the sibling SERP frame.
 */
export interface GoogleKnowledgeFrameProps {
  /** Latin or mixed-script query rendered in the search box. */
  query: string;
  /** Stats line under the tabs. */
  stats: string;
  /** Localised tab labels in render order; first one is the active tab. */
  tabs: readonly string[];
  /**
   * URL bar text under the search box — Google itself doesn't render a
   * URL bar inside the page, but the marketing diptych is captured
   * without browser chrome so we paint a thin chrome strip here to
   * give the rhetoric ("`?hl=uk` is what Movar adds") somewhere to
   * land. Highlight the relevant fragment with `<mark>` in the
   * consumer. Ignored when `hideChrome` is true.
   */
  urlBar?: ReactNode;
  /** Skip the built-in `.chrome` strip — used when a parent (e.g. the
   *  before-after frame) supplies its own browser chrome at the half
   *  level. Defaults to `false`. */
  hideChrome?: boolean;
  /** `lang` attribute on the wrapping div — drives screen-reader
   *  pronunciation. `'en'` for the without-Movar half (English Knowledge
   *  Panel), `'uk'` for the with-Movar half. */
  lang: string;
  /** Result rows for the left column. */
  results: ReactNode;
  /** The Knowledge Panel content for the right column. */
  panel: ReactNode;
}

export function GoogleKnowledgeFrame({
  query,
  stats,
  tabs,
  urlBar,
  hideChrome = false,
  lang,
  results,
  panel,
}: GoogleKnowledgeFrameProps): JSX.Element {
  return (
    <GoogleSerpChrome
      rootClass="movar-backdrop-gsk"
      lang={lang}
      query={query}
      tabs={tabs}
      stats={stats}
      urlBar={urlBar}
      hideChrome={hideChrome}
      css={GSK_CSS}
    >
      <div className="body">
        <ol className="results">{results}</ol>
        <aside className="panel" aria-label="Knowledge panel">
          {panel}
        </aside>
      </div>
    </GoogleSerpChrome>
  );
}

/** A single search-result row in the left column. Slimmer than the
 *  sibling frame's result since the page is narrower per-column. */
export interface KnowledgeFrameResultProps {
  site: string;
  title: ReactNode;
  snippet: ReactNode;
  /** Optional `lang` override per result — defaults to the frame's lang. */
  lang?: string;
}

export function KnowledgeFrameResult({
  site,
  title,
  snippet,
  lang,
}: KnowledgeFrameResultProps): JSX.Element {
  return (
    <li className="result" lang={lang}>
      <div className="site">
        <span className="favicon" aria-hidden="true" />
        <span className="domain">{site}</span>
      </div>
      <h3 className="title">{title}</h3>
      <p className="snippet">{snippet}</p>
    </li>
  );
}

/**
 * Compose a single Knowledge Panel card for the right column.
 * Approximates Google's entity card for a video-game franchise:
 *   thumbnail strip → title → subtitle (genre/type) → description →
 *   property list (initial release / developer / publisher / etc).
 *
 * Properties are passed as an array so the without/with halves can
 * use the same key set in different languages without consumers
 * having to repeat layout-level CSS.
 */
export interface KnowledgePanelProps {
  /** Card title — e.g. "God of War". Usually stable across locales. */
  title: string;
  /** Subtitle line under the title — e.g. "Video game series". */
  subtitle: string;
  /** Description paragraph. */
  description: ReactNode;
  /** Key/value property rows. Rendered in order. */
  properties: readonly { label: string; value: string }[];
  /** Bottom "people also search for" tiles — 3 entries fit cleanly. */
  alsoSearch: { label: string }[];
  /** Optional override of the section heading above the property list. */
  propertiesHeading?: string;
  /** Label above the "people also search for" tiles. */
  alsoSearchHeading: string;
  /** Hairline label above the panel title (e.g. "Action game / 2005"). */
  hairline?: string;
}

export function KnowledgePanel({
  title,
  subtitle,
  description,
  properties,
  alsoSearch,
  propertiesHeading,
  alsoSearchHeading,
  hairline,
}: KnowledgePanelProps): JSX.Element {
  return (
    <div className="panel-card">
      <div className="panel-hero" aria-hidden="true">
        <div className="panel-hero-tile panel-hero-tile--a" />
        <div className="panel-hero-tile panel-hero-tile--b" />
        <div className="panel-hero-tile panel-hero-tile--c" />
      </div>
      <div className="panel-body">
        {hairline ? <div className="panel-hairline">{hairline}</div> : null}
        <h2 className="panel-title">{title}</h2>
        <p className="panel-subtitle">{subtitle}</p>
        <p className="panel-description">{description}</p>
        {propertiesHeading ? <h3 className="panel-section">{propertiesHeading}</h3> : null}
        <dl className="panel-properties">
          {properties.map((p) => (
            <div key={p.label} className="panel-property">
              <dt>{p.label}</dt>
              <dd>{p.value}</dd>
            </div>
          ))}
        </dl>
        <h3 className="panel-section">{alsoSearchHeading}</h3>
        <ul className="panel-also">
          {alsoSearch.map((a) => (
            <li key={a.label}>
              <span className="panel-also-thumb" aria-hidden="true" />
              <span className="panel-also-label">{a.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const GSK_CSS = `
  .movar-backdrop-gsk {
    --bd-gsk-bg: #ffffff;
    --bd-gsk-ink: #202124;
    --bd-gsk-ink-soft: #4d5156;
    --bd-gsk-ink-faint: #70757a;
    --bd-gsk-link: #1a0dab;
    --bd-gsk-rule: #ebebeb;
    --bd-gsk-rule-strong: #dadce0;
    --bd-gsk-chrome: #f1f3f4;
    --bd-gsk-mark-bg: #fef7e0;
    --bd-gsk-mark-ink: #5f4500;
    --bd-gsk-panel-bg: #ffffff;
    --bd-gsk-panel-rule: #e8eaed;
    --bd-gsk-panel-shadow: 0 1px 6px rgba(32, 33, 36, 0.08);
    --bd-gsk-thumb-a: linear-gradient(135deg, #1a3a52 0%, #b03a2e 100%);
    --bd-gsk-thumb-b: linear-gradient(135deg, #2c3e50 0%, #c0392b 100%);
    --bd-gsk-thumb-c: linear-gradient(135deg, #34495e 0%, #d35400 100%);
    background: var(--bd-gsk-bg);
    color: var(--bd-gsk-ink);
    font: 14px/1.55 Arial, 'Helvetica Neue', Helvetica, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-gsk .chrome {
    background: var(--bd-gsk-chrome);
    border-bottom: 1px solid var(--bd-gsk-rule-strong);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-backdrop-gsk .chrome .dots {
    display: flex;
    gap: 6px;
  }
  .movar-backdrop-gsk .chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-backdrop-gsk .chrome .urlbar {
    flex: 1;
    background: #fff;
    border: 1px solid var(--bd-gsk-rule-strong);
    border-radius: 999px;
    padding: 6px 16px;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--bd-gsk-ink-soft);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .movar-backdrop-gsk .chrome .urlbar .lock {
    color: var(--bd-gsk-ink-faint);
  }
  .movar-backdrop-gsk .chrome .urlbar .url mark {
    background: var(--bd-gsk-mark-bg);
    color: var(--bd-gsk-mark-ink);
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }
  .movar-backdrop-gsk .serp-head {
    padding: 26px 32px 14px;
    display: flex;
    align-items: center;
    gap: 28px;
  }
  .movar-backdrop-gsk .brand {
    font: 30px/1 'Product Sans', Arial, sans-serif;
    letter-spacing: -0.01em;
    display: inline-flex;
  }
  .movar-backdrop-gsk .brand .g { font-weight: 500; }
  .movar-backdrop-gsk .brand .g1 { color: #4285f4; }
  .movar-backdrop-gsk .brand .g2 { color: #ea4335; }
  .movar-backdrop-gsk .brand .g3 { color: #fbbc05; }
  .movar-backdrop-gsk .brand .g4 { color: #4285f4; }
  .movar-backdrop-gsk .brand .g5 { color: #34a853; }
  .movar-backdrop-gsk .brand .g6 { color: #ea4335; }
  .movar-backdrop-gsk .searchbox {
    flex: 1;
    max-width: 692px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 18px;
    border: 1px solid var(--bd-gsk-rule-strong);
    border-radius: 24px;
    font-size: 16px;
    color: var(--bd-gsk-ink);
    box-shadow: 0 1px 6px rgba(32, 33, 36, 0.08);
  }
  .movar-backdrop-gsk .searchbox .magnifier {
    color: var(--bd-gsk-ink-faint);
    font-size: 14px;
  }
  .movar-backdrop-gsk .searchbox .mic {
    margin-left: auto;
    color: var(--bd-gsk-ink-faint);
  }
  .movar-backdrop-gsk .searchbox .query {
    flex: 1;
  }
  .movar-backdrop-gsk .avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: linear-gradient(135deg, #fbbc05 0%, #ea4335 100%);
    color: #fff;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .movar-backdrop-gsk .tabs {
    border-bottom: 1px solid var(--bd-gsk-rule);
    padding: 0 32px;
    display: flex;
    gap: 26px;
    font-size: 13px;
    color: var(--bd-gsk-ink-faint);
  }
  .movar-backdrop-gsk .tab {
    padding: 12px 0;
    border-bottom: 3px solid transparent;
  }
  .movar-backdrop-gsk .tab.active {
    color: var(--bd-gsk-link);
    border-bottom-color: var(--bd-gsk-link);
    font-weight: 500;
  }
  .movar-backdrop-gsk .tab.tools {
    margin-left: auto;
  }
  .movar-backdrop-gsk .stats {
    margin: 12px 0 18px;
    padding: 0 32px;
    font-size: 13px;
    color: var(--bd-gsk-ink-faint);
  }

  /* Body: two-column flex with the results on the left (max 600w)
     and a fixed 374w Knowledge Panel on the right. The 40px gap
     mirrors Google's own column spacing for entity SERPs at this
     viewport width. */
  .movar-backdrop-gsk .body {
    display: flex;
    gap: 36px;
    padding: 0 32px 40px;
    align-items: flex-start;
  }
  .movar-backdrop-gsk .results {
    flex: 1 1 auto;
    max-width: 600px;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .movar-backdrop-gsk .result .site {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--bd-gsk-ink-soft);
    margin: 0 0 4px;
  }
  .movar-backdrop-gsk .result .favicon {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--bd-gsk-rule-strong);
  }
  .movar-backdrop-gsk .result .title {
    font: 20px/1.3 Arial, 'Helvetica Neue', Helvetica, sans-serif;
    font-weight: 400;
    margin: 0 0 4px;
    color: var(--bd-gsk-link);
  }
  .movar-backdrop-gsk .result .snippet {
    font-size: 14px;
    color: var(--bd-gsk-ink-soft);
    margin: 0;
  }
  .movar-backdrop-gsk .result .snippet b {
    color: var(--bd-gsk-ink);
    font-weight: 700;
  }

  /* Right-column Knowledge Panel card. Width matches Google's own
     entity panel at this viewport. The hero strip at the top hints
     at the box-art thumbnails Google shows for game franchises
     without trying to copy any real artwork — three gradient tiles
     read as "preview imagery" at thumbnail scale without the legal
     risk of a literal reproduction. */
  .movar-backdrop-gsk .panel {
    flex: 0 0 374px;
    background: var(--bd-gsk-panel-bg);
    border: 1px solid var(--bd-gsk-panel-rule);
    border-radius: 10px;
    box-shadow: var(--bd-gsk-panel-shadow);
    overflow: hidden;
  }
  .movar-backdrop-gsk .panel-card {
    display: flex;
    flex-direction: column;
  }
  .movar-backdrop-gsk .panel-hero {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 2px;
    height: 158px;
  }
  .movar-backdrop-gsk .panel-hero-tile {
    width: 100%;
    height: 100%;
  }
  .movar-backdrop-gsk .panel-hero-tile--a { background: var(--bd-gsk-thumb-a); }
  .movar-backdrop-gsk .panel-hero-tile--b { background: var(--bd-gsk-thumb-b); }
  .movar-backdrop-gsk .panel-hero-tile--c { background: var(--bd-gsk-thumb-c); }
  .movar-backdrop-gsk .panel-body {
    padding: 18px 20px 20px;
  }
  .movar-backdrop-gsk .panel-hairline {
    font-size: 12px;
    color: var(--bd-gsk-ink-faint);
    margin: 0 0 6px;
  }
  .movar-backdrop-gsk .panel-title {
    font: 700 22px/1.2 Arial, 'Helvetica Neue', Helvetica, sans-serif;
    margin: 0 0 4px;
    color: var(--bd-gsk-ink);
  }
  .movar-backdrop-gsk .panel-subtitle {
    font-size: 13px;
    color: var(--bd-gsk-ink-faint);
    margin: 0 0 10px;
  }
  .movar-backdrop-gsk .panel-description {
    font-size: 14px;
    line-height: 1.5;
    color: var(--bd-gsk-ink);
    margin: 0 0 14px;
  }
  .movar-backdrop-gsk .panel-section {
    font: 600 14px/1.3 Arial, 'Helvetica Neue', Helvetica, sans-serif;
    margin: 16px 0 8px;
    color: var(--bd-gsk-ink);
  }
  .movar-backdrop-gsk .panel-properties {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .movar-backdrop-gsk .panel-property {
    display: flex;
    gap: 6px;
    font-size: 14px;
  }
  .movar-backdrop-gsk .panel-property dt {
    color: var(--bd-gsk-ink-soft);
    margin: 0;
  }
  .movar-backdrop-gsk .panel-property dt::after {
    content: ':';
  }
  .movar-backdrop-gsk .panel-property dd {
    color: var(--bd-gsk-ink);
    margin: 0;
    font-weight: 500;
  }
  .movar-backdrop-gsk .panel-also {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .movar-backdrop-gsk .panel-also li {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .movar-backdrop-gsk .panel-also-thumb {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 6px;
    background: linear-gradient(135deg, #283747 0%, #95a5a6 100%);
  }
  .movar-backdrop-gsk .panel-also-label {
    font-size: 12px;
    line-height: 1.3;
    color: var(--bd-gsk-ink);
  }
`;
