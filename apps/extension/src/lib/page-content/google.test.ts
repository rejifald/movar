// fallow-ignore-file code-duplication
import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_EXTRACTOR } from './google';
import { applyContentFilter } from './conceal';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── Host matching ────────────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.matches', () => {
  it('matches google.com', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com')).toBe(true);
  });

  it('matches www.google.com subdomain', () => {
    expect(GOOGLE_EXTRACTOR.matches('www.google.com')).toBe(true);
  });

  it('matches google.com.ua', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com.ua')).toBe(true);
  });

  it('matches google.de', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.de')).toBe(true);
  });

  it('matches google.co.uk', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.co.uk')).toBe(true);
  });

  it('does not match youtube.com', () => {
    expect(GOOGLE_EXTRACTOR.matches('youtube.com')).toBe(false);
  });

  it('does not match example.com', () => {
    expect(GOOGLE_EXTRACTOR.matches('example.com')).toBe(false);
  });

  it('does not match a fake google domain (notgoogle.com)', () => {
    expect(GOOGLE_EXTRACTOR.matches('notgoogle.com')).toBe(false);
  });
});

// ─── Node extraction ──────────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — node structure', () => {
  it('produces a result node for div.g', () => {
    setBody(`
      <div id="search">
        <div class="g" id="card">
          <h3>Some result title</h3>
          <span>A snippet about the result.</span>
        </div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.extractor).toBe('google');
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('result');
    expect(model.nodes[0]!.hideMode).toBe('hide');
  });

  it('produces a result node for div[data-snhf]', () => {
    setBody(`<div data-snhf="0"><span>Featured snippet text</span></div>`);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('result');
    expect(model.nodes[0]!.hideMode).toBe('hide');
  });

  it('captures the whole card textContent as node text', () => {
    setBody(`
      <div class="g">
        <h3>Купити картину в Києві</h3>
        <span>Великий вибір картин різних стилів та епох.</span>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes[0]!.text).toContain('Купити картину');
    expect(model.nodes[0]!.text).toContain('Великий вибір');
  });

  it('returns zero nodes for an empty page', () => {
    setBody('');
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(0);
  });

  it('produces nodes for multiple cards', () => {
    setBody(`
      <div class="g"><h3>Card one</h3></div>
      <div class="g"><h3>Card two</h3></div>
      <div class="g"><h3>Card three</h3></div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(3);
  });

  it('uses the provided root, not document', () => {
    setBody(`
      <div id="out-of-scope">
        <div class="g"><h3>Outside</h3></div>
      </div>
      <div id="scope">
        <div class="g"><h3>Inside</h3></div>
      </div>
    `);
    const scope = document.querySelector<HTMLElement>('#scope')!;
    const model = GOOGLE_EXTRACTOR.extract(scope);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.text).toContain('Inside');
  });
});

// ─── Full filter integration (extractor + applyContentFilter) ────────────

describe('GOOGLE_EXTRACTOR — applyContentFilter integration', () => {
  it('hides a Russian SERP card (display:none + data-movar-hidden)', () => {
    setBody(`
      <div class="g" id="ru-card">
        <h3>Купить картину в Москве</h3>
        <span>Большой выбор картин разных стилей и эпох.</span>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const hits = applyContentFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    const card = document.querySelector<HTMLElement>('#ru-card')!;
    expect(card.style.display).toBe('none');
    expect(card.getAttribute('data-movar-hidden')).toMatch(/^content-filter:result:ru$/);
    // No curtain — hideMode:'hide' is flat.
    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('leaves a Ukrainian card alone', () => {
    setBody(`
      <div class="g" id="uk-card">
        <h3>Купити картину в Києві</h3>
        <span>Великий вибір картин різних стилів та епох.</span>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const hits = applyContentFilter(model, ['ru']);
    expect(hits).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#uk-card')!.style.display).toBe('');
  });

  it('leaves an English card alone', () => {
    setBody(`
      <div class="g" id="en-card">
        <h3>Buy artwork online</h3>
        <span>A wide selection of paintings from many eras.</span>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(applyContentFilter(model, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#en-card')!.style.display).toBe('');
  });

  it('is idempotent — second pass returns no new hits', () => {
    setBody(`
      <div class="g" id="ru-card">
        <h3>Что-то по-русски</h3>
        <span>Какой-то очень русский текст здесь.</span>
      </div>
    `);
    const first = applyContentFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    const second = applyContentFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('does not hide a card whose text is too short to classify', () => {
    setBody(`
      <div class="g" id="card">
        <h3>Привет</h3>
      </div>
    `);
    const hits = applyContentFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(hits).toHaveLength(0);
  });

  it('does nothing when ru is not in blocked', () => {
    setBody(`
      <div class="g">
        <h3>Купить картину в Москве</h3>
        <span>Большой выбор картин разных стилей и эпох.</span>
      </div>
    `);
    expect(applyContentFilter(GOOGLE_EXTRACTOR.extract(document), [])).toHaveLength(0);
    expect(applyContentFilter(GOOGLE_EXTRACTOR.extract(document), ['uk'])).toHaveLength(0);
  });

  it('handles multiple cards and hides only Russian ones', () => {
    setBody(`
      <div class="g" id="ru">
        <h3>Купить картину в Москве</h3>
        <span>Большой выбор картин разных стилей и эпох.</span>
      </div>
      <div class="g" id="uk">
        <h3>Купити картину в Києві</h3>
        <span>Великий вибір картин різних стилів та епох.</span>
      </div>
      <div class="g" id="en">
        <h3>Buy artwork online</h3>
      </div>
    `);
    const hits = applyContentFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(hits).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#uk')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en')!.style.display).toBe('');
  });
});
