import type { JSX, ReactNode } from 'react';
import { cn } from '@movar/ui';
import { ShoppingBag, ShoppingCart, Star } from 'lucide-react';

/**
 * Fictitious Ukrainian online-shop product page for the "online shop"
 * before/after pair (marketing Examples entry #4 + marketplace scene
 * #7). The brand — _Крамко_ — is invented and lives on the IANA-reserved
 * `.example` TLD; no real retailer is depicted (REQUIREMENTS.md §5).
 *
 * The scene's pivot is the in-header language toggle (РУ | УК) plus the
 * locale segment in the URL: the shop has both a Russian and a Ukrainian
 * edition, and which one it serves depends on the request's
 * Accept-Language. Without Movar the shop defaults to Russian; with
 * Movar the same link opens the Ukrainian edition. The whole page body
 * is therefore localised — that's the visible before/after.
 *
 * CSS variables are prefixed `--bd-shop-*`. The brand palette (indigo)
 * is intentionally distinct from the Google/YouTube scenes so the
 * variety reads as the user's own browsing. Dark theme via
 * prefers-color-scheme.
 */
export interface ShopContent {
  /** Which language pill is highlighted: `'ru'` (without) or `'uk'` (with). */
  activeLocale: 'ru' | 'uk';
  /** Header nav links. */
  nav: readonly string[];
  /** Breadcrumb segments, rendered with `›` separators. */
  breadcrumb: readonly string[];
  /** Product title. */
  title: string;
  /** Numeric rating, e.g. "4.8". */
  rating: string;
  /** Review-count line, e.g. "1 240 відгуків". */
  reviews: string;
  /** Price string incl. currency, e.g. "2 499 грн". */
  price: string;
  /** In-stock label. */
  inStock: string;
  /** Feature bullets (3 read cleanly). */
  features: readonly string[];
  /** Add-to-cart button label. */
  addToCart: string;
  /** Short description paragraph under the price. */
  description: string;
  /** Delivery / returns reassurance strip under the CTA. */
  delivery: string;
}

export interface ShopFrameProps {
  /** `lang` attribute on the wrapping div — `'ru'` / `'uk'`. */
  lang: string;
  /** URL bar text. Ignored when `hideChrome` is true. Highlight the
   *  locale segment with `<mark>`. */
  urlBar?: ReactNode;
  /** Skip the built-in browser-chrome strip. Defaults to `false`. */
  hideChrome?: boolean;
  /** Localised page content. */
  content: ShopContent;
}

export function ShopFrame({
  lang,
  urlBar,
  hideChrome = false,
  content,
}: ShopFrameProps): JSX.Element {
  const {
    activeLocale,
    nav,
    breadcrumb,
    title,
    rating,
    reviews,
    price,
    inStock,
    features,
    addToCart,
    description,
    delivery,
  } = content;

  return (
    <div className="movar-backdrop-shop" lang={lang}>
      <style>{SHOP_CSS}</style>

      {hideChrome ? null : (
        <div className="chrome">
          <div className="dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="urlbar">
            <span className="lock" aria-hidden="true">
              🔒
            </span>
            <span className="url">{urlBar}</span>
          </div>
        </div>
      )}

      <header className="shop-head">
        <div className="brand">
          <span className="brand-tile" aria-hidden="true">
            <ShoppingBag size={18} color="#ffffff" strokeWidth={2.2} />
          </span>
          <span className="brand-word">Крамко</span>
        </div>
        <nav className="nav" aria-label="shop sections">
          {nav.map((label) => (
            <span key={label} className="nav-link">
              {label}
            </span>
          ))}
        </nav>
        <div className="head-tools">
          <div className="lang-toggle" aria-hidden="true">
            <span className={cn('lang', activeLocale === 'ru' && 'on')}>РУ</span>
            <span className={cn('lang', activeLocale === 'uk' && 'on')}>УК</span>
          </div>
          <span className="cart" aria-hidden="true">
            <ShoppingCart size={20} />
            <span className="cart-badge">2</span>
          </span>
        </div>
      </header>

      <nav className="crumbs" aria-label="breadcrumb">
        {breadcrumb.map((seg, i) => (
          <span key={seg} className="crumb">
            {i > 0 ? <span className="crumb-sep"> › </span> : null}
            {seg}
          </span>
        ))}
      </nav>

      <div className="product">
        <div className="gallery">
          <div className="hero" aria-hidden="true" />
          <div className="thumbs" aria-hidden="true">
            <span className="g-thumb g-thumb--a" />
            <span className="g-thumb g-thumb--b" />
            <span className="g-thumb g-thumb--c" />
            <span className="g-thumb g-thumb--d" />
          </div>
        </div>
        <div className="details">
          <h1 className="p-title">{title}</h1>
          <div className="p-rating">
            <span className="stars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} size={15} color="#f5a623" fill="#f5a623" strokeWidth={0} />
              ))}
            </span>
            <span className="rating-num">{rating}</span>
            <span className="rating-reviews">· {reviews}</span>
          </div>
          <div className="p-price">{price}</div>
          <div className="p-stock">{inStock}</div>
          <ul className="p-features">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="p-desc">{description}</p>
          <button className="p-cart" type="button">
            <ShoppingCart size={18} strokeWidth={2.2} />
            <span>{addToCart}</span>
          </button>
          <div className="p-delivery">{delivery}</div>
        </div>
      </div>
    </div>
  );
}

