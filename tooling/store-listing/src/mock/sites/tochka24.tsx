import type { JSX } from 'react';

/**
 * Tochka24 — fictitious home-services site (same brand as the storyboard
 * `site-*` backdrops), mobile layout.
 *
 * Contracts Movar reads here:
 *  - `/` is the Russian default and opens with a full-screen language gate
 *    (`position:fixed` backdrop, picker inside) that offers Українська and
 *    Русский, plus `<link rel="alternate" hreflang="uk">`. The redirect layer
 *    (hreflang, then picker) takes the visitor to `/uk/`.
 *  - `/uk/` declares `<html lang="uk">`, has no gate, and carries an on-site
 *    language menu (`#lang-menu`, toggled by `#lang-menu-button`) that lists
 *    Українська, English, Русский. The picker filter hides the Русский entry.
 */
export type SiteLang = 'ru' | 'uk' | 'en';

interface Copy {
  nav: readonly string[];
  login: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  features: readonly { title: string; body: string }[];
  menuLabel: string;
  badge: string;
}

export const COPY: Record<SiteLang, Copy> = {
  ru: {
    nav: ['Услуги', 'Цены', 'Помощь'],
    login: 'Войти',
    eyebrow: 'Сервис бытовых услуг',
    title: 'Освежите дом без лишних хлопот.',
    body: 'Уборка, мелкий ремонт, доставка — в одном приложении, с прозрачной ценой и фиксированным временем приезда мастера.',
    cta: 'Заказать мастера',
    features: [
      {
        title: 'Прозрачные цены',
        body: 'Цена видна до заказа. Без сюрпризов в чеке и без «по факту работ».',
      },
      {
        title: 'Время под контролем',
        body: 'Окно приезда — 30 минут. Если мастер задерживается, скидка автоматически.',
      },
      {
        title: 'Проверенные мастера',
        body: 'Все мастера с действующими документами и подтверждённым опытом.',
      },
    ],
    menuLabel: 'Язык: Русский',
    badge: 'RU',
  },
  uk: {
    nav: ['Послуги', 'Ціни', 'Допомога'],
    login: 'Увійти',
    eyebrow: 'Сервіс побутових послуг',
    title: 'Освіжіть дім без зайвих клопотів.',
    body: 'Прибирання, дрібний ремонт, доставка — в одному застосунку, з прозорою ціною та фіксованим часом приїзду майстра.',
    cta: 'Замовити майстра',
    features: [
      {
        title: 'Прозорі ціни',
        body: 'Ціну видно до замовлення. Без сюрпризів у чеку та без «по факту робіт».',
      },
      {
        title: 'Час під контролем',
        body: 'Вікно приїзду — 30 хвилин. Якщо майстер запізнюється, знижка автоматично.',
      },
      {
        title: 'Перевірені майстри',
        body: 'Усі майстри з чинними документами та підтвердженим досвідом.',
      },
    ],
    menuLabel: 'Мова: Українська',
    badge: 'UA',
  },
  en: {
    nav: ['Services', 'Pricing', 'Help'],
    login: 'Sign in',
    eyebrow: 'Home services',
    title: 'Refresh your home without the hassle.',
    body: 'Cleaning, small repairs, deliveries — one app, a fixed price, and a 30-minute arrival window for every booking.',
    cta: 'Book a pro',
    features: [
      {
        title: 'Up-front pricing',
        body: 'You see the total before you book. No surprises on the receipt.',
      },
      {
        title: 'Time you can plan around',
        body: 'A 30-minute arrival window. If the pro is late, the discount applies automatically.',
      },
      {
        title: 'Verified professionals',
        body: 'Every pro is background-checked, with current credentials and confirmed work history.',
      },
    ],
    menuLabel: 'Language: English',
    badge: 'EN',
  },
};

const ORIGIN = 'https://tochka24.example';

/** Path per language. Russian is the site default at the root. */
const LANG_PATH: Record<SiteLang, string> = { ru: '/', uk: '/uk/', en: '/en/' };

