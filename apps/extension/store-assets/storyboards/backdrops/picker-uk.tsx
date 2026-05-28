/**
 * Fictitious settings page — *Kolesnyk* — with the language picker open
 * and Russian dimmed with a "Прибрано Movar" tag. Backdrop for the
 * picker-survivor screenshot (scene #3). Ported 1:1 from the retired
 * `picker.html` storyboard.
 *
 * No `children` slot — this scene's foreground is the picker dropdown,
 * not the Movar popup. The Movar-tagged row dimming demonstrates the
 * content-modification feature without needing the popup composited
 * over the page.
 */
export function PickerBackdropUK() {
  return (
    <div className="movar-backdrop-picker-uk" lang="uk">
      <style>{PICKER_UK_CSS}</style>

      <header>
        <div className="logo">
          <span className="square" />
          kolesnyk
        </div>
        <div className="crumbs">Налаштування / Обліковий запис</div>
        <div className="avatar" />
      </header>

      <main>
        <h1>Обліковий запис</h1>
        <p className="lede">
          Налаштування, які впливають на те, як вам показується інтерфейс Kolesnyk.
        </p>

        <section className="card">
          <h2>Мова інтерфейсу</h2>
          <p className="hint">
            Налаштування застосовується до меню, повідомлень та email-розсилок.
          </p>
          <button type="button" className="picker-button">
            <span>🇺🇦 &nbsp; Українська</span>
            <span className="chev">▾</span>
          </button>

          <div className="picker-dropdown" role="listbox">
            <div className="item">
              <span className="label">🇺🇦 &nbsp; Українська</span>
              <span className="check">✓</span>
            </div>
            <div className="item">
              <span className="label">🇬🇧 &nbsp; English</span>
            </div>
            <div className="item">
              <span className="label">🇵🇱 &nbsp; Polski</span>
            </div>
            <div className="item">
              <span className="label">🇩🇪 &nbsp; Deutsch</span>
            </div>
            <div className="item disabled" title="Hidden by Movar">
              <span className="label">🇷🇺 &nbsp; Русский</span>
              <span className="movar-tag">Прибрано Movar</span>
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

const PICKER_UK_CSS = `
  .movar-backdrop-picker-uk {
    --bd-picker-bg: #f1f5f9;
    --bd-picker-surface: #ffffff;
    --bd-picker-ink: #0f172a;
    --bd-picker-ink-soft: #475569;
    --bd-picker-ink-faint: #94a3b8;
    --bd-picker-border: #e2e8f0;
    --bd-picker-accent: #0ea371;
    --bd-picker-movar: #b45309;
    --bd-picker-movar-soft: #fef3c7;
    background: var(--bd-picker-bg);
    color: var(--bd-picker-ink);
    font: 14px/1.55 'Helvetica Neue', Arial, sans-serif;
    min-height: 100vh;
  }
  .movar-backdrop-picker-uk header {
    background: var(--bd-picker-surface);
    border-bottom: 1px solid var(--bd-picker-border);
    padding: 14px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .movar-backdrop-picker-uk .logo {
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-picker-uk .logo .square {
    display: inline-block;
    width: 18px;
    height: 18px;
    background: var(--bd-picker-accent);
    border-radius: 4px;
    vertical-align: -3px;
    margin-right: 8px;
  }
  .movar-backdrop-picker-uk .crumbs {
    color: var(--bd-picker-ink-faint);
    font-size: 13px;
  }
  .movar-backdrop-picker-uk .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #fde68a, #fb923c);
  }
  .movar-backdrop-picker-uk main {
    max-width: 880px;
    margin: 0 auto;
    padding: 48px 40px;
  }
  .movar-backdrop-picker-uk h1 {
    font-size: 26px;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-picker-uk .lede {
    color: var(--bd-picker-ink-soft);
    margin: 0 0 32px;
  }
  .movar-backdrop-picker-uk .card {
    background: var(--bd-picker-surface);
    border: 1px solid var(--bd-picker-border);
    border-radius: 12px;
    padding: 28px 32px;
    position: relative;
  }
  .movar-backdrop-picker-uk .card h2 {
    font-size: 17px;
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }
  .movar-backdrop-picker-uk .card .hint {
    font-size: 13px;
    color: var(--bd-picker-ink-soft);
    margin: 0 0 20px;
  }
  .movar-backdrop-picker-uk .picker-button {
    width: 360px;
    padding: 11px 14px;
    border: 1px solid var(--bd-picker-border);
    border-radius: 8px;
    background: var(--bd-picker-surface);
    font: inherit;
    color: var(--bd-picker-ink);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: default;
  }
  .movar-backdrop-picker-uk .picker-button .chev {
    color: var(--bd-picker-ink-faint);
  }
  .movar-backdrop-picker-uk .picker-dropdown {
    position: absolute;
    top: 138px;
    left: 32px;
    width: 360px;
    background: var(--bd-picker-surface);
    border: 1px solid var(--bd-picker-border);
    border-radius: 10px;
    box-shadow: 0 16px 36px -12px rgba(15, 23, 42, 0.22);
    padding: 6px;
    z-index: 10;
  }
  .movar-backdrop-picker-uk .picker-dropdown .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
    border-radius: 6px;
    font-size: 14px;
  }
  .movar-backdrop-picker-uk .picker-dropdown .item:hover:not(.disabled) {
    background: #f1f5f9;
  }
  .movar-backdrop-picker-uk .picker-dropdown .item .check {
    color: var(--bd-picker-accent);
    font-weight: 700;
  }
  .movar-backdrop-picker-uk .picker-dropdown .item.disabled {
    color: var(--bd-picker-ink-faint);
  }
  .movar-backdrop-picker-uk .picker-dropdown .item.disabled .label {
    text-decoration: line-through;
  }
  .movar-backdrop-picker-uk .movar-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--bd-picker-movar-soft);
    color: var(--bd-picker-movar);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .movar-backdrop-picker-uk .movar-tag::before {
    content: '';
    width: 5px;
    height: 5px;
    background: var(--bd-picker-movar);
    border-radius: 50%;
    display: inline-block;
  }
`;
