/**
 * Tests for the tier-7 visible-text sampler.
 *
 * jsdom doesn't implement `HTMLElement.innerText`, which the production
 * sampler relies on for browser-native hidden-subtree skipping. To exercise
 * the same contract under jsdom we install a small `innerText` polyfill in
 * `beforeAll` — it walks the DOM and skips `display:none` / `visibility:hidden`
 * subtrees, matching the visible-text behaviour real browsers ship. The
 * polyfill is test-only; the production sampler is the 5-line implementation
 * in page-text.ts.
 *
 * The polyfill stays minimal — enough to verify landmark precedence, the
 * 2000-char cap, and the hidden-element skip. It is NOT a faithful spec
 * implementation of innerText (no layout-aware line-breaking, no
 * `text-transform`, etc.) and isn't expected to be one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleVisibleText } from './page-text';

let originalInnerText: PropertyDescriptor | undefined;

beforeAll(() => {
  originalInnerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return collectVisibleText(this);
    },
  });
});

afterAll(() => {
  if (originalInnerText) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', originalInnerText);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
  }
});

const INVISIBLE_TAGS = new Set(['script', 'style', 'noscript']);

function isInvisible(el: HTMLElement): boolean {
  if (INVISIBLE_TAGS.has(el.tagName.toLowerCase())) return true;
  if (el.style.display === 'none') return true;
  if (el.style.visibility === 'hidden') return true;
  return false;
}

function collectVisibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      if (text) parts.push(text);
      return;
    }
    if (!(node instanceof HTMLElement) || isInvisible(node)) return;
    for (const child of node.childNodes) walk(child);
  };
  for (const child of root.childNodes) walk(child);
  return parts.join('');
}

describe('sampleVisibleText — landmark precedence', () => {
  it('prefers <main> over the body', () => {
    document.body.innerHTML = `
      <header>Header noise</header>
      <main>Article body content</main>
      <footer>Footer noise</footer>
    `;
    expect(sampleVisibleText()).toBe('Article body content');
  });

  it('falls back to <article> when there is no <main>', () => {
    document.body.innerHTML = `
      <header>Header noise</header>
      <article>The article text</article>
      <aside>Sidebar noise</aside>
    `;
    expect(sampleVisibleText()).toBe('The article text');
  });

  it('falls back to [role="main"] when there is no <main> or <article>', () => {
    document.body.innerHTML = `
      <header>Header noise</header>
      <div role="main">Role main content</div>
      <footer>Footer noise</footer>
    `;
    expect(sampleVisibleText()).toBe('Role main content');
  });

  it('falls back to <body> when no landmark is present', () => {
    document.body.innerHTML = '<div>Plain body content</div>';
    expect(sampleVisibleText()).toBe('Plain body content');
  });

  it('prefers <main> over <article> when both are present', () => {
    document.body.innerHTML = `
      <article>Article noise</article>
      <main>Main wins</main>
    `;
    expect(sampleVisibleText()).toBe('Main wins');
  });
});

describe('sampleVisibleText — 2000-char cap', () => {
  it('caps the result at 2000 chars', () => {
    document.body.innerHTML = `<main>${'a'.repeat(5000)}</main>`;
    const result = sampleVisibleText();
    expect(result).toHaveLength(2000);
  });

  it('returns the full text when under the cap', () => {
    const text = 'short text';
    document.body.innerHTML = `<main>${text}</main>`;
    expect(sampleVisibleText()).toBe(text);
  });

  it('trims leading and trailing whitespace before applying the cap', () => {
    // Leading/trailing whitespace kept as explicit `\n`/space escapes so the
    // intent stays visible in source (vs. literal blank lines).
    document.body.innerHTML = '<main>\n  Hello world  \n</main>';
    expect(sampleVisibleText()).toBe('Hello world');
  });
});

describe('sampleVisibleText — hidden-element behaviour', () => {
  it('skips display:none subtrees inside the landmark', () => {
    document.body.innerHTML = `
      <main>Visible<span style="display:none">Hidden</span>Tail</main>
    `;
    expect(sampleVisibleText()).toBe('VisibleTail');
  });

  it('skips visibility:hidden subtrees inside the landmark', () => {
    document.body.innerHTML = `
      <main>Visible<span style="visibility:hidden">Hidden</span>Tail</main>
    `;
    expect(sampleVisibleText()).toBe('VisibleTail');
  });

  it('strips inline <script> content', () => {
    document.body.innerHTML = `
      <main>Real text<script>const noise = "hidden";</script></main>
    `;
    expect(sampleVisibleText()).toBe('Real text');
  });

  it('strips inline <style> content', () => {
    document.body.innerHTML = `
      <main>Real text<style>.x { color: red; }</style></main>
    `;
    expect(sampleVisibleText()).toBe('Real text');
  });
});

describe('sampleVisibleText — fallbacks', () => {
  it('returns empty string when body has no text', () => {
    document.body.innerHTML = '';
    expect(sampleVisibleText()).toBe('');
  });

  it('accepts a custom Document argument', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<main>Custom doc content</main>';
    expect(sampleVisibleText(doc)).toBe('Custom doc content');
  });
});
