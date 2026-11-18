import type { JSX } from 'react';

/**
 * Mobile Google-style results page for the "Search in Ukrainian" scene.
 *
 * DOM contract (packages/page-content/src/google.ts): every organic result is a
 * `[data-hveid]` card inside `#search > #rso`, titled by an `<h3>`; the
 * snippet carries `data-sncf="1"`. A result whose language differs from the
 * interface language also carries Google's "translate this page" link, whose
 * `sl` param the extractor reads as the declared language. No obfuscated
 * styling classes are used as anchors.
 *
 * Not a Google reproduction: the wordmark is plain text, domains are
 * fictitious `.example` hosts.
 */
export interface SerpResult {
  id: string;
  site: string;
  /** Display name above the breadcrumb; defaults to the host's first label. */
  name?: string;
  crumb: string;
  title: string;
  snippet: string;
  /** Set when Google would offer "translate this page" (sl=…). */
  translateFrom?: 'ru' | 'en';
}

export interface GoogleSerpProps {
  query: string;
  /** Interface language Google serves: `ru` for the first, un-rewritten load. */
  hl: 'uk' | 'ru';
  results: readonly SerpResult[];
}

const TABS: Record<'uk' | 'ru', readonly string[]> = {
  uk: ['Усі', 'Зображення', 'Відео', 'Новини', 'Карти', 'Покупки'],
  ru: ['Все', 'Картинки', 'Видео', 'Новости', 'Карты', 'Покупки'],
};

const SERP_CSS = `
  :root {
    --bg: #ffffff; --ink: #202124; --ink-soft: #4d5156; --ink-faint: #70757a;
    --link: #1a0dab; --rule: #ebebeb; --rule-strong: #dadce0; --pill: #ffffff;
    --fav: #e8eaed; --accent: #1a73e8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #202124; --ink: #e8eaed; --ink-soft: #bdc1c6; --ink-faint: #9aa0a6;
      --link: #8ab4f8; --rule: #3c4043; --rule-strong: #5f6368; --pill: #303134;
      --fav: #3c4043; --accent: #8ab4f8;
    }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .head { display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px; }
  .brand { font: 500 26px/1 'Product Sans', Arial, sans-serif; letter-spacing: -0.01em; display: inline-flex; }
  .g1,.g4 { color: #4285f4; } .g2,.g6 { color: #ea4335; } .g3 { color: #fbbc05; } .g5 { color: #34a853; }
  .avatar { margin-left: auto; width: 32px; height: 32px; border-radius: 50%;
    background: linear-gradient(135deg, #fbbc05, #ea4335); }
  .box { margin: 0 16px; display: flex; align-items: center; gap: 12px; padding: 11px 16px;
    border: 1px solid var(--rule-strong); border-radius: 24px; background: var(--pill);
    box-shadow: 0 1px 6px rgba(32,33,36,.12); font-size: 16px; }
  .box svg { flex: none; color: var(--ink-faint); }
  .box .q { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .tabs { display: flex; gap: 22px; overflow-x: auto; padding: 0 16px; margin-top: 10px;
    border-bottom: 1px solid var(--rule); font-size: 13px; color: var(--ink-faint); scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { padding: 10px 0 9px; white-space: nowrap; border-bottom: 3px solid transparent; }
  .tab.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 500; }
  #search { padding: 6px 16px 40px; }
  #rso { display: flex; flex-direction: column; }
  .card { padding: 16px 0 14px; border-bottom: 1px solid var(--rule); }
  .card:last-child { border-bottom: 0; }
  .card a { color: inherit; text-decoration: none; }
  .site { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .fav { width: 26px; height: 26px; border-radius: 50%; background: var(--fav); flex: none;
    display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--ink-soft); }
  .site-name { font-size: 14px; line-height: 1.2; color: var(--ink); }
  cite { display: block; font-style: normal; font-size: 12px; line-height: 1.3; color: var(--ink-faint);
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 70vw; }
  h3 { margin: 0 0 4px; font: 400 19px/1.3 Arial, 'Helvetica Neue', Helvetica, sans-serif; color: var(--link); }
  .snip { color: var(--ink-soft); font-size: 14px; line-height: 1.5; }
  .translate { display: inline-block; margin-top: 6px; font-size: 13px; color: var(--accent) !important; }
  /* Desktop (>= 1100px): logo, search box and avatar share a header row; tabs and
     results hang off a ~650px column aligned with the search box. Phone CSS above
     is untouched below this breakpoint. */
  @media (min-width: 1100px) {
    body { display: grid; grid-template-columns: 188px 692px 1fr; align-content: start;
      padding-top: 18px; }
    .head { display: contents; }
    .brand { grid-column: 1; grid-row: 1; align-self: center; justify-self: start;
      margin-left: 28px; font-size: 30px; }
    .avatar { grid-column: 3; grid-row: 1; align-self: center; justify-self: end; margin: 0 28px 0 0; }
    .box { grid-column: 2; grid-row: 1; margin: 0; padding: 12px 20px; font-size: 16px; }
    .tabs { grid-column: 2; grid-row: 2; margin: 14px 0 0; padding: 0; gap: 26px; }
    .tabs::after { content: ''; flex: 1; }
    #search { grid-column: 2; grid-row: 3; padding: 8px 0 64px; }
    .card { padding: 14px 0 12px; border-bottom: 0; margin-bottom: 14px; }
    .site { margin-bottom: 4px; }
    cite { max-width: 560px; }
    h3 { font-size: 20px; line-height: 1.3; }
    h3:hover { text-decoration: underline; }
    .snip { max-width: 652px; }
  }
`;

