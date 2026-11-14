/* eslint-disable @typescript-eslint/no-magic-numbers -- thumbnail art geometry is pure visual constants */
import { createElement } from 'react';
import type { JSX } from 'react';

/**
 * Mobile YouTube-style home feed (m.youtube.com).
 *
 * DOM contract (packages/page-content/src/youtube.ts): each tile is a
 * `ytm-video-with-context-renderer` custom element whose title is an `<h3>`
 * (m.youtube.com tiles no longer carry `[id="video-title"]`). Custom elements
 * need no registration; they only need `display:block` here.
 *
 * Thumbnails are abstract inline SVG art; titles and channels are fictitious.
 * The wordmark is a red play tile plus plain text, never the real logotype.
 */
export interface FeedVideo {
  id: string;
  title: string;
  channel: string;
  meta: string;
  duration: string;
  /** Index into the thumbnail palettes. */
  tone: number;
  verified?: boolean;
}

const TONES: readonly (readonly [string, string, string])[] = [
  ['#0f766e', '#22d3ee', '#fde68a'],
  ['#7c3aed', '#f472b6', '#fef3c7'],
  ['#1d4ed8', '#60a5fa', '#fcd34d'],
  ['#b45309', '#fb923c', '#fff7ed'],
  ['#166534', '#86efac', '#ecfccb'],
  ['#9f1239', '#fb7185', '#ffe4e6'],
  ['#334155', '#94a3b8', '#e2e8f0'],
  ['#0e7490', '#67e8f9', '#cffafe'],
];

function Thumb({ tone, seed }: Readonly<{ tone: number; seed: number }>): JSX.Element {
  const [a, b, c] = TONES[tone % TONES.length] ?? TONES[0] ?? ['#333', '#666', '#999'];
  const gid = `g${seed}`;
  const shift = (seed * 37) % 120;
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={'url(#' + gid + ')'} />
      <circle cx={70 + shift} cy={60} r={46} fill={c} opacity=".9" />
      <path
        d={`M0 ${130 + (seed % 3) * 8} C 80 ${96 - shift / 4}, 160 170, 320 ${112 + (seed % 4) * 6} V180 H0 Z`}
        fill="#000"
        opacity=".22"
      />
      <path
        d={`M0 150 C 100 ${120 + (seed % 5) * 4}, 200 176, 320 140 V180 H0 Z`}
        fill="#000"
        opacity=".28"
      />
      <circle cx={250 - shift / 2} cy={120} r={20} fill="#fff" opacity=".18" />
      <circle cx={196} cy={44} r={9} fill="#fff" opacity=".35" />
    </svg>
  );
}

const CSS = `
  :root { --bg:#fff; --ink:#0f0f0f; --soft:#606060; --rule:#e5e5e5; --chip:#f2f2f2; --chip-on:#0f0f0f; --chip-on-ink:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f0f0f; --ink:#f1f1f1; --soft:#aaaaaa; --rule:#272727; --chip:#272727; --chip-on:#f1f1f1; --chip-on-ink:#0f0f0f; }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.4 Roboto, Arial, 'Helvetica Neue', sans-serif; }
  .bar { display: flex; align-items: center; gap: 14px; padding: 10px 14px; }
  .brand { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 20px; letter-spacing: -0.04em; }
  .tile { width: 30px; height: 21px; border-radius: 6px; background: #ff0033; display: grid; place-items: center; }
  .grow { flex: 1; }
  .avatar { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,#34d399,#2563eb); }
  .chips { display: flex; gap: 8px; overflow-x: auto; padding: 4px 14px 12px; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; padding: 7px 12px; border-radius: 8px; background: var(--chip); font-size: 14px; font-weight: 500; white-space: nowrap; }
  .chip.on { background: var(--chip-on); color: var(--chip-on-ink); }
  ytm-video-with-context-renderer { display: block; margin: 0 0 18px; }
  .thumb { position: relative; aspect-ratio: 16 / 9; background: #222; overflow: hidden; }
  .thumb svg { display: block; width: 100%; height: 100%; }
  .dur { position: absolute; right: 8px; bottom: 8px; padding: 1px 5px; border-radius: 4px;
    background: rgba(0,0,0,.8); color: #fff; font-size: 12px; font-weight: 500; }
  .row { display: flex; gap: 12px; padding: 12px 14px 0; }
  .ch { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
    color: #fff; font-weight: 700; font-size: 15px; }
  .txt { min-width: 0; }
  h3 { margin: 0 0 4px; font-size: 15px; line-height: 1.3; font-weight: 500;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sub { color: var(--soft); font-size: 12.5px; }
  .tabbar { position: sticky; bottom: 0; display: flex; justify-content: space-around; padding: 8px 0 18px;
    background: var(--bg); border-top: 1px solid var(--rule); font-size: 10px; color: var(--soft); }
  .tabbar span { display: grid; place-items: center; gap: 3px; }
  .tabbar i { display: block; width: 22px; height: 22px; border-radius: 6px; background: var(--soft); opacity: .55; }
`;

export interface YouTubeFeedProps {
  chips: readonly string[];
  videos: readonly FeedVideo[];
  tabs: readonly string[];
}

const CH_COLORS = [
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#1d4ed8',
  '#9f1239',
  '#166534',
  '#334155',
  '#0e7490',
];

export function YouTubeFeed({ chips, videos, tabs }: Readonly<YouTubeFeedProps>): JSX.Element {
  return (
    <>
      <style>{CSS}</style>
      <div className="bar">
        <div className="brand" aria-label="YouTube">
          <span className="tile">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M6 4l14 8-14 8z" />
            </svg>
          </span>
          YouTube
        </div>
        <div className="grow" />
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
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <div className="avatar" aria-hidden="true" />
      </div>
      <nav className="chips" aria-label="filters">
        {chips.map((c, i) => (
          <span key={c} className={i === 0 ? 'chip on' : 'chip'}>
            {c}
          </span>
        ))}
      </nav>
      <main>
        {videos.map((v, i) =>
          createElement(
            'ytm-video-with-context-renderer',
            { key: v.id, 'data-fixture-id': v.id },
            <div className="thumb">
              <Thumb tone={v.tone} seed={i + 1} />
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
                <div className="sub">
                  {v.channel} · {v.meta}
                </div>
              </div>
            </div>,
          ),
        )}
      </main>
      <div className="tabbar">
        {tabs.map((t) => (
          <span key={t}>
            <i />
            {t}
          </span>
        ))}
      </div>
    </>
  );
}
