import type { JSX, ReactNode } from 'react';

/**
 * Shared Google-SERP-illustrative frame for the marketing before/after
 * pair. Both halves render the same chrome (logo, search box, tabs,
 * stats line) so the only visible difference between the two PNGs is
 * the result list — exactly what the marketing rhetoric leans on.
 *
 * Not a literal Google reproduction: this is editorial illustration,
 * matching the BeforeAfter section copy that names google.com.ua. Logo
 * geometry is approximated (rounded rectangle hint at Google's pill +
 * a coloured `G`) rather than copying the trademarked mark verbatim.
 *
 * CSS variables stay prefixed `--bd-gs-*` so the popup component (if a
 * future scene ever composites one over a SERP) keeps its own
 * `@movar/ui` tokens uncontaminated.
 */
export interface GoogleSerpFrameProps {
  /** Cyrillic search query rendered in the search box. */
  query: string;
  /**
   * Stats line under the tabs — e.g.
   * "Приблизно 47 200 результатів · мова: українська".
   * The two halves of the diptych use different stat lines because
   * Movar's URL params narrow Google's result pool.
   */
  stats: string;
  /** Localised tab labels in render order; first one is the active tab. */
  tabs: readonly string[];
  /**
   * URL bar text under the search box — Google itself doesn't render a
   * URL bar inside the page, but the marketing diptych is captured
   * without browser chrome so we paint a thin chrome strip here to
   * give the rhetoric ("`?hl=uk` is what Movar adds") somewhere to
   * land. Highlight the relevant fragment with `<mark>`-style tag in
   * the consumer. Ignored when `hideChrome` is true (the marketplace
   * diptych supplies its own chrome at the half level).
   */
  urlBar?: ReactNode;
  /** Skip the built-in `.chrome` strip (window dots + URL bar). The
   *  marketplace diptych (`before-after-frame.tsx`) renders a unified
   *  browser chrome at the half level — passing the SERP through with
   *  its own chrome would double the URL bar. Defaults to `false`. */
  hideChrome?: boolean;
  /** `lang` attribute on the wrapping div — `'ru'` for the without-Movar
   *  half, `'uk'` for the with-Movar half. */
  lang: string;
  children: ReactNode;
}

export function GoogleSerpFrame({
  query,
  stats,
  tabs,
  urlBar,
  hideChrome = false,
  lang,
  children,
}: GoogleSerpFrameProps): JSX.Element {
  return (
    <div className="movar-backdrop-gserp" lang={lang}>
      <style>{GSERP_CSS}</style>

      {hideChrome ? null : (
        <div className="chrome">
          <div className="dots">
            <span />
            <span />
            <span />
          </div>
          <div className="urlbar">
            <span className="lock">🔒</span>
            <span className="url">{urlBar}</span>
          </div>
        </div>
      )}

      <header className="serp-head">
        <div className="brand" aria-hidden="true">
          <span className="g g1">G</span>
          <span className="g g2">o</span>
          <span className="g g3">o</span>
          <span className="g g4">g</span>
          <span className="g g5">l</span>
          <span className="g g6">e</span>
        </div>
        <div className="searchbox">
          <span className="magnifier">🔍</span>
          <span className="query">{query}</span>
          <span className="mic" aria-hidden="true">
            🎙
          </span>
        </div>
        <div className="avatar" aria-hidden="true" />
      </header>

      <nav className="tabs" aria-label="search verticals">
        {tabs.map((label, i) => (
          <span key={label} className={i === 0 ? 'tab active' : 'tab'}>
            {label}
          </span>
        ))}
        <span className="tab tools">⋯</span>
      </nav>

      <p className="stats">{stats}</p>

      <ol className="results">{children}</ol>
    </div>
  );
}

/**
 * Single search result row. Title is rendered as a link to mimic
 * Google's blue underline-on-hover treatment without making the
 * Storybook actually navigate.
 */
export interface GoogleSerpResultProps {
  site: string;
  title: ReactNode;
  snippet: ReactNode;
  /** Optional `lang` override per result (e.g. results in different
   *  languages on the same page). Defaults to the frame's lang. */
  lang?: string;
}

