/**
 * Fictitious search engine — *Vector* — serving Ukrainian results with
 * `?hl=uk` highlighted in the URL bar. Backdrop for the
 * search-rewrite screenshot (scene #4). Ported 1:1 from the retired
 * `serp.html` storyboard.
 *
 * No `children` slot — the SERP itself is the foreground; the Movar
 * popup isn't composited over this scene. The story shows the user-
 * visible result of Movar's search rewrite (Ukrainian results, `hl=uk`
 * in the URL bar) rather than the popup that drove it.
 */
export function SerpBackdropUK() {
  return (
    <div className="movar-backdrop-serp-uk" lang="uk">
      <style>{SERP_UK_CSS}</style>

      <div className="chrome">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <div className="urlbar">
          <span className="lock">🔒</span>
          <span>
            vector.example/search?q=адвокат+у+Львові&amp;<span className="hl">hl=uk</span>
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
          <span>адвокат у Львові</span>
        </div>
      </div>

      <div className="results">
        <div className="stats">Близько 47 200 результатів · мова: українська</div>

        <div className="result">
          <p className="site">sau.example.org › katalog</p>
          <h3>
            <a href="https://sau.example.org/katalog">
              Каталог адвокатів — Спілка адвокатів України
            </a>
          </h3>
          <p className="snippet">
            Офіційний реєстр практикуючих <em>адвокатів</em> у Львівській області. Пошук за
            спеціалізацією, мовою та районом міста …
          </p>
        </div>

        <div className="result">
          <p className="site">maletskyy-law.example › about</p>
          <h3>
            <a href="https://maletskyy-law.example/about">
              Адвокатське бюро у Львові — 12 років практики
            </a>
          </h3>
          <p className="snippet">
            Сімейні справи, спадкові спори, господарські суперечки. Перша консультація у{' '}
            <em>Львові</em> — безкоштовно, прийом за попереднім записом …
          </p>
        </div>

        <div className="result">
          <p className="site">lvivlawyers.example</p>
          <h3>
            <a href="https://lvivlawyers.example">ЛьвівЮрист — асоціація молодих адвокатів</a>
          </h3>
          <p className="snippet">
            Безкоштовна правова допомога мешканцям <em>Львова</em> та області: соціальні справи,
            трудові конфлікти, оформлення документів …
          </p>
        </div>

        <div className="result">
          <p className="site">pravo.example › articles</p>
          <h3>
            <a href="https://pravo.example/articles">
              Як обрати <em>адвоката</em>: 7 порад від практиків
            </a>
          </h3>
          <p className="snippet">
            Що питати на першій консультації, як перевірити досвід, де читати відгуки клієнтів і
            чому варто перевіряти членство в палаті …
          </p>
        </div>

        <div className="result">
          <p className="site">lviv.gov.example › besplatna-dopomoga</p>
          <h3>
            <a href="https://lviv.gov.example/besplatna-dopomoga">
              Безкоштовна правова допомога у Львові — реєстр
            </a>
          </h3>
          <p className="snippet">
            Перелік центрів безкоштовної вторинної правової допомоги у Львівській області, години
            прийому, телефони чергових <em>адвокатів</em> …
          </p>
        </div>
      </div>
    </div>
  );
}

const SERP_UK_CSS = `
  .movar-backdrop-serp-uk {
    --bd-serp-bg: #ffffff;
    --bd-serp-ink: #1f2328;
    --bd-serp-ink-soft: #57606a;
    --bd-serp-ink-faint: #8c959f;
    --bd-serp-link: #1a5fb4;
    --bd-serp-link-visited: #6f4ca5;
    --bd-serp-rule: #e6e8eb;
    --bd-serp-chrome: #f3f4f6;
    --bd-serp-hl-bg: #fffbea;
    --bd-serp-hl-ink: #7c5b00;
    background: var(--bd-serp-bg);
    color: var(--bd-serp-ink);
    font: 14px/1.5 'Helvetica Neue', Arial, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-serp-uk .chrome {
    background: var(--bd-serp-chrome);
    border-bottom: 1px solid var(--bd-serp-rule);
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-backdrop-serp-uk .chrome .dots {
    display: flex;
    gap: 6px;
  }
  .movar-backdrop-serp-uk .chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-backdrop-serp-uk .urlbar {
    flex: 1;
    background: #fff;
    border: 1px solid var(--bd-serp-rule);
    border-radius: 999px;
    padding: 7px 16px;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--bd-serp-ink-soft);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .movar-backdrop-serp-uk .urlbar .lock {
    color: var(--bd-serp-ink-faint);
  }
  .movar-backdrop-serp-uk .urlbar .hl {
    background: var(--bd-serp-hl-bg);
    color: var(--bd-serp-hl-ink);
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }
  .movar-backdrop-serp-uk .serp-head {
    max-width: 1180px;
    margin: 0 auto;
    padding: 20px 28px 14px;
    display: flex;
    align-items: center;
    gap: 24px;
    border-bottom: 1px solid var(--bd-serp-rule);
  }
  .movar-backdrop-serp-uk .brand {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .movar-backdrop-serp-uk .brand .v {
    display: inline-block;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--bd-serp-link);
    margin-right: 6px;
    vertical-align: -3px;
    position: relative;
  }
  .movar-backdrop-serp-uk .brand .v::after {
    content: 'v';
    position: absolute;
    inset: 0;
    color: #fff;
    font-size: 16px;
    text-align: center;
    line-height: 22px;
    font-style: italic;
  }
  .movar-backdrop-serp-uk .searchbox {
    flex: 1;
    max-width: 560px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: 1px solid var(--bd-serp-rule);
    border-radius: 999px;
    font-size: 15px;
  }
  .movar-backdrop-serp-uk .searchbox .magnifier {
    color: var(--bd-serp-ink-faint);
  }
  .movar-backdrop-serp-uk .results {
    max-width: 680px;
    padding: 22px 28px 60px;
  }
  .movar-backdrop-serp-uk .stats {
    font-size: 12px;
    color: var(--bd-serp-ink-faint);
    margin-bottom: 24px;
  }
  .movar-backdrop-serp-uk .result {
    margin: 0 0 28px;
  }
  .movar-backdrop-serp-uk .result .site {
    font-size: 13px;
    color: var(--bd-serp-ink-soft);
    margin: 0 0 2px;
  }
  .movar-backdrop-serp-uk .result h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 0 0 4px;
    color: var(--bd-serp-link);
    letter-spacing: -0.005em;
  }
  .movar-backdrop-serp-uk .result h3 a {
    color: inherit;
    text-decoration: none;
  }
  .movar-backdrop-serp-uk .result .snippet {
    font-size: 14px;
    color: var(--bd-serp-ink-soft);
    margin: 0;
  }
  .movar-backdrop-serp-uk .result em {
    background: #fff3a8;
    font-style: normal;
  }
`;