const CSS = `
  :root { --bg:#fff; --ink:#0f172a; --soft:#475569; --rule:#e2e8f0; --accent:#1d4ed8;
    --accent-soft:#eff6ff; --surface:#f8fafc; --on-accent:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b1220; --ink:#f1f5f9; --soft:#94a3b8; --rule:#1e293b; --accent:#60a5fa;
      --accent-soft:#16213a; --surface:#111a2e; --on-accent:#0b1220; }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  header { position: relative; display: flex; align-items: center; gap: 10px; padding: 14px 18px;
    border-bottom: 1px solid var(--rule); }
  .logo { font-weight: 800; font-size: 22px; letter-spacing: -0.02em; }
  .logo span { color: var(--accent); }
  .spacer { flex: 1; }
  #lang-menu-button { appearance: none; display: inline-flex; align-items: center; gap: 6px;
    height: 40px; padding: 0 12px; border: 1px solid var(--rule); border-radius: 10px; background: var(--bg);
    color: var(--ink); font: 600 14px/1 inherit; font-family: inherit; }
  #lang-menu-button svg { transition: transform .15s; }
  #lang-menu-button[aria-expanded='true'] svg { transform: rotate(180deg); }
  #lang-menu { display: none; position: absolute; right: 18px; top: 62px; z-index: 5; min-width: 210px;
    margin: 0; padding: 6px; list-style: none; background: var(--bg); border: 1px solid var(--rule);
    border-radius: 14px; box-shadow: 0 18px 40px rgba(15,23,42,.18); }
  #lang-menu.open { display: block; }
  #lang-menu a { display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 12px; border-radius: 9px; color: var(--ink); text-decoration: none; font-size: 16px; }
  #lang-menu a[aria-current='true'] { background: var(--accent-soft); font-weight: 600; }
  #lang-menu a .code { font-size: 12px; color: var(--soft); letter-spacing: .04em; }
  .hero { padding: 36px 20px 24px; }
  .eyebrow { display: inline-block; font-size: 13px; font-weight: 600; color: var(--accent); margin-bottom: 12px; }
  h1 { margin: 0 0 14px; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; }
  .hero p { margin: 0 0 24px; color: var(--soft); font-size: 17px; }
  .cta { display: inline-block; padding: 14px 24px; border-radius: 12px; background: var(--accent);
    color: var(--on-accent); font-weight: 600; text-decoration: none; }
  .nav { display: flex; gap: 22px; padding: 14px 20px 0; font-size: 14px; color: var(--soft); }
  .art { margin: 22px 20px 0; height: 150px; border-radius: 18px;
    background: radial-gradient(120px 90px at 82% 30%, rgba(255,255,255,.55), transparent 70%),
      linear-gradient(135deg, #1d4ed8 0%, #38bdf8 100%); position: relative; overflow: hidden; }
  .art i { position: absolute; border-radius: 14px; background: rgba(255,255,255,.2); }
  .features { display: grid; gap: 14px; padding: 26px 20px 48px; }
  .feature { padding: 18px 18px 16px; border: 1px solid var(--rule); border-radius: 16px; background: var(--surface); }
  .feature h3 { margin: 0 0 6px; font-size: 17px; letter-spacing: -0.01em; }
  .feature p { margin: 0; font-size: 15px; color: var(--soft); }
  /* Language gate: a full-viewport blocking overlay (Movar's gate geometry test
     wants position:fixed covering >=75% of both axes). */
  /* Dimmed, never blurred, and the panel near the top: the listing's before shot
     shows the upper half of the page, and the modal is the point of that shot. */
  #language-gate { position: fixed; inset: 0; z-index: 100; display: grid; place-items: start center;
    background: rgba(15,23,42,.45); padding: 72px 20px 20px; }
  #language-gate .panel { width: 100%; max-width: 400px; background: var(--bg); border-radius: 22px;
    padding: 26px 22px 22px; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
  #language-gate h2 { margin: 0 0 4px; font-size: 22px; letter-spacing: -0.01em; }
  #language-gate p { margin: 0 0 18px; color: var(--soft); font-size: 15px; }
  #language-gate .choices { display: grid; gap: 10px; }
  #language-gate a { display: flex; align-items: center; justify-content: space-between; padding: 15px 16px;
    border: 1px solid var(--rule); border-radius: 14px; color: var(--ink); text-decoration: none;
    font-weight: 600; font-size: 17px; background: var(--surface); }
  #language-gate a .code { font-size: 12px; font-weight: 500; color: var(--soft); letter-spacing: .05em; }
`;

