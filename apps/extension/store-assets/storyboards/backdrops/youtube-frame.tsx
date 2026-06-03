import type { JSX, ReactNode } from 'react';
import { BadgeCheck, Play, Search } from 'lucide-react';

/**
 * YouTube-style search-results frame for the "YouTube" before/after
 * pair (marketing Examples entry #3 + marketplace scene #6). Both
 * halves share the same masthead (approximated play wordmark, the same
 * Cyrillic query, the same filter chips); the only difference a viewer
 * sees is the video list — Russian-leaning channels on the "without"
 * half, Ukrainian creators on the "with" half. That mirrors what Movar
 * actually changes: it doesn't touch YouTube's UI language, only the
 * `hl`/`gl` hints that steer which creators get recommended.
 *
 * Not a literal YouTube reproduction — same editorial-illustration
 * stance as `google-serp-frame.tsx`. The wordmark is a red play tile +
 * a plain bold "YouTube" (no real logotype); channel names are
 * fictitious; thumbnails are abstract gradient tiles, not real video
 * stills.
 *
 * CSS variables are prefixed `--bd-yt-*` so this frame's stylesheet
 * stays isolated from the sibling SERP/knowledge frames. The dark
 * palette (driven by prefers-color-scheme) approximates YouTube's dark
 * theme; the capture script sets the scheme per pass.
 */
export interface YouTubeFrameProps {
  /** Cyrillic search query rendered in the masthead search box. */
  query: string;
  /** Localised filter chips in render order; first one is active. */
  chips: readonly string[];
  /**
   * URL bar text under the masthead. Ignored when `hideChrome` is true
   * (the marketplace diptych supplies its own chrome at the half
   * level). Highlight Movar's `hl`/`gl` params with `<mark>`.
   */
  urlBar?: ReactNode;
  /** Skip the built-in browser-chrome strip. Defaults to `false`. */
  hideChrome?: boolean;
  /** `lang` attribute on the wrapping div — `'ru'` for the without half,
   *  `'uk'` for the with half. */
  lang: string;
  /** Video result rows. */
  children: ReactNode;
}

export function YouTubeFrame({
  query,
  chips,
  urlBar,
  hideChrome = false,
  lang,
  children,
}: YouTubeFrameProps): JSX.Element {
  return (
    <div className="movar-backdrop-yt" lang={lang}>
      <style>{YT_CSS}</style>

      {hideChrome ? null : (
        <div className="chrome">
          <div className="dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="urlbar">
            <span className="lock" aria-hidden="true">
              🔒
            </span>
            <span className="url">{urlBar}</span>
          </div>
        </div>
      )}

      <header className="masthead">
        <div className="brand" aria-hidden="true">
          <span className="brand-tile">
            <Play size={16} color="#ffffff" fill="#ffffff" strokeWidth={0} />
          </span>
          <span className="brand-word">YouTube</span>
        </div>
        <div className="searchbar">
          <span className="query">{query}</span>
          <span className="search-btn" aria-hidden="true">
            <Search size={18} />
          </span>
        </div>
        <div className="avatar" aria-hidden="true" />
      </header>

      <nav className="chips" aria-label="filters">
        {chips.map((label, i) => (
          <span key={label} className={i === 0 ? 'chip active' : 'chip'}>
            {label}
          </span>
        ))}
      </nav>

      <ol className="results">{children}</ol>
    </div>
  );
}

/** A single YouTube search-result row — thumbnail on the left, video
 *  metadata on the right. */
export interface YouTubeVideoProps {
  title: ReactNode;
  /** Channel display name. */
  channel: string;
  /** Stat line — e.g. "1.2M views · 3 days ago" / "1,2 млн переглядів · 3 дні тому". */
  meta: string;
  /** Optional one-line description under the metadata. */
  snippet?: ReactNode;
  /** Duration badge text, e.g. "12:04". */
  duration: string;
  /** Which gradient the thumbnail uses; just visual variety. */
  tone: 'a' | 'b' | 'c' | 'd';
  /** Show a verified check next to the channel name. */
  verified?: boolean;
  /** Optional `lang` override per result; defaults to the frame's lang. */
  lang?: string;
}

