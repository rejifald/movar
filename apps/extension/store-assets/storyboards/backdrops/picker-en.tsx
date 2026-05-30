/**
 * English variant of the picker-survivor backdrop (scene #3). Fictitious
 * SaaS account settings — *Kolesnyk* — with the language picker open and
 * Russian dimmed with a "Hidden by Movar" tag. Mirrors `picker-uk.tsx`
 * structurally; the surviving languages list is identical because the
 * scene's narrative is "Movar hid one entry" — only the chrome copy is
 * translated.
 *
 * No `children` slot — the picker dropdown is the scene's foreground.
 */
export function PickerBackdropEN() {
  return (
    <div className="movar-backdrop-picker-en" lang="en">
      <style>{PICKER_EN_CSS}</style>

      <header>
        <div className="logo">
          <span className="square" />
          kolesnyk
        </div>
        <div className="crumbs">Settings / Account</div>
        <div className="avatar" />
      </header>

      <main>
        <h1>Account</h1>
        <p className="lede">Settings that affect how the Kolesnyk interface is shown to you.</p>

        <section className="card">
          <h2>Interface language</h2>
          <p className="hint">Applies to menus, notifications and email digests.</p>
          <button type="button" className="picker-button">
            <span>🇬🇧 &nbsp; English</span>
            <span className="chev">▾</span>
          </button>

          <div className="picker-dropdown" role="listbox">
            <div className="item">
              <span className="label">🇬🇧 &nbsp; English</span>
              <span className="check">✓</span>
            </div>
            <div className="item">
              <span className="label">🇺🇦 &nbsp; Українська</span>
            </div>
            <div className="item">
              <span className="label">🇵🇱 &nbsp; Polski</span>
            </div>
            <div className="item">
              <span className="label">🇩🇪 &nbsp; Deutsch</span>
            </div>
            <div className="item disabled" title="Hidden by Movar">
              <span className="label">🇷🇺 &nbsp; Русский</span>
              <span className="movar-tag">Hidden by Movar</span>
            </div>
            <div className="item">
              <span className="label">🇧🇾 &nbsp; Беларуская</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const PICKER_EN_CSS = `
  .movar-backdrop-picker-en {
    --bd-picker-en-bg: #f1f5f9;
    --bd-picker-en-surface: #ffffff;
    --bd-picker-en-ink: #0f172a;
    --bd-picker-en-ink-soft: #475569;
    --bd-picker-en-ink-faint: #94a3b8;
    --bd-picker-en-border: #e2e8f0;
    --bd-picker-en-accent: #0ea371;
    --bd-picker-en-movar: #b45309;
    --bd-picker-en-movar-soft: #fef3c7;
    background: var(--bd-picker-en-bg);
    color: var(--bd-picker-en-ink);
    font: 14px/1.55 'Helvetica Neue', Arial, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-picker-en header {
    background: var(--bd-picker-en-surface);
    border-bottom: 1px solid var(--bd-picker-en-border);
    padding: 14px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .movar-backdrop-picker-en .logo {
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-picker-en .logo .square {
    display: inline-block;
    width: 18px;
    height: 18px;
    background: var(--bd-picker-en-accent);
    border-radius: 4px;
    vertical-align: -3px;
    margin-right: 8px;
  }
  .movar-backdrop-picker-en .crumbs {
    color: var(--bd-picker-en-ink-faint);
    font-size: 13px;
  }
  .movar-backdrop-picker-en .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #fde68a, #fb923c);
  }
  .movar-backdrop-picker-en main {
    max-width: 880px;
    margin: 0 auto;
    padding: 48px 40px;
  }
  .movar-backdrop-picker-en h1 {
    font-size: 26px;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-picker-en .lede {
    color: var(--bd-picker-en-ink-soft);
    margin: 0 0 32px;
  }
  .movar-backdrop-picker-en .card {
    background: var(--bd-picker-en-surface);
    border: 1px solid var(--bd-picker-en-border);
    border-radius: 12px;
    padding: 28px 32px;
    position: relative;
  }
  .movar-backdrop-picker-en .card h2 {
    font-size: 17px;
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-picker-en .card .hint {
    font-size: 13px;
    color: var(--bd-picker-en-ink-soft);
    margin: 0 0 20px;
  }
  .movar-backdrop-picker-en .picker-button {
    width: 360px;
    padding: 11px 14px;
    border: 1px solid var(--bd-picker-en-border);
    border-radius: 8px;
    background: var(--bd-picker-en-surface);
    font: inherit;
    color: var(--bd-picker-en-ink);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: default;
  }
  .movar-backdrop-picker-en .picker-button .chev {
    color: var(--bd-picker-en-ink-faint);
  }
  .movar-backdrop-picker-en .picker-dropdown {
    position: absolute;
    top: 138px;
    left: 32px;
    width: 360px;
    background: var(--bd-picker-en-surface);
    border: 1px solid var(--bd-picker-en-border);
    border-radius: 10px;
    box-shadow: 0 16px 36px -12px rgba(15, 23, 42, 0.22);
    padding: 6px;
    z-index: 10;
  }
  .movar-backdrop-picker-en .picker-dropdown .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 14px;
  }
  .movar-backdrop-picker-en .picker-dropdown .item:hover:not(.disabled) {
    background: #f1f5f9;
  }
  .movar-backdrop-picker-en .picker-dropdown .item .check {
    color: var(--bd-picker-en-accent);
    font-weight: 700;
  }
  .movar-backdrop-picker-en .picker-dropdown .item.disabled {
    color: var(--bd-picker-en-ink-faint);
  }
  .movar-backdrop-picker-en .picker-dropdown .item.disabled .label {
    text-decoration: line-through;
  }
  .movar-backdrop-picker-en .movar-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--bd-picker-en-movar-soft);
    color: var(--bd-picker-en-movar);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .movar-backdrop-picker-en .movar-tag::before {
    content: '';
    width: 5px;
    height: 5px;
    background: var(--bd-picker-en-movar);
    border-radius: 50%;
    display: inline-block;
  }
`;
