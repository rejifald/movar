import type { ReactNode } from 'react';
import { cn } from '@movar/ui';

/**
 * Fictitious Ukrainian news article — *Світанок*. Backdrop for the
 * "popup on a news page" screenshot (scene #1). Ported 1:1 from the
 * retired `news.html` storyboard with two scoping changes:
 *
 *   - The original CSS variables were declared on `:root` (`--paper`,
 *     `--ink`, …); they're moved onto `.movar-backdrop-news-uk` and
 *     renamed `--bd-news-*` so they don't override `@movar/ui`'s
 *     tokens.css inside the popup overlay that this backdrop hosts.
 *   - The `<iframe src="…/popup.html">` slot in the original is replaced
 *     by a React `{children}` slot — the production popup component is
 *     composed in by the story (see `stories/popup-on-news.stories.tsx`).
 *
 * Everything else — the masthead, the headline, the lead paragraph, the
 * decorative drop-cap colour — is character-for-character what shipped in
 * `news.html`. The retired HTML is the visual source of truth; if this
 * file drifts from it, the storyboard plan was for nothing.
 */
export function NewsBackdropUK({
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
    <div className={cn('movar-backdrop-news-uk', large && 'is-large')} lang="uk">
      <style>{NEWS_UK_CSS}</style>

      <header className="masthead">
        <div className="brand">
          світанок<span className="dot">.</span>
        </div>
        <nav className="top">
          <span>Стрічка</span>
          <span>Думки</span>
          <span>Культура</span>
          <span>Технології</span>
          <span>Бізнес</span>
        </nav>
      </header>

      <article>
        <div className="category">Думки · Інтернет</div>
        <h1>Як аналітика вирішує, що ви прочитаєте — навіть якщо ви вибрали інакше</h1>
        <p className="subhead">
          Маленькі рішення формують велику картину. Що ваш браузер шепоче сайтам — і чому вони не
          слухають.
        </p>
        <div className="byline">
          <strong>Олена Скиба</strong> · 27 травня 2026 · 6 хвилин читання
        </div>

        <p className="lead">
          Кожен наш вибір у мережі — пошуковий запит, відкрита стаття, прокручений стрічковий рядок
          — додає крапельку у статистику, яку потім зчитують власники сайтів. Якщо мільйон людей
          сьогодні відкрили сторінку російською тільки тому, що сайт показав її першою, завтра цих
          сторінок буде більше, а українських — менше. Аналітика читається буквально, а не як
          справжній вибір читача.
        </p>

        <p>
          Браузер кожного запиту повідомляє сайтам, якою мовою ви хотіли б отримати відповідь. Сайт
          сам вирішує, чи прислуховуватись, — і дуже часто не прислухається. Просто заходить у
          журнал і помічає, що минулого тижня більшість читачів все одно перейшли на російську
          версію. Висновок: значить, такою і треба показувати. Логіка крутиться по колу: дефолт
          формує статистику, статистика підтверджує дефолт.
        </p>

        <p>
          Технічний бік такої «м&apos;якої» дискримінації лежить тонкою плівкою на майже кожній
          бізнес-моделі: швидше показати знайому версію — менше натискань, довша сесія, кращі
          рекламні показники. Жодного злого наміру; просто оптимізація з пастками.
        </p>

        <p>
          Вихід не складний. Браузер і так повідомляє мови читача у кожному запиті; сайту достатньо
          шанувати цей порядок, перш ніж зазирати у власні середні. Перевага — не таємниця, яку
          треба вгадувати: вона прямо вказана в заголовках, а потім тихо ігнорується.
        </p>

        <p>
          Для цього не треба ані вгадувати наміри, ані стежити за кимось. Вибір уже є в запиті —
          бракує лише чогось на боці читача, що не дасть застарілій статистиці його перекреслити,
          сторінка за сторінкою, доки мережа не стане тією, яку читач справді просив.
        </p>
      </article>

      {children === undefined ? null : <div className="popup-slot">{children}</div>}
    </div>
  );
}

const NEWS_UK_CSS = `
  .movar-backdrop-news-uk {
    --bd-news-paper: #f8f5ee;
    --bd-news-ink: #1a1612;
    --bd-news-ink-soft: #4f463a;
    --bd-news-rule: #d8d0bd;
    --bd-news-tag: #8c2b1a;
    background: var(--bd-news-paper);
    color: var(--bd-news-ink);
    font: 17px/1.6 Georgia, 'Times New Roman', serif;
    min-height: 100vh;
  }
  .movar-backdrop-news-uk .masthead {
    border-bottom: 1px solid var(--bd-news-rule);
    padding: 22px 64px 18px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .movar-backdrop-news-uk .brand {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: lowercase;
  }
  .movar-backdrop-news-uk .brand .dot {
    color: var(--bd-news-tag);
  }
  .movar-backdrop-news-uk nav.top {
    display: flex;
    gap: 24px;
    font: 600 12px/1 'Helvetica Neue', Arial, sans-serif;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--bd-news-ink-soft);
  }
  .movar-backdrop-news-uk article {
    max-width: 720px;
    margin: 48px auto 64px;
    padding: 0 64px;
  }
  .movar-backdrop-news-uk .category {
    font: 700 11px/1 'Helvetica Neue', Arial, sans-serif;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--bd-news-tag);
  }
  .movar-backdrop-news-uk h1 {
    font-size: 44px;
    line-height: 1.12;
    margin: 14px 0 16px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-news-uk .subhead {
    font-size: 21px;
    line-height: 1.4;
    color: var(--bd-news-ink-soft);
    font-style: italic;
    margin: 0 0 26px;
  }
  .movar-backdrop-news-uk .byline {
    font: 13px/1.4 'Helvetica Neue', Arial, sans-serif;
    color: var(--bd-news-ink-soft);
    padding-bottom: 16px;
    border-bottom: 1px solid var(--bd-news-rule);
    margin-bottom: 28px;
  }
  .movar-backdrop-news-uk .byline strong {
    color: var(--bd-news-ink);
    font-weight: 600;
  }
  .movar-backdrop-news-uk article p {
    margin: 0 0 20px;
  }
  .movar-backdrop-news-uk p.lead::first-letter {
    font-size: 64px;
    float: left;
    line-height: 0.9;
    padding: 6px 10px 0 0;
    color: var(--bd-news-tag);
    font-weight: 700;
  }

  /* Large-type variant (~1.9×) for the narrow iPad side-by-side column. Only the
   * type scales; the layout widths stay so the article just wraps to more lines
   * and fills the taller column. */
  .movar-backdrop-news-uk.is-large {
    font-size: 32px;
    line-height: 1.55;
  }
  .movar-backdrop-news-uk.is-large .brand {
    font-size: 52px;
  }
  .movar-backdrop-news-uk.is-large nav.top {
    font-size: 19px;
    gap: 34px;
  }
  .movar-backdrop-news-uk.is-large .category {
    font-size: 18px;
  }
  .movar-backdrop-news-uk.is-large h1 {
    font-size: 74px;
  }
  .movar-backdrop-news-uk.is-large .subhead {
    font-size: 36px;
  }
  .movar-backdrop-news-uk.is-large .byline {
    font-size: 22px;
  }
  .movar-backdrop-news-uk.is-large article {
    margin-top: 60px;
  }
  .movar-backdrop-news-uk.is-large p.lead::first-letter {
    font-size: 108px;
  }
  .movar-backdrop-news-uk .popup-slot {
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
