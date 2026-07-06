import type { JSX } from 'react';
import { cn } from '@movar/ui';

/**
 * Shared layout for the *Voya* travel-booking mock — the brand used in
 * both halves of the language-dialog diptych (marketplace scene #4).
 * The site is editorial illustration: it's not a real booking platform
 * and the search form is decorative (no functional inputs). What
 * matters is that the page reads as "a generic international site
 * with a region/language prompt on first visit."
 *
 * Both halves render the same site frame; the Before half passes a
 * `dialog` prop and the After half omits it. That mirrors what Movar
 * actually does on sites with locale dialogs: setting Accept-Language
 * upfront means the site recognises the preferred language and skips
 * the modal entirely.
 *
 * CSS variables stay prefixed `--bd-voya-*` so they don't leak into
 * other backdrops' palettes when both are present in the same DOM.
 */

export interface VoyaSiteContent {
  /** `lang` attribute on the wrapping div. Drives screen-reader
   *  pronunciation and CSS `:lang(…)` selectors if any exist. */
  lang: string;
  /** Labels for the four primary nav items. Order = render order. */
  nav: readonly [string, string, string, string];
  /** "Sign in" CTA label in the header. */
  loginLabel: string;
  hero: {
    /** Big hero headline above the search form. */
    title: string;
    /** Smaller line under the title. */
    subtitle: string;
    /** Decorative search-form field labels. Three columns:
     *  destination, check-in date, check-out date. */
    fields: { from: string; checkIn: string; checkOut: string };
    /** Primary search CTA. */
    cta: string;
  };
  /** Three featured deal cards under the hero. */
  deals: readonly [
    { city: string; tagline: string; price: string },
    { city: string; tagline: string; price: string },
    { city: string; tagline: string; price: string },
  ];
}

export interface VoyaDialogContent {
  /** Modal headline — typically "Choose your language" /
   *  "Виберіть мову". */
  title: string;
  /** Short paragraph under the title explaining why the dialog is
   *  there. Optional. */
  intro: string;
  /** Language options the user can pick. Order = render order.
   *  `selected: true` highlights one entry as the default. */
  languages: readonly { code: string; name: string; flag: string; selected?: boolean }[];
  /** Primary action label, e.g. "Continue" / "Продовжити". */
  continueLabel: string;
}

interface VoyaBackdropProps {
  content: VoyaSiteContent;
  /** When present, renders a centered language-selection modal over
   *  the site with a dim backdrop. The dialog's strings are passed
   *  here verbatim — typically in the same language the site itself
   *  is currently rendered in (Russian for the without-Movar half).
   */
  dialog?: VoyaDialogContent;
}

