import type { ReactNode } from 'react';
import { cn } from '@movar/ui';

/**
 * English variant of the news-article backdrop (scene #1). Fictitious
 * Anglophone broadsheet — *The Daybreak Review*. Mirrors `news-uk.tsx`
 * structurally; English-language editorial copy reframes the same
 * Movar-relevant story (sites ignoring the user's stated language
 * preference) for the EN listing audience instead of leading with the
 * UA→RU specific.
 *
 * Same `.movar-backdrop-news-en` scoping pattern as the UK file: tokens
 * prefixed `--bd-news-en-*` so the popup overlay inside the slot keeps
 * its own `@movar/ui` tokens intact.
 */
export function NewsBackdropEN({
  children,
  large = false,
}: {
  children?: ReactNode;
  /** Large-type variant — a ~1.9× reader-friendly scale for the narrow iPad
   *  side-by-side column, where the desktop scale would render illegibly small.
   *  The landscape/iPhone scenes leave it off. */
  large?: boolean;
}) {
  return (
    <div className={cn('movar-backdrop-news-en', large && 'is-large')} lang="en">
      <style>{NEWS_EN_CSS}</style>

      <header className="masthead">
        <div className="brand">
          the daybreak<span className="dot">.</span>
        </div>
        <nav className="top">
          <span>Front Page</span>
          <span>Opinion</span>
          <span>Culture</span>
          <span>Technology</span>
          <span>Business</span>
        </nav>
      </header>

      <article>
        <div className="category">Opinion · Internet</div>
        <h1>How analytics decide what you&rsquo;ll read — even when you&rsquo;ve already chosen</h1>
        <p className="subhead">
          Small choices shape the big picture. What your browser whispers to sites — and why they
          keep refusing to listen.
        </p>
        <div className="byline">
          <strong>Helena Quill</strong> · 27 May 2026 · 6 min read
        </div>

        <p className="lead">
          Every move we make online — a search, an open article, a scrolled feed — drops a tiny mark
          in the analytics traces site owners read each morning. If a million people opened a page
          in the wrong language today only because the site served that language first, tomorrow
          there will be more of those pages and fewer of the others. The numbers get read literally;
          the reader&rsquo;s actual preference disappears.
        </p>

        <p>
          Your browser tells every site, on every request, which languages you would prefer to read.
          The site decides whether to listen — and very often does not. It checks its own logs, sees
          that last week most readers ended up on a different language anyway, and concludes that
          the default must be right. The loop is closed: a default writes the statistics; the
          statistics confirm the default.
        </p>

        <p>
          The technical side of this soft discrimination sits as a thin film on almost every
          business model: serving the familiar version is faster, the session lasts longer, the ad
          metrics look better. There is no villain; just optimisation with traps.
        </p>

        <p>
          The fix is not exotic. A browser already announces the reader&rsquo;s languages on every
          request; a site only has to honour that order before it consults its own averages. The
          preference is not a mystery to be inferred — it is stated, plainly, in the headers, and
          then quietly ignored.
        </p>

        <p>
          None of the remedy requires guessing at intent or tracking anyone. The choice is already
          in the request; it just needs something on the reader&rsquo;s side that refuses to let a
          stale statistic overrule it, page after page, until the web they see is the one they
          actually asked for.
        </p>
      </article>

      {children === undefined ? null : <div className="popup-slot">{children}</div>}
    </div>
  );
}

const NEWS_EN_CSS = `
  .movar-backdrop-news-en {
    --bd-news-en-paper: #f8f5ee;
    --bd-news-en-ink: #1a1612;
    --bd-news-en-ink-soft: #4f463a;
    --bd-news-en-rule: #d8d0bd;
    --bd-news-en-tag: #8c2b1a;
    background: var(--bd-news-en-paper);
    color: var(--bd-news-en-ink);
    font: 17px/1.6 Georgia, 'Times New Roman', serif;
    min-height: 100vh;
  }
  .movar-backdrop-news-en .masthead {
    border-bottom: 1px solid var(--bd-news-en-rule);
    padding: 22px 64px 18px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .movar-backdrop-news-en .brand {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: lowercase;
  }
  .movar-backdrop-news-en .brand .dot {
    color: var(--bd-news-en-tag);
  }
  .movar-backdrop-news-en nav.top {
    display: flex;
    gap: 24px;
    font: 600 12px/1 'Helvetica Neue', Arial, sans-serif;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--bd-news-en-ink-soft);
  }
  .movar-backdrop-news-en article {
    max-width: 720px;
    margin: 48px auto 64px;
    padding: 0 64px;
  }
  .movar-backdrop-news-en .category {
    font: 700 11px/1 'Helvetica Neue', Arial, sans-serif;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--bd-news-en-tag);
  }
  .movar-backdrop-news-en h1 {
    font-size: 44px;
    line-height: 1.12;
    margin: 14px 0 16px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-news-en .subhead {
    font-size: 21px;
    line-height: 1.4;
    color: var(--bd-news-en-ink-soft);
    font-style: italic;
    margin: 0 0 26px;
  }
  .movar-backdrop-news-en .byline {
    font: 13px/1.4 'Helvetica Neue', Arial, sans-serif;
    color: var(--bd-news-en-ink-soft);
    padding-bottom: 16px;
    border-bottom: 1px solid var(--bd-news-en-rule);
    margin-bottom: 28px;
  }
  .movar-backdrop-news-en .byline strong {
    color: var(--bd-news-en-ink);
    font-weight: 600;
  }
  .movar-backdrop-news-en article p {
    margin: 0 0 20px;
  }
  .movar-backdrop-news-en p.lead::first-letter {
    font-size: 64px;
    float: left;
    line-height: 0.9;
    padding: 6px 10px 0 0;
    color: var(--bd-news-en-tag);
    font-weight: 700;
  }

  /* Large-type variant (~1.9×) for the narrow iPad side-by-side column. Only the
   * type scales; the layout widths stay so the article just wraps to more lines
   * and fills the taller column. */
  .movar-backdrop-news-en.is-large {
    font-size: 32px;
    line-height: 1.55;
  }
  .movar-backdrop-news-en.is-large .brand {
    font-size: 52px;
  }
  .movar-backdrop-news-en.is-large nav.top {
    font-size: 19px;
    gap: 34px;
  }
  .movar-backdrop-news-en.is-large .category {
    font-size: 18px;
  }
  .movar-backdrop-news-en.is-large h1 {
    font-size: 74px;
  }
  .movar-backdrop-news-en.is-large .subhead {
    font-size: 36px;
  }
  .movar-backdrop-news-en.is-large .byline {
    font-size: 22px;
  }
  .movar-backdrop-news-en.is-large article {
    margin-top: 60px;
  }
  .movar-backdrop-news-en.is-large p.lead::first-letter {
    font-size: 108px;
  }
  .movar-backdrop-news-en .popup-slot {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 360px;
    box-shadow:
      0 18px 56px rgba(0, 0, 0, 0.22),
      0 2px 4px rgba(0, 0, 0, 0.08);
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
  }
`;