export function GoogleSerpResult({
  site,
  title,
  snippet,
  lang,
}: GoogleSerpResultProps): JSX.Element {
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

const GSERP_CSS = `
  .movar-backdrop-gserp {
    --bd-gs-bg: #ffffff;
    --bd-gs-ink: #202124;
    --bd-gs-ink-soft: #4d5156;
    --bd-gs-ink-faint: #70757a;
    --bd-gs-link: #1a0dab;
    --bd-gs-link-visited: #681da8;
    --bd-gs-rule: #ebebeb;
    --bd-gs-rule-strong: #dadce0;
    --bd-gs-chrome: #f1f3f4;
    --bd-gs-mark-bg: #fef7e0;
    --bd-gs-mark-ink: #5f4500;
    background: var(--bd-gs-bg);
    color: var(--bd-gs-ink);
    font: 14px/1.55 Arial, 'Helvetica Neue', Helvetica, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-gserp .chrome {
    background: var(--bd-gs-chrome);
    border-bottom: 1px solid var(--bd-gs-rule-strong);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-backdrop-gserp .chrome .dots {
    display: flex;
    gap: 6px;
  }
  .movar-backdrop-gserp .chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-backdrop-gserp .chrome .urlbar {
    flex: 1;
    background: #fff;
    border: 1px solid var(--bd-gs-rule-strong);
    border-radius: 999px;
    padding: 6px 16px;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--bd-gs-ink-soft);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .movar-backdrop-gserp .chrome .urlbar .lock {
    color: var(--bd-gs-ink-faint);
  }
  .movar-backdrop-gserp .chrome .urlbar .url mark {
    background: var(--bd-gs-mark-bg);
    color: var(--bd-gs-mark-ink);
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }
  .movar-backdrop-gserp .serp-head {
    padding: 26px 32px 14px;
    display: flex;
    align-items: center;
    gap: 28px;
  }
  .movar-backdrop-gserp .brand {
    font: 30px/1 'Product Sans', Arial, sans-serif;
    letter-spacing: -0.01em;
    display: inline-flex;
  }
  .movar-backdrop-gserp .brand .g {
    font-weight: 500;
  }
  .movar-backdrop-gserp .brand .g1 { color: #4285f4; }
  .movar-backdrop-gserp .brand .g2 { color: #ea4335; }
  .movar-backdrop-gserp .brand .g3 { color: #fbbc05; }
  .movar-backdrop-gserp .brand .g4 { color: #4285f4; }
  .movar-backdrop-gserp .brand .g5 { color: #34a853; }
  .movar-backdrop-gserp .brand .g6 { color: #ea4335; }
  .movar-backdrop-gserp .searchbox {
    flex: 1;
    max-width: 692px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 18px;
    border: 1px solid var(--bd-gs-rule-strong);
    border-radius: 24px;
    font-size: 16px;
    color: var(--bd-gs-ink);
    box-shadow: 0 1px 6px rgba(32, 33, 36, 0.08);
  }
  .movar-backdrop-gserp .searchbox .magnifier {
    color: var(--bd-gs-ink-faint);
    font-size: 14px;
  }
  .movar-backdrop-gserp .searchbox .mic {
    margin-left: auto;
    color: var(--bd-gs-ink-faint);
  }
  .movar-backdrop-gserp .searchbox .query {
    flex: 1;
  }
  .movar-backdrop-gserp .avatar {
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
  .movar-backdrop-gserp .tabs {
    border-bottom: 1px solid var(--bd-gs-rule);
    padding: 0 32px;
    display: flex;
    gap: 26px;
    font-size: 13px;
    color: var(--bd-gs-ink-faint);
  }
  .movar-backdrop-gserp .tab {
    padding: 12px 0;
    border-bottom: 3px solid transparent;
  }
  .movar-backdrop-gserp .tab.active {
    color: var(--bd-gs-link);
    border-bottom-color: var(--bd-gs-link);
    font-weight: 500;
  }
  .movar-backdrop-gserp .tab.tools {
    margin-left: auto;
  }
  .movar-backdrop-gserp .stats {
    max-width: 680px;
    margin: 12px 0 18px;
    padding: 0 32px;
    font-size: 13px;
    color: var(--bd-gs-ink-faint);
  }
  .movar-backdrop-gserp .results {
    max-width: 680px;
    margin: 0;
    padding: 0 32px 40px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .movar-backdrop-gserp .result .site {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--bd-gs-ink-soft);
    margin: 0 0 4px;
  }
  .movar-backdrop-gserp .result .favicon {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--bd-gs-rule-strong);
  }
  .movar-backdrop-gserp .result .domain {
    line-height: 1;
  }
  .movar-backdrop-gserp .result .title {
    font: 20px/1.3 Arial, 'Helvetica Neue', Helvetica, sans-serif;
    font-weight: 400;
    margin: 0 0 4px;
    color: var(--bd-gs-link);
  }
  .movar-backdrop-gserp .result .snippet {
    font-size: 14px;
    color: var(--bd-gs-ink-soft);
    margin: 0;
  }
  .movar-backdrop-gserp .result .snippet b {
    color: var(--bd-gs-ink);
    font-weight: 700;
  }
`;
