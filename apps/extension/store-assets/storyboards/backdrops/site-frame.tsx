import type { ReactNode } from 'react';

/**
 * Shared layout for the *Tochka24* mock services site — the brand used in
 * both halves of the "correction applied" diptych (scene #2). `site-ru.tsx`
 * and `site-uk.tsx` are thin wrappers that pass localized strings into this
 * frame.
 *
 * Single class — `.movar-backdrop-site` — and a single CSS string keep the
 * before/after halves visually identical except for language; if they ever
 * diverge that's a bug in the diptych narrative, not a styling intent. CSS
 * variables stay prefixed `--bd-site-*` so the popup (which the UK half
 * hosts as a child) can keep its own `@movar/ui` tokens uncontaminated.
 */
export interface SiteFrameContent {
  /** `lang` attribute on the wrapping div — `'ru'` or `'uk'`. */
  lang: string;
  /** Labels for the four primary nav items. Order = render order. */
  nav: readonly [string, string, string, string];
  /** "Log in" CTA label in the header. */
  loginLabel: string;
  hero: { title: string; body: string; cta: string };
  /** Three feature cards under the hero. Order = render order. */
  features: readonly [
    { title: string; body: string },
    { title: string; body: string },
    { title: string; body: string },
  ];
}

interface SiteFrameProps {
  content: SiteFrameContent;
  /**
   * Optional popup overlay. When supplied, renders into a `.popup-slot`
   * positioned bottom-right; this is how the UK variant hosts the
   * production popup component. When omitted, no overlay renders — used
   * by the RU before-state half.
   */
  children?: ReactNode;
}

export function SiteFrame({ content, children }: SiteFrameProps) {
  return (
    <div className="movar-backdrop-site" lang={content.lang}>
      <style>{SITE_CSS}</style>

      <header>
        <div className="logo">
          tochka<span className="dot">24</span>
        </div>
        <nav>
          {content.nav.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </nav>
        <a href="https://tochka24.example/login" className="cta-secondary">
          {content.loginLabel}
        </a>
      </header>

      <section className="hero">
        <div>
          <h1>{content.hero.title}</h1>
          <p>{content.hero.body}</p>
          <a href="https://tochka24.example/order" className="cta-primary">
            {content.hero.cta}
          </a>
        </div>
        <div className="visual" />
      </section>

      <section className="features">
        {content.features.map((f) => (
          <div className="feature" key={f.title}>
            <span className="pill" />
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      {children === undefined ? null : <div className="popup-slot">{children}</div>}
    </div>
  );
}

// CSS-in-JS string rather than a sibling .css file: the backdrops are
// design-locked single-purpose mocks and keeping the styles in the same
// file as the markup makes per-scene tweaks a one-edit operation. Tokens
// are `--bd-site-*` so they don't leak into the popup's `@movar/ui`
// scope when it mounts inside `.popup-slot`.
const SITE_CSS = `
  .movar-backdrop-site {
    --bd-site-bg: #ffffff;
    --bd-site-ink: #0f172a;
    --bd-site-ink-soft: #475569;
    --bd-site-border: #e2e8f0;
    --bd-site-accent: #1d4ed8;
    --bd-site-accent-soft: #eff6ff;
    --bd-site-surface: #f8fafc;
    background: var(--bd-site-bg);
    color: var(--bd-site-ink);
    font: 15px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-site header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 56px;
    border-bottom: 1px solid var(--bd-site-border);
  }
  .movar-backdrop-site .logo {
    font-weight: 800;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .movar-backdrop-site .logo .dot {
    color: var(--bd-site-accent);
  }
  .movar-backdrop-site nav {
    display: flex;
    gap: 28px;
    font-size: 14px;
    color: var(--bd-site-ink-soft);
  }
  .movar-backdrop-site .cta-secondary {
    padding: 8px 16px;
    border: 1px solid var(--bd-site-border);
    border-radius: 8px;
    color: var(--bd-site-ink);
    font-weight: 600;
    font-size: 14px;
  }
  .movar-backdrop-site .hero {
    max-width: 1120px;
    margin: 0 auto;
    padding: 80px 56px 60px;
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 56px;
    align-items: center;
  }
  .movar-backdrop-site .hero h1 {
    font-size: 48px;
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0 0 18px;
  }
  .movar-backdrop-site .hero p {
    font-size: 18px;
    line-height: 1.55;
    color: var(--bd-site-ink-soft);
    margin: 0 0 26px;
    max-width: 460px;
  }
  .movar-backdrop-site .cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 24px;
    background: var(--bd-site-accent);
    color: #fff;
    border-radius: 10px;
    font-weight: 600;
    font-size: 15px;
  }
  .movar-backdrop-site .visual {
    aspect-ratio: 4/3;
    background: linear-gradient(135deg, var(--bd-site-accent-soft) 0%, #dbeafe 100%);
    border-radius: 18px;
    position: relative;
  }
  .movar-backdrop-site .visual::after {
    content: '';
    position: absolute;
    inset: 12% 14% 14% 12%;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 24px 48px -16px rgba(15, 23, 42, 0.18);
  }
  .movar-backdrop-site .features {
    max-width: 1120px;
    margin: 0 auto;
    padding: 56px 56px 80px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
  }
  .movar-backdrop-site .feature {
    padding: 28px;
    border: 1px solid var(--bd-site-border);
    border-radius: 14px;
    background: var(--bd-site-surface);
  }
  .movar-backdrop-site .feature h3 {
    font-size: 17px;
    margin: 0 0 10px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-site .feature p {
    font-size: 14px;
    color: var(--bd-site-ink-soft);
    margin: 0;
  }
  .movar-backdrop-site .pill {
    display: inline-block;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--bd-site-accent-soft);
    margin-bottom: 14px;
  }
  .movar-backdrop-site .popup-slot {
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
