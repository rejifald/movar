import type { JSX, ReactNode } from 'react';
import { cn } from '@movar/ui';

/**
 * Shared Google SERP header chrome used by both `GoogleSerpFrame` and
 * `GoogleKnowledgeFrame`. Renders the optional browser-chrome strip
 * (window-control dots + URL bar), the branded header (logo, search box,
 * avatar), the tab strip, and the stats line.
 *
 * Each frame passes its own CSS-variable namespace prefix (`ns`) so the
 * inline styles can reference the frame's own custom-property definitions
 * without coupling this component to either frame's stylesheet.
 *
 * Consumers render their result content (result list / knowledge panel)
 * as `children` below the shared chrome.
 */
export interface GoogleSerpChromeProps {
  /** Movar backdrop class applied to the root div, e.g. `'movar-backdrop-gserp'`. */
  rootClass: string;
  /** `lang` attribute on the wrapping div — drives screen-reader pronunciation. */
  lang: string;
  /** Search query rendered in the search box. */
  query: string;
  /** Localised tab labels in render order; first one is the active tab. */
  tabs: readonly string[];
  /** Stats line rendered below the tab strip. */
  stats: string;
  /** URL bar text. Ignored when `hideChrome` is true. */
  urlBar?: ReactNode;
  /** Skip the built-in browser-chrome strip. Defaults to `false`. */
  hideChrome?: boolean;
  /** CSS string injected via a `<style>` tag inside the component. */
  css: string;
  /** Result content rendered below the shared chrome. */
  children: ReactNode;
}

export function GoogleSerpChrome({
  rootClass,
  lang,
  query,
  tabs,
  stats,
  urlBar,
  hideChrome = false,
  css,
  children,
}: GoogleSerpChromeProps): JSX.Element {
  return (
    <div className={rootClass} lang={lang}>
      <style>{css}</style>

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
          <span key={label} className={cn('tab', i === 0 && 'active')}>
            {label}
          </span>
        ))}
        <span className="tab tools">⋯</span>
      </nav>

      <p className="stats">{stats}</p>

      {children}
    </div>
  );
}