export function YouTubeVideo({
  title,
  channel,
  meta,
  snippet,
  duration,
  tone,
  verified = false,
  lang,
}: YouTubeVideoProps): JSX.Element {
  return (
    <li className="video" lang={lang}>
      <div className={`thumb thumb--${tone}`}>
        <span className="duration">{duration}</span>
      </div>
      <div className="info">
        <h3 className="title">{title}</h3>
        <div className="byline">
          <span className="ch-avatar" aria-hidden="true" />
          <span className="ch-name">{channel}</span>
          {verified ? <BadgeCheck className="verified" size={13} aria-hidden="true" /> : null}
        </div>
        <div className="meta">{meta}</div>
        {snippet ? <p className="snippet">{snippet}</p> : null}
      </div>
    </li>
  );
}

const YT_CSS = `
  .movar-backdrop-yt {
    --bd-yt-bg: #ffffff;
    --bd-yt-ink: #0f0f0f;
    --bd-yt-ink-soft: #606060;
    --bd-yt-ink-faint: #909090;
    --bd-yt-rule: #e5e5e5;
    --bd-yt-rule-strong: #cccccc;
    --bd-yt-chrome: #f1f3f4;
    --bd-yt-search-bg: #ffffff;
    --bd-yt-search-btn: #f8f8f8;
    --bd-yt-chip-bg: #f2f2f2;
    --bd-yt-chip-ink: #0f0f0f;
    --bd-yt-chip-active-bg: #0f0f0f;
    --bd-yt-chip-active-ink: #ffffff;
    --bd-yt-thumb-veil: rgba(0, 0, 0, 0.06);
    --bd-yt-mark-bg: #fef7e0;
    --bd-yt-mark-ink: #5f4500;
    --bd-yt-brand: #ff0033;
    --bd-yt-verified: #606060;
    background: var(--bd-yt-bg);
    color: var(--bd-yt-ink);
    font: 14px/1.5 Roboto, Arial, 'Helvetica Neue', Helvetica, sans-serif;
  }
  .movar-backdrop-yt .chrome {
    background: var(--bd-yt-chrome);
    border-bottom: 1px solid var(--bd-yt-rule-strong);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-backdrop-yt .chrome .dots {
    display: flex;
    gap: 6px;
  }
  .movar-backdrop-yt .chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-backdrop-yt .chrome .urlbar {
    flex: 1;
    background: #fff;
    border: 1px solid var(--bd-yt-rule-strong);
    border-radius: 999px;
    padding: 6px 16px;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--bd-yt-ink-soft);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .movar-backdrop-yt .chrome .urlbar .lock {
    color: var(--bd-yt-ink-faint);
  }
  .movar-backdrop-yt .chrome .urlbar .url mark {
    background: var(--bd-yt-mark-bg);
    color: var(--bd-yt-mark-ink);
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }

  .movar-backdrop-yt .masthead {
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 14px 28px;
  }
  .movar-backdrop-yt .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .movar-backdrop-yt .brand-tile {
    width: 30px;
    height: 21px;
    border-radius: 6px;
    background: var(--bd-yt-brand);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .movar-backdrop-yt .brand-word {
    font: 700 19px/1 Roboto, Arial, sans-serif;
    letter-spacing: -0.04em;
    color: var(--bd-yt-ink);
  }
  .movar-backdrop-yt .searchbar {
    flex: 1;
    max-width: 540px;
    display: flex;
    align-items: center;
    border: 1px solid var(--bd-yt-rule-strong);
    border-radius: 999px;
    overflow: hidden;
    background: var(--bd-yt-search-bg);
  }
  .movar-backdrop-yt .searchbar .query {
    flex: 1;
    padding: 9px 16px;
    font-size: 16px;
    color: var(--bd-yt-ink);
  }
  .movar-backdrop-yt .searchbar .search-btn {
    width: 64px;
    align-self: stretch;
    background: var(--bd-yt-search-btn);
    border-left: 1px solid var(--bd-yt-rule-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--bd-yt-ink-soft);
  }
  .movar-backdrop-yt .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
    background: linear-gradient(135deg, #06b6d4 0%, #2563eb 100%);
  }

  .movar-backdrop-yt .chips {
    display: flex;
    gap: 12px;
    padding: 6px 28px 16px;
    border-bottom: 1px solid var(--bd-yt-rule);
    font-size: 13px;
  }
  .movar-backdrop-yt .chip {
    padding: 7px 12px;
    border-radius: 8px;
    background: var(--bd-yt-chip-bg);
    color: var(--bd-yt-chip-ink);
    font-weight: 500;
    white-space: nowrap;
  }
  .movar-backdrop-yt .chip.active {
    background: var(--bd-yt-chip-active-bg);
    color: var(--bd-yt-chip-active-ink);
  }

  .movar-backdrop-yt .results {
    max-width: 880px;
    margin: 0;
    padding: 20px 28px 36px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .movar-backdrop-yt .video {
    display: flex;
    gap: 16px;
  }
  .movar-backdrop-yt .thumb {
    flex: 0 0 246px;
    height: 138px;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
  }
  /* Abstract gradient thumbnails — distinct per card, no real stills. */
  .movar-backdrop-yt .thumb--a { background: linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%); }
  .movar-backdrop-yt .thumb--b { background: linear-gradient(135deg, #4a2f6b 0%, #b0457a 100%); }
  .movar-backdrop-yt .thumb--c { background: linear-gradient(135deg, #2c5f4a 0%, #4f9f6a 100%); }
  .movar-backdrop-yt .thumb--d { background: linear-gradient(135deg, #5f4a2c 0%, #b08038 100%); }
  .movar-backdrop-yt .thumb .duration {
    position: absolute;
    right: 6px;
    bottom: 6px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .movar-backdrop-yt .info {
    flex: 1 1 auto;
    min-width: 0;
    padding-top: 2px;
  }
  .movar-backdrop-yt .info .title {
    font: 500 18px/1.3 Roboto, Arial, sans-serif;
    margin: 0 0 8px;
    color: var(--bd-yt-ink);
  }
  .movar-backdrop-yt .byline {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }
  .movar-backdrop-yt .ch-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--bd-yt-rule-strong);
    flex-shrink: 0;
  }
  .movar-backdrop-yt .ch-name {
    font-size: 12px;
    color: var(--bd-yt-ink-soft);
  }
  .movar-backdrop-yt .verified {
    color: var(--bd-yt-verified);
    flex-shrink: 0;
  }
  .movar-backdrop-yt .meta {
    font-size: 12px;
    color: var(--bd-yt-ink-soft);
    margin-top: 2px;
  }
  .movar-backdrop-yt .snippet {
    font-size: 12px;
    color: var(--bd-yt-ink-soft);
    margin: 8px 0 0;
  }

  /* Dark theme — an editorial approximation of YouTube's dark mode.
     The red brand tile keeps its colour, as YouTube's does. */
  @media (prefers-color-scheme: dark) {
    .movar-backdrop-yt {
      --bd-yt-bg: #0f0f0f;
      --bd-yt-ink: #f1f1f1;
      --bd-yt-ink-soft: #aaaaaa;
      --bd-yt-ink-faint: #717171;
      --bd-yt-rule: #272727;
      --bd-yt-rule-strong: #3f3f3f;
      --bd-yt-chrome: #1f1f1f;
      --bd-yt-search-bg: #121212;
      --bd-yt-search-btn: #222222;
      --bd-yt-chip-bg: #272727;
      --bd-yt-chip-ink: #f1f1f1;
      --bd-yt-chip-active-bg: #f1f1f1;
      --bd-yt-chip-active-ink: #0f0f0f;
      --bd-yt-mark-bg: #3a2f12;
      --bd-yt-mark-ink: #fdd663;
      --bd-yt-verified: #aaaaaa;
    }
    .movar-backdrop-yt .chrome .dots span { background: #5f6368; }
    .movar-backdrop-yt .chrome .urlbar { background: #121212; }
  }
`;