function Magnifier(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
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
  );
}

function Card({ r, index }: Readonly<{ r: SerpResult; index: number }>): JSX.Element {
  const href = `https://${r.site}/`;
  const hveid = `CA${'EFGHIJKLMNOP'.charAt(index)}QAA`;
  return (
    <div className="card" data-hveid={hveid} data-ved={`2ahUKEwi${index}`} data-fixture-id={r.id}>
      <div>
        <a href={href}>
          <span className="site">
            <span className="fav" aria-hidden="true">
              {r.site.charAt(0).toUpperCase()}
            </span>
            <span>
              <span className="site-name">{r.name ?? r.site.split('.')[0]}</span>
              <cite>{r.crumb}</cite>
            </span>
          </span>
          <h3>{r.title}</h3>
        </a>
        {r.translateFrom === undefined ? null : (
          <a
            className="translate"
            href={`https://translate.google.com/translate?u=${encodeURIComponent(href)}&sl=${r.translateFrom}&tl=uk&client=search`}
          >
            Перекласти цю сторінку
          </a>
        )}
      </div>
      <div className="snip" data-sncf="1">
        {r.snippet}
      </div>
    </div>
  );
}

export function GoogleSerp({ query, hl, results }: Readonly<GoogleSerpProps>): JSX.Element {
  return (
    <>
      <style>{SERP_CSS}</style>
      <div className="head">
        <div className="brand" aria-label="Google">
          <span className="g1">G</span>
          <span className="g2">o</span>
          <span className="g3">o</span>
          <span className="g4">g</span>
          <span className="g5">l</span>
          <span className="g6">e</span>
        </div>
        <div className="avatar" aria-hidden="true" />
      </div>
      <div className="box" role="search">
        <Magnifier />
        <span className="q">{query}</span>
      </div>
      <nav className="tabs" aria-label={hl === 'uk' ? 'Типи пошуку' : 'Типы поиска'}>
        {TABS[hl].map((t, i) => (
          <span key={t} className={i === 0 ? 'tab on' : 'tab'}>
            {t}
          </span>
        ))}
      </nav>
      <div id="search">
        <div id="rso">
          {results.map((r, i) => (
            <Card key={r.id} r={r} index={i} />
          ))}
        </div>
      </div>
    </>
  );
}