export function VoyaBackdrop({ content, dialog }: VoyaBackdropProps): JSX.Element {
  return (
    <div className="movar-backdrop-voya" lang={content.lang}>
      <style>{VOYA_CSS}</style>

      <header>
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          voya
        </div>
        <nav>
          {content.nav.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </nav>
        <button type="button" className="cta-secondary">
          {content.loginLabel}
        </button>
      </header>

      <section className="hero">
        <h1>{content.hero.title}</h1>
        <p className="lede">{content.hero.subtitle}</p>

        <div className="search">
          <div className="search__field">
            <span className="search__label">{content.hero.fields.from}</span>
            <span className="search__input" />
          </div>
          <div className="search__field">
            <span className="search__label">{content.hero.fields.checkIn}</span>
            <span className="search__input" />
          </div>
          <div className="search__field">
            <span className="search__label">{content.hero.fields.checkOut}</span>
            <span className="search__input" />
          </div>
          <button type="button" className="cta-primary">
            {content.hero.cta}
          </button>
        </div>
      </section>

      <section className="deals">
        {content.deals.map((deal) => (
          <article className="deal" key={deal.city}>
            <div className="deal__photo" aria-hidden="true" />
            <h3>{deal.city}</h3>
            <p className="deal__tagline">{deal.tagline}</p>
            <p className="deal__price">{deal.price}</p>
          </article>
        ))}
      </section>

      {dialog === undefined ? null : <LanguageDialog content={dialog} />}
    </div>
  );
}

function LanguageDialog({ content }: { content: VoyaDialogContent }): JSX.Element {
  return (
    <div className="lang-dialog-overlay" role="dialog" aria-modal="true">
      <div className="lang-dialog">
        <h2 className="lang-dialog__title">{content.title}</h2>
        <p className="lang-dialog__intro">{content.intro}</p>
        <ul className="lang-dialog__list">
          {content.languages.map((lang) => (
            <li key={lang.code} className={cn('lang-dialog__item', lang.selected && 'selected')}>
              <span className="lang-dialog__flag" aria-hidden="true">
                {lang.flag}
              </span>
              <span className="lang-dialog__lang-name">{lang.name}</span>
              {lang.selected ? <span className="lang-dialog__check">✓</span> : null}
            </li>
          ))}
        </ul>
        <button type="button" className="lang-dialog__cta">
          {content.continueLabel}
        </button>
      </div>
    </div>
  );
}

const VOYA_CSS = `
  .movar-backdrop-voya {
    --bd-voya-bg: #f0f4f8;
    --bd-voya-surface: #ffffff;
    --bd-voya-ink: #0b1727;
    --bd-voya-ink-soft: #4a5b73;
    --bd-voya-ink-faint: #8090a4;
    --bd-voya-border: #dde4ec;
    --bd-voya-accent: #0e7490;
    --bd-voya-accent-strong: #0a5a72;
    --bd-voya-accent-soft: #e0f2f7;
    position: relative;
    background: var(--bd-voya-bg);
    color: var(--bd-voya-ink);
    font: 15px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    overflow: hidden;
  }
  .movar-backdrop-voya header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 48px;
    background: var(--bd-voya-surface);
    border-bottom: 1px solid var(--bd-voya-border);
  }
  .movar-backdrop-voya .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--bd-voya-accent);
  }
  .movar-backdrop-voya .brand__mark {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background:
      linear-gradient(135deg, var(--bd-voya-accent) 0%, var(--bd-voya-accent-strong) 100%);
    position: relative;
  }
  .movar-backdrop-voya .brand__mark::after {
    content: '';
    position: absolute;
    inset: 6px;
    border: 2px solid #fff;
    border-radius: 3px;
    transform: rotate(-15deg);
  }
  .movar-backdrop-voya nav {
    display: flex;
    gap: 28px;
    font-size: 14px;
    color: var(--bd-voya-ink-soft);
  }
  .movar-backdrop-voya .cta-secondary {
    padding: 8px 18px;
    border: 1px solid var(--bd-voya-border);
    border-radius: 8px;
    background: transparent;
    color: var(--bd-voya-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: default;
  }
  .movar-backdrop-voya .hero {
    max-width: 1120px;
    margin: 0 auto;
    padding: 56px 48px 32px;
    text-align: center;
  }
  /* min-height carves out enough room for the longest Cyrillic
     wrap (two lines at 38px × 1.15) so all three locale variants —
     RU / UK / EN — reserve the same vertical slot for the hero
     title. Without it, shorter EN titles would let the search form
     ride up on the page and the two halves of the diptych would
     align differently. */
  .movar-backdrop-voya .hero h1 {
    font-size: 38px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin: 0 0 12px;
    color: var(--bd-voya-ink);
    min-height: calc(38px * 1.15 * 2);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Same trick for the lede — locks the row to two lines so the
     search form below sits at the same Y across locales. */
  .movar-backdrop-voya .lede {
    font-size: 17px;
    line-height: 1.5;
    color: var(--bd-voya-ink-soft);
    margin: 0 auto 28px;
    max-width: 580px;
    min-height: calc(17px * 1.5 * 2);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .movar-backdrop-voya .search {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr auto;
    gap: 10px;
    padding: 12px;
    background: var(--bd-voya-surface);
    border: 1px solid var(--bd-voya-border);
    border-radius: 14px;
    align-items: stretch;
    box-shadow: 0 12px 32px -18px rgba(15, 23, 42, 0.18);
  }
  .movar-backdrop-voya .search__field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 16px;
    border-radius: 8px;
    background: var(--bd-voya-bg);
  }
  .movar-backdrop-voya .search__label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--bd-voya-ink-faint);
    font-weight: 600;
  }
  .movar-backdrop-voya .search__input {
    width: 80%;
    height: 14px;
    background: var(--bd-voya-border);
    border-radius: 4px;
  }
  .movar-backdrop-voya .cta-primary {
    padding: 0 28px;
    border: 0;
    border-radius: 10px;
    background: var(--bd-voya-accent);
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: default;
    white-space: nowrap;
  }
  .movar-backdrop-voya .deals {
    max-width: 1120px;
    margin: 0 auto;
    padding: 24px 48px 56px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .movar-backdrop-voya .deal {
    background: var(--bd-voya-surface);
    border: 1px solid var(--bd-voya-border);
    border-radius: 14px;
    overflow: hidden;
    padding-bottom: 16px;
  }
  .movar-backdrop-voya .deal__photo {
    aspect-ratio: 16/10;
    background:
      linear-gradient(140deg, var(--bd-voya-accent-soft) 0%, #c2dfe6 60%, var(--bd-voya-accent) 140%);
  }
  .movar-backdrop-voya .deal h3 {
    font-size: 17px;
    margin: 14px 18px 4px;
    letter-spacing: -0.01em;
    min-height: calc(17px * 1.2);
  }
  /* Reserve room for the tagline whether it wraps to 1 line (EN
     "Beach and Gaudí architecture") or 2 (RU "Гастрономический
     уикенд" at narrower glyph widths). Keeps the price line on the
     same baseline across locales. */
  .movar-backdrop-voya .deal__tagline {
    font-size: 13px;
    line-height: 1.4;
    color: var(--bd-voya-ink-soft);
    margin: 0 18px 8px;
    min-height: calc(13px * 1.4 * 2);
  }
  .movar-backdrop-voya .deal__price {
    font-size: 14px;
    font-weight: 700;
    color: var(--bd-voya-accent);
    margin: 0 18px;
  }

  /* Language-selection modal — sits on top of the site, dims the
     background. Sized and styled to feel like a typical international
     site's first-visit language prompt. */
  .movar-backdrop-voya .lang-dialog-overlay {
    position: absolute;
    inset: 0;
    background: rgba(11, 23, 39, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    z-index: 10;
  }
  .movar-backdrop-voya .lang-dialog {
    width: 100%;
    max-width: 440px;
    background: var(--bd-voya-surface);
    border-radius: 16px;
    padding: 28px 28px 24px;
    box-shadow: 0 30px 72px -16px rgba(11, 23, 39, 0.45);
  }
  .movar-backdrop-voya .lang-dialog__title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0 0 8px;
  }
  .movar-backdrop-voya .lang-dialog__intro {
    font-size: 14px;
    color: var(--bd-voya-ink-soft);
    margin: 0 0 18px;
    line-height: 1.5;
  }
  .movar-backdrop-voya .lang-dialog__list {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .movar-backdrop-voya .lang-dialog__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 15px;
    color: var(--bd-voya-ink);
  }
  .movar-backdrop-voya .lang-dialog__item.selected {
    background: var(--bd-voya-accent-soft);
    font-weight: 600;
  }
  .movar-backdrop-voya .lang-dialog__flag {
    font-size: 18px;
  }
  .movar-backdrop-voya .lang-dialog__lang-name {
    flex: 1;
  }
  .movar-backdrop-voya .lang-dialog__check {
    color: var(--bd-voya-accent);
    font-weight: 700;
  }
  .movar-backdrop-voya .lang-dialog__cta {
    width: 100%;
    padding: 12px 16px;
    border: 0;
    border-radius: 10px;
    background: var(--bd-voya-accent);
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: default;
  }

  /* ── Phone tier — mobile header, single-column hero / search / deals, and
     the language modal pinned near the top so it stays inside the diptych's
     clip window (a vertically-centred modal would fall below the fold at the
     denser phone zoom). */
  .movar-device-phone .movar-backdrop-voya header {
    padding: 14px 20px;
  }
  .movar-device-phone .movar-backdrop-voya nav {
    display: none;
  }
  .movar-device-phone .movar-backdrop-voya .hero {
    max-width: none;
    padding: 26px 20px 24px;
  }
  .movar-device-phone .movar-backdrop-voya .hero h1 {
    font-size: 28px;
    min-height: 0;
  }
  .movar-device-phone .movar-backdrop-voya .lede {
    font-size: 15px;
    max-width: none;
    min-height: 0;
    margin-bottom: 20px;
  }
  .movar-device-phone .movar-backdrop-voya .search {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .movar-device-phone .movar-backdrop-voya .deals {
    max-width: none;
    grid-template-columns: 1fr;
    padding: 20px 20px 40px;
    gap: 14px;
  }
  .movar-device-phone .movar-backdrop-voya .lang-dialog-overlay {
    align-items: flex-start;
    padding: 70px 24px 24px;
  }
  .movar-device-phone .movar-backdrop-voya .lang-dialog {
    max-width: none;
  }

  /* ── Tablet tier — nav stays; roomier hero; modal pinned a little lower. */
  .movar-device-tablet .movar-backdrop-voya header {
    padding: 18px 40px;
  }
  .movar-device-tablet .movar-backdrop-voya .hero {
    max-width: none;
    padding: 44px 40px 28px;
  }
  .movar-device-tablet .movar-backdrop-voya .deals {
    max-width: none;
    padding: 24px 40px 56px;
  }
  .movar-device-tablet .movar-backdrop-voya .lang-dialog-overlay {
    align-items: flex-start;
    padding-top: 120px;
  }
`;

/** Per-locale option lists shown in the language-selection modal.
 *  Each story's Before half passes the option that matches the
 *  story's preferred locale; the dialog ends up with exactly two
 *  choices — the blocked Russian default (currently selected) and
 *  the user's preferred locale. The narrative is "Movar's blocked
 *  language vs. what the user actually wants"; a list of 5+ options
 *  buries the binary the diptych is selling. */
const RU_OPTION: VoyaDialogContent['languages'][number] = {
  code: 'ru',
  flag: '🇷🇺',
  name: 'Русский',
  selected: true,
};
const EN_OPTION: VoyaDialogContent['languages'][number] = {
  code: 'en',
  flag: '🇬🇧',
  name: 'English',
};
const UK_OPTION: VoyaDialogContent['languages'][number] = {
  code: 'uk',
  flag: '🇺🇦',
  name: 'Українська',
};

/** Build the without-Movar half's content for a given preferred
 *  locale. The site is always in Russian (the locked default for an
 *  international site that hasn't been told what language to serve);
 *  only the dialog's "preferred" option changes per locale, keeping
 *  the dialog focused on the binary Movar resolves. */
export function buildBlockedVoyaContent(preferredLang: 'en' | 'uk'): {
  content: VoyaSiteContent;
  dialog: VoyaDialogContent;
} {
  const preferredOption = preferredLang === 'en' ? EN_OPTION : UK_OPTION;
  return {
    content: BLOCKED_RU_CONTENT,
    dialog: {
      ...BLOCKED_RU_DIALOG_BASE,
      languages: [RU_OPTION, preferredOption],
    },
  };
}

/** Inline tag — when used as the `urlBar` content for both halves the
 *  diptych frame renders the same URL above each half (Movar
 *  doesn't change URLs; only the Accept-Language header).
 */
export const VOYA_URL = 'voya.example';

const BLOCKED_RU_CONTENT: VoyaSiteContent = {
  lang: 'ru',
  nav: ['Авиабилеты', 'Отели', 'Аренда авто', 'Туры'],
  loginLabel: 'Войти',
  hero: {
    title: 'Найдите следующее путешествие',
    subtitle: 'Авиабилеты, отели и аренда авто — на одной странице, без скрытых сборов.',
    fields: { from: 'Откуда — куда', checkIn: 'Заезд', checkOut: 'Выезд' },
    cta: 'Найти',
  },
  deals: [
    {
      city: 'Прага',
      tagline: 'Прямой рейс, выходные на двоих',
      price: 'от 12 400 ₽',
    },
    {
      city: 'Барселона',
      tagline: 'Пляж и архитектура Гауди',
      price: 'от 18 900 ₽',
    },
    {
      city: 'Тбилиси',
      tagline: 'Гастрономический уикенд',
      price: 'от 9 800 ₽',
    },
  ],
};

/**
 * Title + intro + CTA shared by the dialog regardless of which
 * preferred option is rendered alongside Russian. Only the
 * `languages` array varies — see `buildBlockedVoyaContent`.
 */
const BLOCKED_RU_DIALOG_BASE: Omit<VoyaDialogContent, 'languages'> = {
  title: 'Выберите язык',
  intro: 'Voya определит регион автоматически, но язык интерфейса можно выбрать вручную.',
  continueLabel: 'Продолжить',
};
