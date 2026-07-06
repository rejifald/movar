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
  tablet = false,
}: {
  children?: ReactNode;
  /** Tablet layout — a full-width iPad composition (rendered at the 1024 iPad
   *  logical width, then scaled 2×): a roomier masthead + nav, a wider reading
   *  measure, and a larger type scale, so the article reads as a real tablet
   *  site instead of a magnified phone. The landscape/iPhone scenes leave it
   *  off (their ~1280 desktop composition already fits). */
  tablet?: boolean;
}) {
  return (
    <div className={cn('movar-backdrop-news-uk', tablet && 'is-tablet')} lang="uk">
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

  /* Tablet layout — rendered at the 1024 iPad logical width, then scaled 2× by
   * the frame. A full-width masthead with a roomier nav, a wider reading measure,
   * and a larger type scale so the article fills the tablet canvas as a real
   * tablet site rather than a magnified phone. */
  .movar-backdrop-news-uk.is-tablet {
    font-size: 20px;
    line-height: 1.62;
  }
  .movar-backdrop-news-uk.is-tablet .masthead {
    padding: 30px 56px 26px;
  }
  .movar-backdrop-news-uk.is-tablet .brand {
    font-size: 40px;
    white-space: nowrap;
  }
  .movar-backdrop-news-uk.is-tablet nav.top {
    font-size: 15px;
    gap: 30px;
    letter-spacing: 0.12em;
    flex-wrap: nowrap;
    white-space: nowrap;
  }
  .movar-backdrop-news-uk.is-tablet article {
    max-width: 900px;
    margin: 76px auto 72px;
    padding: 0 72px;
  }
  .movar-backdrop-news-uk.is-tablet .category {
    font-size: 15px;
    letter-spacing: 0.18em;
  }
  .movar-backdrop-news-uk.is-tablet h1 {
    font-size: 60px;
    line-height: 1.08;
    margin: 18px 0 20px;
  }
  .movar-backdrop-news-uk.is-tablet .subhead {
    font-size: 27px;
    margin: 0 0 30px;
  }
  .movar-backdrop-news-uk.is-tablet .byline {
    font-size: 17px;
    padding-bottom: 20px;
    margin-bottom: 34px;
  }
  .movar-backdrop-news-uk.is-tablet article p {
    margin: 0 0 24px;
  }
  .movar-backdrop-news-uk.is-tablet p.lead::first-letter {
    font-size: 92px;
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