const SHOP_CSS = `
  .movar-backdrop-shop {
    --bd-shop-bg: #ffffff;
    --bd-shop-surface: #f7f8fa;
    --bd-shop-ink: #1a2233;
    --bd-shop-ink-soft: #5b6472;
    --bd-shop-ink-faint: #98a0ad;
    --bd-shop-rule: #e8ebef;
    --bd-shop-rule-strong: #d4d9e0;
    --bd-shop-chrome: #f1f3f4;
    --bd-shop-brand: #4f46e5;
    --bd-shop-brand-ink: #4f46e5;
    --bd-shop-on-brand: #ffffff;
    --bd-shop-stock: #1c8a5a;
    --bd-shop-mark-bg: #fef7e0;
    --bd-shop-mark-ink: #5f4500;
    background: var(--bd-shop-bg);
    color: var(--bd-shop-ink);
    font: 14px/1.55 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .movar-backdrop-shop .chrome {
    background: var(--bd-shop-chrome);
    border-bottom: 1px solid var(--bd-shop-rule-strong);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-backdrop-shop .chrome .dots {
    display: flex;
    gap: 6px;
  }
  .movar-backdrop-shop .chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-backdrop-shop .chrome .urlbar {
    flex: 1;
    background: #fff;
    border: 1px solid var(--bd-shop-rule-strong);
    border-radius: 999px;
    padding: 6px 16px;
    font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--bd-shop-ink-soft);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .movar-backdrop-shop .chrome .urlbar .lock {
    color: var(--bd-shop-ink-faint);
  }
  .movar-backdrop-shop .chrome .urlbar .url mark {
    background: var(--bd-shop-mark-bg);
    color: var(--bd-shop-mark-ink);
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }

  .movar-backdrop-shop .shop-head {
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 16px 32px;
    border-bottom: 1px solid var(--bd-shop-rule);
  }
  .movar-backdrop-shop .brand {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
  }
  .movar-backdrop-shop .brand-tile {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--bd-shop-brand);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .movar-backdrop-shop .brand-word {
    font: 800 21px/1 'Inter', system-ui, sans-serif;
    letter-spacing: -0.02em;
    color: var(--bd-shop-ink);
  }
  .movar-backdrop-shop .nav {
    display: flex;
    gap: 22px;
    font-size: 14px;
    color: var(--bd-shop-ink-soft);
  }
  .movar-backdrop-shop .head-tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .movar-backdrop-shop .lang-toggle {
    display: inline-flex;
    border: 1px solid var(--bd-shop-rule-strong);
    border-radius: 999px;
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
  }
  .movar-backdrop-shop .lang-toggle .lang {
    padding: 5px 11px;
    color: var(--bd-shop-ink-soft);
  }
  .movar-backdrop-shop .lang-toggle .lang.on {
    background: var(--bd-shop-brand);
    color: var(--bd-shop-on-brand);
  }
  .movar-backdrop-shop .cart {
    position: relative;
    display: inline-flex;
    color: var(--bd-shop-ink);
  }
  .movar-backdrop-shop .cart-badge {
    position: absolute;
    top: -6px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--bd-shop-brand);
    color: var(--bd-shop-on-brand);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }

  .movar-backdrop-shop .crumbs {
    padding: 14px 32px 0;
    font-size: 12px;
    color: var(--bd-shop-ink-faint);
  }
  .movar-backdrop-shop .crumb-sep {
    color: var(--bd-shop-ink-faint);
  }

  .movar-backdrop-shop .product {
    display: flex;
    gap: 40px;
    padding: 22px 32px 40px;
    align-items: flex-start;
  }
  .movar-backdrop-shop .gallery {
    flex: 0 0 360px;
  }
  .movar-backdrop-shop .hero {
    width: 100%;
    height: 320px;
    border-radius: 16px;
    background:
      radial-gradient(120% 120% at 30% 20%, rgba(255, 255, 255, 0.45), transparent 55%),
      linear-gradient(140deg, #6366f1 0%, #4338ca 60%, #312e81 100%);
  }
  .movar-backdrop-shop .thumbs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 12px;
  }
  .movar-backdrop-shop .g-thumb {
    aspect-ratio: 1 / 1;
    border-radius: 10px;
    border: 1px solid var(--bd-shop-rule);
  }
  .movar-backdrop-shop .g-thumb--a { background: linear-gradient(135deg, #6366f1, #4338ca); }
  .movar-backdrop-shop .g-thumb--b { background: linear-gradient(135deg, #818cf8, #4f46e5); }
  .movar-backdrop-shop .g-thumb--c { background: linear-gradient(135deg, #a5b4fc, #6366f1); }
  .movar-backdrop-shop .g-thumb--d { background: linear-gradient(135deg, #c7d2fe, #818cf8); }

  .movar-backdrop-shop .details {
    flex: 1 1 auto;
    min-width: 0;
  }
  .movar-backdrop-shop .p-title {
    font: 700 28px/1.25 'Inter', system-ui, sans-serif;
    margin: 0 0 12px;
    color: var(--bd-shop-ink);
  }
  .movar-backdrop-shop .p-rating {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--bd-shop-ink-soft);
  }
  .movar-backdrop-shop .p-rating .stars {
    display: inline-flex;
    gap: 1px;
  }
  .movar-backdrop-shop .p-rating .rating-num {
    font-weight: 700;
    color: var(--bd-shop-ink);
  }
  .movar-backdrop-shop .p-price {
    font: 800 30px/1 'Inter', system-ui, sans-serif;
    color: var(--bd-shop-ink);
    margin-bottom: 8px;
  }
  .movar-backdrop-shop .p-stock {
    display: inline-block;
    font-size: 13px;
    font-weight: 600;
    color: var(--bd-shop-stock);
    margin-bottom: 18px;
  }
  .movar-backdrop-shop .p-features {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    color: var(--bd-shop-ink);
  }
  .movar-backdrop-shop .p-features li {
    position: relative;
    padding-left: 22px;
  }
  .movar-backdrop-shop .p-features li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 7px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--bd-shop-brand);
  }
  .movar-backdrop-shop .p-desc {
    font-size: 14px;
    line-height: 1.6;
    color: var(--bd-shop-ink-soft);
    margin: 0 0 22px;
    max-width: 460px;
  }
  .movar-backdrop-shop .p-cart {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: var(--bd-shop-brand);
    color: var(--bd-shop-on-brand);
    border: none;
    border-radius: 12px;
    padding: 13px 26px;
    font: 600 15px/1 'Inter', system-ui, sans-serif;
    cursor: default;
  }
  .movar-backdrop-shop .p-delivery {
    margin-top: 16px;
    font-size: 12px;
    color: var(--bd-shop-ink-faint);
  }

  /* ── Phone tier ──────────────────────────────────────────────────────
     iPhone renders the shop at a real phone composition width: hide the
     section nav, stack the gallery over the details, full-bleed the CTA. */
  .movar-device-phone .movar-backdrop-shop .shop-head {
    padding: 14px 18px;
    gap: 12px;
  }
  .movar-device-phone .movar-backdrop-shop .nav {
    display: none;
  }
  .movar-device-phone .movar-backdrop-shop .crumbs {
    padding: 12px 18px 0;
  }
  .movar-device-phone .movar-backdrop-shop .product {
    flex-direction: column;
    gap: 14px;
    padding: 12px 18px 34px;
  }
  .movar-device-phone .movar-backdrop-shop .gallery {
    flex: 0 0 auto;
    width: 100%;
  }
  /* Compact product banner + tightened detail spacing so the localised title,
     price and feature bullets (the before/after payload) all clear the diptych
     fold — phone screenshots favour information over a big hero. Drop the
     thumbnail strip and the long description for the same reason. */
  .movar-device-phone .movar-backdrop-shop .hero {
    height: 76px;
  }
  .movar-device-phone .movar-backdrop-shop .thumbs {
    display: none;
  }
  .movar-device-phone .movar-backdrop-shop .details {
    width: 100%;
  }
  .movar-device-phone .movar-backdrop-shop .p-title {
    font-size: 22px;
    margin-bottom: 6px;
  }
  .movar-device-phone .movar-backdrop-shop .p-rating {
    margin-bottom: 8px;
  }
  .movar-device-phone .movar-backdrop-shop .p-price {
    font-size: 25px;
    margin-bottom: 6px;
  }
  .movar-device-phone .movar-backdrop-shop .p-stock {
    margin-bottom: 10px;
  }
  .movar-device-phone .movar-backdrop-shop .p-features {
    margin-bottom: 12px;
    gap: 7px;
  }
  .movar-device-phone .movar-backdrop-shop .p-desc {
    display: none;
  }
  .movar-device-phone .movar-backdrop-shop .p-cart {
    width: 100%;
    justify-content: center;
    padding: 14px 26px;
  }

  /* ── Tablet tier ─────────────────────────────────────────────────────
     iPad keeps the two-column product page, but roomier than desktop —
     larger gallery, hero and type. */
  .movar-device-tablet .movar-backdrop-shop .shop-head {
    padding: 20px 40px;
    gap: 34px;
  }
  .movar-device-tablet .movar-backdrop-shop .nav {
    font-size: 16px;
    gap: 26px;
  }
  .movar-device-tablet .movar-backdrop-shop .brand-word {
    font-size: 24px;
  }
  .movar-device-tablet .movar-backdrop-shop .crumbs {
    padding: 18px 40px 0;
    font-size: 13px;
  }
  .movar-device-tablet .movar-backdrop-shop .product {
    gap: 48px;
    padding: 28px 40px 48px;
  }
  .movar-device-tablet .movar-backdrop-shop .gallery {
    flex: 0 0 440px;
  }
  .movar-device-tablet .movar-backdrop-shop .hero {
    height: 400px;
  }
  .movar-device-tablet .movar-backdrop-shop .p-title {
    font-size: 34px;
  }
  .movar-device-tablet .movar-backdrop-shop .p-price {
    font-size: 36px;
  }
  .movar-device-tablet .movar-backdrop-shop .p-desc {
    max-width: 560px;
    font-size: 15px;
  }

  /* Dark theme — bespoke dark surface for the shop brand. */
  @media (prefers-color-scheme: dark) {
    .movar-backdrop-shop {
      --bd-shop-bg: #0f1115;
      --bd-shop-surface: #161922;
      --bd-shop-ink: #e6e9ef;
      --bd-shop-ink-soft: #a3acbd;
      --bd-shop-ink-faint: #6b7486;
      --bd-shop-rule: #232733;
      --bd-shop-rule-strong: #333a49;
      --bd-shop-chrome: #1a1d24;
      --bd-shop-brand: #6366f1;
      --bd-shop-on-brand: #ffffff;
      --bd-shop-stock: #34d399;
      --bd-shop-mark-bg: #3a2f12;
      --bd-shop-mark-ink: #fdd663;
    }
    .movar-backdrop-shop .chrome .dots span { background: #5f6368; }
    .movar-backdrop-shop .chrome .urlbar { background: #161922; }
  }
`;