const MENU_SCRIPT = `
  (function () {
    var b = document.getElementById('lang-menu-button');
    var m = document.getElementById('lang-menu');
    if (!b || !m) return;
    b.addEventListener('click', function () {
      var open = m.classList.toggle('open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  })();
`;

function Chevron(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const MENU_ENTRIES: readonly { lang: SiteLang; label: string; code: string }[] = [
  { lang: 'uk', label: 'Українська', code: 'UK' },
  { lang: 'en', label: 'English', code: 'EN' },
  { lang: 'ru', label: 'Русский', code: 'RU' },
];

export interface Tochka24Props {
  lang: SiteLang;
  /** Show the blocking language-choice modal (the Russian default page only). */
  gate?: boolean;
}

/** Head markup as a string (rendered by pages.ts into a hand-built document, so
 *  React never has to hoist title/link tags). */
export function tochka24HeadHtml(lang: SiteLang): string {
  const alt = (l: SiteLang): string =>
    `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${LANG_PATH[l]}">`;
  return [
    `<link rel="canonical" href="${ORIGIN}${LANG_PATH[lang]}">`,
    alt('uk'),
    alt('ru'),
    alt('en'),
  ].join('');
}

export function Tochka24({ lang, gate = false }: Readonly<Tochka24Props>): JSX.Element {
  const c = COPY[lang];
  return (
    <>
      <style>{CSS}</style>
      <header>
        <div className="logo">
          tochka<span>24</span>
        </div>
        <div className="spacer" />
        {gate ? null : (
          <>
            <button
              type="button"
              id="lang-menu-button"
              aria-label={c.menuLabel}
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="lang-menu"
            >
              {c.badge}
              <Chevron />
            </button>
            <ul id="lang-menu" aria-label={c.menuLabel}>
              {MENU_ENTRIES.map((e) => (
                <li key={e.lang}>
                  <a
                    href={`${ORIGIN}${LANG_PATH[e.lang]}`}
                    hrefLang={e.lang}
                    lang={e.lang}
                    aria-current={e.lang === lang ? 'true' : undefined}
                  >
                    <span>{e.label}</span>
                    <span className="code">{e.code}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </header>
      <nav className="nav" aria-label="Menu">
        {c.nav.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </nav>
      <section className="hero">
        <span className="eyebrow">{c.eyebrow}</span>
        <h1>{c.title}</h1>
        <p>{c.body}</p>
        <a className="cta" href={`${ORIGIN}/order`}>
          {c.cta} →
        </a>
      </section>
      <div className="art" aria-hidden="true">
        <i style={{ left: 22, top: 26, width: 96, height: 58 }} />
        <i style={{ left: 130, top: 60, width: 120, height: 64 }} />
        <i style={{ right: 20, top: 18, width: 60, height: 60 }} />
      </div>
      <section className="features">
        {c.features.map((f) => (
          <div className="feature" key={f.title}>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>
      {gate ? (
        <div
          id="language-gate"
          role="dialog"
          aria-modal="true"
          aria-label="Оберіть мову / Выберите язык"
        >
          <div className="panel">
            <h2>Оберіть мову / Выберите язык</h2>
            <p>Мову можна змінити пізніше / Язык можно изменить позже</p>
            <div className="choices">
              <a href={`${ORIGIN}${LANG_PATH.uk}`} hrefLang="uk" lang="uk">
                <span>Українська</span>
                <span className="code">UK</span>
              </a>
              <a href={`${ORIGIN}${LANG_PATH.ru}`} hrefLang="ru" lang="ru">
                <span>Русский</span>
                <span className="code">RU</span>
              </a>
            </div>
          </div>
        </div>
      ) : (
        <script dangerouslySetInnerHTML={{ __html: MENU_SCRIPT }} />
      )}
    </>
  );
}
