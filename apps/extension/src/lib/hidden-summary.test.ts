import { afterEach, describe, expect, it } from 'vitest';
import { buildHiddenSummary } from './hidden-summary';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildHiddenSummary', () => {
  it('reports an empty summary for a pristine page, threading pageLang + userOverride through', () => {
    expect(buildHiddenSummary(document, { pageLang: 'uk', userOverride: false })).toEqual({
      languages: [],
      containers: 0,
      feedCurtained: 0,
      feedHidden: 0,
      pageLang: 'uk',
      userOverride: false,
    });
  });

  it('collects sorted, de-duplicated languages from "not-in-priority" hidden picker items', () => {
    document.body.innerHTML = `
      <a data-movar-hidden="not-in-priority" href="/ru/x" hreflang="ru">ru</a>
      <a data-movar-hidden="not-in-priority" href="/ru/y" hreflang="ru">ru again</a>
      <a data-movar-hidden="not-in-priority" href="/uk/x" hreflang="uk">uk</a>
    `;
    expect(buildHiddenSummary(document, { pageLang: null, userOverride: false }).languages).toEqual(
      ['ru', 'uk'],
    );
  });

  it('ignores hidden elements whose reason is not "not-in-priority"', () => {
    document.body.innerHTML = `<a data-movar-hidden="content-filter:ru" href="/ru" hreflang="ru">x</a>`;
    expect(buildHiddenSummary(document, { pageLang: null, userOverride: false }).languages).toEqual(
      [],
    );
  });

  it('counts collapsed picker containers (curtain hosts marked picker-container)', () => {
    document.body.innerHTML = `
      <div data-movar-curtain data-movar-kind="picker-container"></div>
      <div data-movar-curtain data-movar-kind="picker-container"></div>
      <div data-movar-curtain data-movar-kind="tooltip"></div>
    `;
    expect(buildHiddenSummary(document, { pageLang: null, userOverride: false }).containers).toBe(
      2,
    );
  });

  it('splits feed cards into curtained (blurred) and hidden (hard-hidden) channels', () => {
    document.body.innerHTML = `
      <div data-movar-content-blurred></div>
      <div data-movar-hidden="content-filter:ru"></div>
      <div data-movar-hidden="content-filter:be"></div>
    `;
    const s = buildHiddenSummary(document, { pageLang: null, userOverride: false });
    expect(s.feedCurtained).toBe(1);
    expect(s.feedHidden).toBe(2);
  });

  it('passes the userOverride flag through verbatim', () => {
    expect(buildHiddenSummary(document, { pageLang: null, userOverride: true }).userOverride).toBe(
      true,
    );
  });
});
