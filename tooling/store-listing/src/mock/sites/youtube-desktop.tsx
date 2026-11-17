import { createElement } from 'react';
import type { JSX } from 'react';
import { CH_COLORS, Thumb } from './youtube-feed';
import type { FeedVideo } from './youtube-feed';

/**
 * Desktop YouTube-style home feed (www.youtube.com).
 *
 * DOM contract (packages/page-content/src/youtube.ts): the home grid is
 * `ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer`, each cell
 * holding a `yt-lockup-view-model` whose title is an `<h3>`. The extractor
 * selects the rich item (outermost wins) and samples its title: with no
 * `[id="video-title"]` or `ytd-channel-name` inside, the sample falls back to
 * the `<h3>` alone, exactly like a migrated live cell. Custom elements need no
 * registration, only `display` here.
 *
 * Fictitious titles/channels; the wordmark is a red play tile plus plain text.
 */
export interface YouTubeDesktopProps {
  chips: readonly string[];
  videos: readonly FeedVideo[];
  /** Left navigation rail entries. */
  nav: readonly string[];
  search: string;
}

const CSS = `
  :root { --bg:#fff; --ink:#0f0f0f; --soft:#606060; --rule:#e5e5e5; --chip:#f2f2f2; --chip-on:#0f0f0f;
    --chip-on-ink:#fff; --hover:#f2f2f2; --field:#f8f8f8; --field-rule:#ccc; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f0f0f; --ink:#f1f1f1; --soft:#aaaaaa; --rule:#272727; --chip:#272727; --chip-on:#f1f1f1;
      --chip-on-ink:#0f0f0f; --hover:#272727; --field:#121212; --field-rule:#303030; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.4 Roboto, Arial, 'Helvetica Neue', sans-serif; }
  .top { position: fixed; inset: 0 0 auto 0; z-index: 3; height: 56px; display: flex; align-items: center;
    gap: 16px; padding: 0 16px; background: var(--bg); }
  .top .left { display: flex; align-items: center; gap: 16px; width: 224px; }
  .brand { display: flex; align-items: center; gap: 4px; font-weight: 700; font-size: 20px; letter-spacing: -0.04em; }
  .tile { width: 30px; height: 21px; border-radius: 6px; background: #ff0033; display: grid; place-items: center; }
  .mid { flex: 1; display: flex; justify-content: center; }
  .search { display: flex; align-items: center; width: 560px; height: 40px; border: 1px solid var(--field-rule);
    border-radius: 20px; background: var(--field); color: var(--soft); padding: 0 16px; font-size: 16px; }
  .search span { flex: 1; }
  .right { display: flex; align-items: center; gap: 18px; width: 224px; justify-content: flex-end; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg,#34d399,#2563eb); }
  .guide { position: fixed; top: 56px; bottom: 0; left: 0; width: 240px; padding: 12px; }
  .guide .item { display: flex; align-items: center; gap: 24px; height: 40px; padding: 0 12px; border-radius: 10px; font-size: 14px; }
  .guide .item.on { background: var(--hover); font-weight: 500; }
  .guide i { display: block; width: 22px; height: 22px; border-radius: 6px; background: var(--soft); opacity: .55; }
  .chips { position: fixed; top: 56px; left: 240px; right: 0; z-index: 2; display: flex; gap: 12px;
    padding: 12px 24px; background: var(--bg); }
  .chip { padding: 0 12px; height: 32px; display: inline-flex; align-items: center; border-radius: 8px;
    background: var(--chip); font-size: 14px; font-weight: 500; white-space: nowrap; }
  .chip.on { background: var(--chip-on); color: var(--chip-on-ink); }
  ytd-rich-grid-renderer { display: block; margin: 124px 0 0 240px; padding: 0 24px 48px; }
  #contents { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 40px 16px; }
  ytd-rich-item-renderer { display: block; }
  yt-lockup-view-model { display: block; }
  .thumb { position: relative; aspect-ratio: 16 / 9; border-radius: 12px; background: #222; overflow: hidden; }
  .thumb svg { display: block; width: 100%; height: 100%; }
  .dur { position: absolute; right: 8px; bottom: 8px; padding: 1px 4px; border-radius: 4px;
    background: rgba(0,0,0,.8); color: #fff; font-size: 12px; font-weight: 500; }
  .row { display: flex; gap: 12px; padding-top: 12px; }
  .ch { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
    color: #fff; font-weight: 700; font-size: 15px; }
  .txt { min-width: 0; }
  h3 { margin: 0 0 4px; font-size: 16px; line-height: 1.375; font-weight: 500;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { color: var(--soft); font-size: 14px; line-height: 1.4; }
`;

function Icon({ d }: Readonly<{ d: string }>): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function Lockup({ v, index }: Readonly<{ v: FeedVideo; index: number }>): JSX.Element {
  return createElement(
    'ytd-rich-item-renderer',
    { 'data-fixture-id': v.id },
    createElement(
      'yt-lockup-view-model',
      null,
      <div className="thumb">
        <Thumb tone={v.tone} seed={index + 1} />
        <span className="dur">{v.duration}</span>
      </div>,
      <div className="row">
        <span
          className="ch"
          style={{ background: CH_COLORS[(v.tone + 2) % CH_COLORS.length] }}
          aria-hidden="true"
        >
          {v.channel.charAt(0)}
        </span>
        <div className="txt">
          <h3>{v.title}</h3>
          <div className="sub">{v.channel}</div>
          <div className="sub">{v.meta}</div>
        </div>
      </div>,
    ),
  );
}

export function YouTubeDesktop({
  chips,
  videos,
  nav,
  search,
}: Readonly<YouTubeDesktopProps>): JSX.Element {
  return (
    <>
      <style>{CSS}</style>
      <header className="top">
        <div className="left">
          <Icon d="M3 6h18M3 12h18M3 18h18" />
          <div className="brand" aria-label="YouTube">
            <span className="tile">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M6 4l14 8-14 8z" />
              </svg>
            </span>
            YouTube
          </div>
        </div>
        <div className="mid">
          <div className="search" role="search">
            <span>{search}</span>
            <Icon d="m20 20-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
          </div>
        </div>
        <div className="right">
          <Icon d="M12 5v14M5 12h14" />
          <Icon d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" />
          <div className="avatar" aria-hidden="true" />
        </div>
      </header>
      <nav className="guide" aria-label="guide">
        {nav.map((n, i) => (
          <div key={n} className={i === 0 ? 'item on' : 'item'}>
            <i />
            {n}
          </div>
        ))}
      </nav>
      <div className="chips">
        {chips.map((c, i) => (
          <span key={c} className={i === 0 ? 'chip on' : 'chip'}>
            {c}
          </span>
        ))}
      </div>
      {createElement(
        'ytd-rich-grid-renderer',
        null,
        <div id="contents">
          {videos.map((v, i) => (
            <Lockup key={v.id} v={v} index={i} />
          ))}
        </div>,
      )}
    </>
  );
}
