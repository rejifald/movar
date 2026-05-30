/**
 * English variant of the search-rewrite backdrop (scene #4). Fictitious
 * search engine — *Vector* — serving English results with `hl=en`
 * highlighted in the URL bar. Mirrors `serp-uk.tsx` structurally; the
 * query and result snippets are reworked into English so an English-
 * locale CWS reviewer reads a coherent SERP, not a Cyrillic one.
 *
 * No `children` slot — the SERP itself is the foreground.
 */
export function SerpBackdropEN() {
  return (
    <div className="movar-backdrop-serp-en" lang="en">
      <style>{SERP_EN_CSS}</style>

      <div className="chrome">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <div className="urlbar">
          <span className="lock">🔒</span>
          <span>
            vector.example/search?q=family+law+attorney+austin&amp;
            <span className="hl">hl=en</span>
          </span>
        </div>
      </div>

      <div className="serp-head">
        <div className="brand">
          <span className="v" />
          ector
        </div>
        <div className="searchbox">
          <span className="magnifier">🔍</span>
          <span>family law attorney austin</span>
        </div>
      </div>

      <div className="results">
        <div className="stats">About 81,400 results · language: English</div>

        <div className="result">
          <p className="site">texasbar.example.org › directory</p>
          <h3>
            <a href="https://texasbar.example.org/directory">
              Find a Family Law Attorney — State Bar Directory
            </a>
          </h3>
          <p className="snippet">
            Search the official directory of practising <em>family law</em> attorneys serving
            <em> Austin</em> and surrounding Travis County. Filter by specialty, fee range and
            language &hellip;
          </p>
        </div>

        <div className="result">
          <p className="site">cypress-law.example › about</p>
          <h3>
            <a href="https://cypress-law.example/about">
              Cypress &amp; Reyes — <em>Family Law</em> in central <em>Austin</em>
            </a>
          </h3>
          <p className="snippet">
            Custody, divorce and adoption matters across the greater Austin area. First consultation
            by appointment &mdash; transparent flat-fee pricing for uncontested filings &hellip;
          </p>
        </div>

        <div className="result">
          <p className="site">atxlawyers.example</p>
          <h3>
            <a href="https://atxlawyers.example">ATX Lawyers — Young Attorneys Association</a>
          </h3>
          <p className="snippet">
            Free legal aid for residents of <em>Austin</em> and Travis County: housing disputes,
            employment conflicts, family proceedings, document preparation &hellip;
          </p>
        </div>

        <div className="result">
          <p className="site">law.example › articles</p>
          <h3>
            <a href="https://law.example/articles">
              How to choose a <em>family law attorney</em>: 7 questions to ask
            </a>
          </h3>
          <p className="snippet">
            What to bring to a first consultation, how to verify experience, where to read client
            reviews, and why bar-association membership matters &hellip;
          </p>
        </div>

        <div className="result">
          <p className="site">austin.gov.example › legal-aid</p>
          <h3>
            <a href="https://austin.gov.example/legal-aid">
              Free legal aid in <em>Austin</em> — public directory
            </a>
          </h3>
          <p className="snippet">
            List of secondary legal-aid centres serving Travis County, opening hours, on-call
            attorneys, and intake forms for income-qualified residents &hellip;
          </p>
        </div>
      </div>
    </div>
  );
}

const SERP_EN_CSS = `
  .movar-backdrop-serp-en {
    --bd-serp-en-bg: #ffffff;
    --bd-serp-en-ink: #1f2328;
    --bd-serp-en-ink-soft: #57606a;
    --bd-serp-en-ink-faint: #8c959f;
    --bd-serp-en-link: #1a5fb4;
    --bd-serp-en-rule: #e6e8eb;
    --bd-serp-en-chrome: #f3f4f6;
    --bd-serp-en-hl-bg: #fffbea;
    --bd-serp-en-hl-ink: #7c5b00;
    background: var(--bd-serp-en-bg);
    color: var(--bd-serp-en-ink);
    font: 14px/1.5 'Helvetica Neue', Arial, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-serp-en .chrome {
    background: var(--bd-serp-en-chrome);
    border-bottom: 1px solid var(--bd-serp-en-rule);
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-backdrop-serp-en .chrome .dots {
    display: flex;
    gap: 6px;
  }
  .movar-backdrop-serp-en .chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-backdrop-serp-en .urlbar {
    flex: 1;
    background: #fff;
    border: 1px solid var(--bd-serp-en-rule);
    border-radius: 999px;
    padding: 7px 16px;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--bd-serp-en-ink-soft);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .movar-backdrop-serp-en .urlbar .lock {
    color: var(--bd-serp-en-ink-faint);
  }
  .movar-backdrop-serp-en .urlbar .hl {
    background: var(--bd-serp-en-hl-bg);
    color: var(--bd-serp-en-hl-ink);
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }
  .movar-backdrop-serp-en .serp-head {
    max-width: 1180px;
    margin: 0 auto;
    padding: 20px 28px 14px;
    display: flex;
    align-items: center;
    gap: 24px;
    border-bottom: 1px solid var(--bd-serp-en-rule);
  }
  .movar-backdrop-serp-en .brand {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .movar-backdrop-serp-en .brand .v {
    display: inline-block;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--bd-serp-en-link);
    margin-right: 6px;
    vertical-align: -3px;
    position: relative;
  }
  .movar-backdrop-serp-en .brand .v::after {
    content: 'v';
    position: absolute;
    inset: 0;
    color: #fff;
    font-size: 16px;
    text-align: center;
    line-height: 22px;
    font-style: italic;
  }
  .movar-backdrop-serp-en .searchbox {
    flex: 1;
    max-width: 560px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid var(--bd-serp-en-rule);
    border-radius: 999px;
    font-size: 15px;
  }
  .movar-backdrop-serp-en .searchbox .magnifier {
    color: var(--bd-serp-en-ink-faint);
  }
  .movar-backdrop-serp-en .results {
    max-width: 680px;
    padding: 22px 28px 60px;
  }
  .movar-backdrop-serp-en .stats {
    font-size: 12px;
    color: var(--bd-serp-en-ink-faint);
    margin-bottom: 24px;
  }
  .movar-backdrop-serp-en .result {
    margin: 0 0 28px;
  }
  .movar-backdrop-serp-en .result .site {
    font-size: 13px;
    color: var(--bd-serp-en-ink-soft);
    margin: 0 0 2px;
  }
  .movar-backdrop-serp-en .result h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 0 0 4px;
    color: var(--bd-serp-en-link);
    letter-spacing: -0.005em;
  }
  .movar-backdrop-serp-en .result h3 a {
    color: inherit;
    text-decoration: none;
  }
  .movar-backdrop-serp-en .result .snippet {
    font-size: 14px;
    color: var(--bd-serp-en-ink-soft);
    margin: 0;
  }
  .movar-backdrop-serp-en .result em {
    background: #fff3a8;
    font-style: normal;
  }
`;
