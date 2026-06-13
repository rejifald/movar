/**
 * Regression: live HTML from bosch-centre.com.ua had URLs like
 * /ru-return-warranty that previously matched a hyphen-prefixed BCP47 rule on
 * path segments, causing ~7 unrelated anchors to classify as Russian and the
 * `<body>` to end up as the common ancestor of a giant fake picker — hiding
 * the entire page. After splitting normalize into strict + BCP47, only the
 * actual <form> language picker should be detected.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { filterPickers } from './picker-filter';
import { testContentPresenter } from './dom-test-helpers';

// The bosch capture lives in the shared content corpus
// (packages/page-content/fixtures/pickers/) as the form-button picker case —
// see that dir's README.md. This test stays its dedicated regression guard.
const BOSCH_FIXTURE = path.resolve(
  __dirname,
  '../../../../packages/page-content/fixtures/pickers/bosch-form-button.fixture.html',
);

let html = '';

beforeAll(() => {
  html = readFileSync(BOSCH_FIXTURE, 'utf8');
  // Pin fixture shape so a silent edit to bosch.fixture.html doesn't shift
  // what "the regression" means — every assertion below assumes ≥7 `/ru*`
  // anchors plus exactly one language form. If the fixture is restructured,
  // this fails loudly here instead of producing a misleading test pass.
  const tmp = document.implementation.createHTMLDocument();
  tmp.documentElement.innerHTML = html.replace(/<\/?html[^>]*>/g, '');
  const ruAnchors = tmp.querySelectorAll<HTMLAnchorElement>('a[href*="/ru"]');
  if (ruAnchors.length < 7) {
    throw new Error(
      `bosch.fixture.html drifted: expected ≥7 /ru* anchors, found ${ruAnchors.length}`,
    );
  }
  if (!tmp.querySelector('#form-language')) {
    throw new Error('bosch.fixture.html drifted: #form-language not found');
  }
});

beforeEach(() => {
  document.documentElement.innerHTML = html.replace(/<\/?html[^>]*>/g, '');
});

describe('bosch-centre.com.ua regression', () => {
  it('detects exactly one picker — the language form — not the body', () => {
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    const picker = pickers[0]!;
    expect(picker.container.tagName).toBe('FORM');
    expect(picker.container.id).toBe('form-language');
    expect(picker.links).toHaveLength(2);
    expect(picker.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
    expect(picker.links.every((l) => l.el.tagName === 'BUTTON')).toBe(true);
  });

  it('does not classify the /ru logo or breadcrumb home anchors', () => {
    const anchors = document.querySelectorAll<HTMLAnchorElement>(
      'a[href="https://bosch-centre.com.ua/ru"]',
    );
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(classifyLanguageElement(a)).toBeNull();
    }
  });

  it('does not classify the /ru-return-warranty anchor', () => {
    const anchor = document.querySelector<HTMLAnchorElement>('a[href$="/ru-return-warranty"]');
    expect(anchor).not.toBeNull();
    expect(classifyLanguageElement(anchor!)).toBeNull();
  });

  it('filterPickers hides only the form, never <body>', () => {
    filterPickers(findLanguagePickers(), ['uk', 'en'], undefined, testContentPresenter);

    expect(Object.hasOwn(document.body.dataset, 'movarHidden')).toBe(false);
    expect(document.body.style.display).not.toBe('none');

    const form = document.querySelector<HTMLElement>('#form-language')!;
    expect(form.style.display).toBe('none');
    const host = form.previousElementSibling as HTMLElement | null;
    expect(host?.dataset['movarKind']).toBe('picker-container');
  });
});
