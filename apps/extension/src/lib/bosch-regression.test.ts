/**
 * Regression: live HTML from bosch-centre.com.ua had URLs like
 * /ru-return-warranty that previously matched a hyphen-prefixed BCP47 rule on
 * path segments, causing ~7 unrelated anchors to classify as Russian and the
 * `<body>` to end up as the common ancestor of a giant fake picker — hiding
 * the entire page. After splitting normalize into strict + BCP47, only the
 * actual <form> language picker should be detected.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyLanguageElement, filterPickers, findLanguagePickers } from './picker';

const html = readFileSync(resolve(__dirname, 'bosch.fixture.html'), 'utf-8');

describe('bosch-centre.com.ua regression', () => {
  it('detects exactly one picker — the language form — not the body', () => {
    document.documentElement.innerHTML = html.replace(/<\/?html[^>]*>/g, '');

    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    const picker = pickers[0]!;
    expect(picker.container.tagName).toBe('FORM');
    expect(picker.container.id).toBe('form-language');
    expect(picker.links).toHaveLength(2);
    expect(picker.links.map((l) => l.language).sort()).toEqual(['ru', 'uk']);
    expect(picker.links.every((l) => l.el.tagName === 'BUTTON')).toBe(true);
  });

  it('does not classify the /ru logo or breadcrumb home anchors', () => {
    document.documentElement.innerHTML = html.replace(/<\/?html[^>]*>/g, '');
    const anchors = document.querySelectorAll<HTMLAnchorElement>(
      'a[href="https://bosch-centre.com.ua/ru"]',
    );
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(classifyLanguageElement(a)).toBeNull();
    }
  });

  it('does not classify the /ru-return-warranty anchor', () => {
    document.documentElement.innerHTML = html.replace(/<\/?html[^>]*>/g, '');
    const anchor = document.querySelector<HTMLAnchorElement>('a[href$="/ru-return-warranty"]');
    expect(anchor).not.toBeNull();
    expect(classifyLanguageElement(anchor!)).toBeNull();
  });

  it('filterPickers hides only the form, never <body>', () => {
    document.documentElement.innerHTML = html.replace(/<\/?html[^>]*>/g, '');
    filterPickers(findLanguagePickers(), ['uk', 'en']);

    expect(document.body.getAttribute('data-movar-hidden')).toBeNull();
    expect(document.body.style.display).not.toBe('none');

    const form = document.getElementById('form-language')!;
    expect(form.getAttribute('data-movar-hidden')).toBe('single-option');
  });
});
