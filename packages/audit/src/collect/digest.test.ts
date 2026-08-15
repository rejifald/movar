import { describe, expect, it } from 'vitest';
import { digestDocument, MAX_TEXT_NODE_SAMPLES, nodePathOf } from './digest';
import { evaluate } from '../evaluate';
import type { EvidenceRef } from '../finding';
import { CORE_RULESET } from '../ruleset';
import { isInsideCodeElement } from '../text-samples';
import { filesystemEvidence, makeBuildPage } from '../../test/fixtures';

const PAGE_URL = 'https://example.com/uk/';

function digest(body: string, head = '') {
  return digestDocument(
    `<!doctype html><html lang="uk"><head>${head}</head><body>${body}</body></html>`,
    {
      url: PAGE_URL,
    },
  );
}

describe('htmlLang', () => {
  it('distinguishes absent, empty and set — three different defects', () => {
    expect(digestDocument('<html><body>x</body></html>', {}).document.htmlLang).toBeNull();
    expect(digestDocument('<html lang=""><body>x</body></html>', {}).document.htmlLang).toBe('');
    expect(digestDocument('<html lang="uk-UA"><body>x</body></html>', {}).document.htmlLang).toBe(
      'uk-UA',
    );
  });

  it('captures the tag verbatim — normalization is the kernel’s job', () => {
    expect(
      digestDocument('<html lang="  UK-ua  "><body>x</body></html>', {}).document.htmlLang,
    ).toBe('  UK-ua  ');
  });
});

describe('langAttributes', () => {
  it('collects every other element’s lang and excludes <html>', () => {
    const { document } = digest('<p lang="en">english</p><p>plain</p>');
    expect(document.langAttributes).toHaveLength(1);
    expect(document.langAttributes[0]?.value).toBe('en');
    expect(document.langAttributes[0]?.nodePath).toContain('p');
  });
});

describe('alternates', () => {
  it('reads hreflang links verbatim, including x-default', () => {
    const { document } = digest(
      '',
      '<link rel="alternate" hreflang="uk" href="/uk/">' +
        '<link rel="alternate" hreflang="x-default" href="/">',
    );
    expect(document.alternates.map((a) => a.hreflang)).toEqual(['uk', 'x-default']);
    expect(document.alternates.every((a) => a.source === 'link')).toBe(true);
  });

  it('merges alternates the probe tier found in a Link header', () => {
    const result = digestDocument('<html lang="uk"><body>x</body></html>', {
      url: PAGE_URL,
      headerAlternates: [{ hreflang: 'en', href: 'https://example.com/', source: 'header' }],
    });
    expect(result.document.alternates.map((a) => a.source)).toContain('header');
  });
});

describe('picker', () => {
  it('is null when the site deliberately has no switcher', () => {
    // movar.fyi is exactly this case: the picker rules must read
    // `not-applicable`, never `fail`.
    expect(digest('<p>no switcher here</p>').document.picker).toBeNull();
  });

  it('digests an anchor-list switcher into options with hrefs', () => {
    const { document } = digest(
      '<nav><ul><li><a href="/uk/" hreflang="uk">Українська</a></li>' +
        '<li><a href="/en/" hreflang="en">English</a></li></ul></nav>',
    );
    expect(document.picker).not.toBeNull();
    const labels = document.picker?.options.map((o) => o.label) ?? [];
    expect(labels).toContain('Українська');
    expect(labels).toContain('English');
    expect(document.picker?.options.every((o) => o.href !== null)).toBe(true);
  });

  /** The `null` is what `core/picker-no-navigable-target` adjudicates. */
  it('reports a href-less entry as null rather than softening it', () => {
    const { document } = digest(
      '<nav><ul><li><span>Українська</span></li>' +
        '<li><a href="/en/" hreflang="en">English</a></li></ul></nav>',
    );
    const bare = document.picker?.options.find((o) => o.label === 'Українська');
    expect(bare).toBeDefined();
    expect(bare?.href).toBeNull();
  });

  it('treats a bare # as no navigable target', () => {
    const { document } = digest(
      '<nav><ul><li><a href="#" hreflang="uk">Українська</a></li>' +
        '<li><a href="/en/" hreflang="en">English</a></li></ul></nav>',
    );
    const uk = document.picker?.options.find((o) => o.label === 'Українська');
    expect(uk).toBeDefined();
    expect(uk?.href).toBeNull();
  });
});

describe('textNodes', () => {
  it('records inherited lang from the nearest declaring ancestor', () => {
    const { document } = digest(
      '<div lang="en"><p>a reasonably long english sentence here</p></div>',
    );
    const sample = document.textNodes.find((t) => t.text.includes('english'));
    expect(sample?.inheritedLang).toBe('en');
  });

  it('falls back to the page’s own lang when nothing nearer declares one', () => {
    const { document } = digest('<p>достатньо довге українське речення тут</p>');
    expect(document.textNodes[0]?.inheritedLang).toBe('uk');
  });

  it('classifies nav, footer and main regions', () => {
    const { document } = digest(
      '<nav><a href="/x">navigation text</a></nav>' +
        '<main><p>main body text</p></main>' +
        '<footer><p>footer text</p></footer>',
    );
    const regions = new Set(document.textNodes.map((t) => t.region));
    expect(regions).toContain('nav');
    expect(regions).toContain('main');
    expect(regions).toContain('footer');
  });

  it('never samples script or style text', () => {
    const { document } = digest('<script>var secret = "should not appear";</script><p>visible</p>');
    expect(document.textNodes.some((t) => t.text.includes('secret'))).toBe(false);
    expect(document.textNodes.some((t) => t.text.includes('visible'))).toBe(true);
  });

  /**
   * Slow by construction, so it gets its own timeout.
   *
   * Proving the cap is REPORTED needs a page that actually exceeds it — 1500+
   * elements through jsdom's parser and the node-path walk. That is well under
   * a second normally, but v8 coverage instrumentation on a shared CI runner
   * pushes it past vitest's 5s default, which fails `metrics-gate` while
   * `verify` (the same suite without coverage) passes. The workload is
   * legitimate and the assertion is worth keeping, so the timeout moves rather
   * than the fixture.
   */
  const CAP_TEST_TIMEOUT_MS = 30_000;

  it(
    'reports the cap rather than truncating silently',
    () => {
      const many = Array.from({ length: MAX_TEXT_NODE_SAMPLES + 20 }, (_, i) => `<p>text ${i}</p>`);
      const { sampling } = digest(many.join(''));
      expect(sampling.sampled).toBe(MAX_TEXT_NODE_SAMPLES);
      expect(sampling.examined).toBeGreaterThan(sampling.sampled);
      expect(sampling.cappedAt).toBe(MAX_TEXT_NODE_SAMPLES);
    },
    CAP_TEST_TIMEOUT_MS,
  );

  it('leaves the cap unset when nothing was dropped', () => {
    expect(digest('<p>a short page</p>').sampling.cappedAt).toBeUndefined();
  });
});

describe('nodePathOf', () => {
  it('gives sibling elements of the same tag distinct paths', () => {
    const { document } = digest('<p lang="en">one</p><p lang="de">two</p>');
    const paths = document.langAttributes.map((a) => a.nodePath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths[0]).toContain('nth-of-type(1)');
    expect(paths[1]).toContain('nth-of-type(2)');
  });

  it('omits nth-of-type when an element is unambiguous', () => {
    const { document } = digest('<div><p lang="en">only child</p></div>');
    expect(document.langAttributes[0]?.nodePath).not.toContain('nth-of-type');
  });

  it('roots the path at html', () => {
    const { document } = digest('<p lang="en">x</p>');
    expect(document.langAttributes[0]?.nodePath.startsWith('html')).toBe(true);
  });

  it('is exported so a second collector has an unambiguous spec to match', () => {
    expect(typeof nodePathOf).toBe('function');
  });

  it('numbers the passages of an element that holds more than one', () => {
    const { document } = digest('<p>first passage<br>second passage</p>');
    expect(document.textNodes.map((t) => t.nodePath)).toEqual([
      'html > body > p :: text(1)',
      'html > body > p :: text(2)',
    ]);
  });

  it('leaves a single passage the path it has always published', () => {
    const { document } = digest('<p>the only passage <em>with emphasis</em></p>');
    expect(document.textNodes.map((t) => t.nodePath)).toEqual([
      'html > body > p',
      'html > body > p > em',
    ]);
  });

  /**
   * The ordinal is a fact about the document, never about what survived a
   * sampling gate — or two collectors with different gates would cite the same
   * passage differently, and `nodePath` is the one field they must agree on.
   */
  it('counts a passage the sampler dropped as short', () => {
    const { document } = digest('<p>x<br>a passage long enough to sample</p>');
    expect(document.textNodes.map((t) => t.nodePath)).toEqual(['html > body > p :: text(2)']);
  });

  /** Whitespace between elements is not a passage and must not shift an ordinal. */
  it('does not count the whitespace between block elements', () => {
    const { document } = digest('<div>\n  <span>emphasis</span>\n  the passage after it\n</div>');
    expect(document.textNodes.map((t) => t.nodePath)).toEqual([
      'html > body > div > span',
      'html > body > div',
    ]);
  });

  /** The kernel reads code elements out of this very string — see `isInsideCodeElement`. */
  it('keeps a code element visible through the suffix', () => {
    const { document } = digest('<p><code>npm install<br>pnpm install</code></p>');
    const paths = document.textNodes.map((t) => t.nodePath);
    expect(paths).toEqual([
      'html > body > p > code :: text(1)',
      'html > body > p > code :: text(2)',
    ]);
    expect(paths.every((path) => isInsideCodeElement(path))).toBe(true);
  });
});

/** Digest a body, adjudicate it, and keep one rule's published findings. */
function findingsOf(rule: string, body: string) {
  const { document } = digest(body);
  const report = evaluate(filesystemEvidence([makeBuildPage({ document })]), CORE_RULESET);
  return report.findings.filter((finding) => finding.rule === rule);
}

/** The locations a finding cites, in the order it cites them. */
function citedNodePaths(evidence: readonly EvidenceRef[]): readonly string[] {
  return evidence.filter((ref) => ref.kind === 'node').map((ref) => ref.nodePath);
}

/**
 * A text sample's path must point at the **passage**, not merely at the element
 * around it.
 *
 * Asserted through `CORE_RULESET` because that is where the harm lands: a
 * published finding's `subject.node` and its `node` evidence refs are how a
 * report tells a site owner *which passage* it is about, and two findings that
 * quote one location for two passages are unreadable as evidence.
 *
 * The fixture is the shape of ordinary prose, not an exotic one: a paragraph
 * with an inline link in it has two sibling text nodes under one `<p>`.
 */
describe('a passage is cited by itself, not by the element around it', () => {
  /** Real prose: the classifier must actually have an opinion about both. */
  const RU_FIRST = 'Мы работаем без выходных и отвечаем на все вопросы.';
  const RU_SECOND = 'Оплата возможна картой или наличными при получении заказа.';
  const PARAGRAPH = `<main><p>${RU_FIRST} <a href="/ru/">каталог</a> ${RU_SECOND}</p></main>`;

  it('gives two passages under one element two distinct citations', () => {
    const findings = findingsOf('core/lang-part-unmarked', PARAGRAPH);
    expect(findings).toHaveLength(2);
    const cited = findings.map((finding) => finding.subject.node);
    expect(new Set(cited).size).toBe(2);
  });

  it('does not publish two passages as two byte-identical findings', () => {
    const findings = findingsOf('core/lang-part-unmarked', PARAGRAPH);
    expect(findings).toHaveLength(2);
    // Verdict, summary and denominator are equal by construction here, so the
    // citation is the ONLY field that can tell a reader this report is about
    // two passages rather than one printed twice.
    expect(JSON.stringify(findings[0])).not.toBe(JSON.stringify(findings[1]));
  });

  it('cites two passages inside one finding at two locations', () => {
    // `core/content-language-mixed` gathers the passages into a single finding,
    // so the collapse shows up inside one evidence list rather than across two.
    const [finding] = findingsOf('core/content-language-mixed', PARAGRAPH);
    const cited = citedNodePaths(finding?.evidence ?? []);
    expect(cited).toHaveLength(2);
    expect(new Set(cited).size).toBe(2);
  });
});

describe('links', () => {
  it('records rel and hreflang where present', () => {
    const { document } = digest('<a href="/uk/" rel="alternate" hreflang="uk">uk</a>');
    expect(document.links[0]?.href).toBe('/uk/');
    expect(document.links[0]?.rel).toBe('alternate');
    expect(document.links[0]?.hreflang).toBe('uk');
  });
});

describe('head', () => {
  it('samples <title> as its own field, never as a body text node', () => {
    const { document } = digest('<p>тіло сторінки</p>', '<title>Доставка та оплата</title>');
    expect(document.head?.texts).toEqual([
      { field: 'title', text: 'Доставка та оплата', nodePath: 'html > head > title' },
    ]);
    // The walker starts at <body>, so the title is structurally absent here.
    expect(document.textNodes.some((node) => node.text.includes('Доставка'))).toBe(false);
  });

  it('collapses whitespace in a title spread over several lines', () => {
    const { document } = digest('<p>x</p>', '<title>\n  Доставка\n  та оплата\n</title>');
    expect(document.head?.texts[0]?.text).toBe('Доставка та оплата');
  });

  it('omits an empty title rather than sampling a blank string', () => {
    expect(digest('<p>x</p>', '<title>   </title>').document.head?.texts).toEqual([]);
  });

  /**
   * An unqualified type selector matches every namespace, so `querySelector`
   * took the first `<svg><title>` in the body of a page whose head declared
   * none — an icon's accessible name, published by
   * `core/title-contradicts-declaration` as "this page's <title>" and cited by a
   * node path running through `body`. `<svg>` was already skipped for body
   * sampling, so the two halves of one digest disagreed about the same element.
   */
  it('takes no title from an <svg><title> in the body', () => {
    const { document } = digest(
      '<button aria-label="Кошик"><svg viewBox="0 0 24 24"><title>Shopping cart icon</title></svg></button>',
    );

    expect(document.head?.texts).toEqual([]);
  });

  /**
   * Why this is a namespace fix and not a `doc.head` one. The parser's *in head*
   * insertion mode has no handling for `<svg>`, so a stray one ends the head and
   * a real `<title>` written after it is parsed into the body. `document.title`
   * still reads it, and so must the digest — answering "no title" would describe
   * a page whose browser tab shows one.
   */
  it('still reads a real <title> a stray <svg> pushed out of the head', () => {
    const { document } = digest(
      '<p>x</p>',
      '<svg><title>Icon</title></svg><title>Доставка та оплата</title>',
    );

    expect(document.head?.texts).toEqual([
      { field: 'title', text: 'Доставка та оплата', nodePath: 'html > body > title' },
    ]);
  });

  it("keeps the head's own title when the body carries an <svg><title> too", () => {
    const { document } = digest(
      '<svg><title>Shopping cart icon</title></svg><p>x</p>',
      '<title>Доставка та оплата</title>',
    );

    expect(document.head?.texts).toEqual([
      { field: 'title', text: 'Доставка та оплата', nodePath: 'html > head > title' },
    ]);
  });

  it('reads the description and the og:/twitter: preview fields', () => {
    const { document } = digest(
      '<p>x</p>',
      `<meta name="description" content="Опис сторінки">
       <meta property="og:title" content="OG заголовок">
       <meta property="og:description" content="OG опис">
       <meta name="twitter:title" content="Twitter заголовок">
       <meta name="twitter:description" content="Twitter опис">`,
    );
    expect(document.head?.texts.map((sample) => sample.field)).toEqual([
      'meta-description',
      'og:title',
      'og:description',
      'twitter:title',
      'twitter:description',
    ]);
  });

  it('reads og: from name= and twitter: from property=, as real pages write them', () => {
    // Both vocabularies are spelled with both attributes in the wild; trusting
    // each to have been written correctly loses the field silently.
    const { document } = digest(
      '<p>x</p>',
      `<meta name="og:title" content="one"><meta property="twitter:title" content="two">`,
    );
    expect(document.head?.texts.map((sample) => sample.field)).toEqual([
      'og:title',
      'twitter:title',
    ]);
  });

  it('captures og:locale and its alternates verbatim', () => {
    const { document } = digest(
      '<p>x</p>',
      `<meta property="og:locale" content="uk_UA">
       <meta property="og:locale:alternate" content="en_GB">
       <meta property="og:locale:alternate" content="ru-RU">`,
    );
    expect(document.head?.declarations.map((d) => [d.kind, d.value])).toEqual([
      ['og-locale', 'uk_UA'],
      ['og-locale-alternate', 'en_GB'],
      // Malformed, and kept as written — core/og-locale-malformed adjudicates it.
      ['og-locale-alternate', 'ru-RU'],
    ]);
    expect(document.head?.declarations[0]?.source).toBe('meta');
    expect(document.head?.declarations[0]?.nodePath).toContain('meta');
  });

  it('reads the obsolete content-language meta from http-equiv', () => {
    const { document } = digest('<p>x</p>', '<meta http-equiv="content-language" content="uk">');
    expect(document.head?.declarations).toEqual([
      {
        kind: 'content-language',
        value: 'uk',
        source: 'meta',
        nodePath: 'html > head > meta',
      },
    ]);
  });

  it('folds the Content-Language response header in, with no element to cite', () => {
    // The same treatment `Link:` alternates already get: folding the header
    // into the document digest is what keeps the rule that reads it `static`.
    const { document } = digestDocument('<html lang="uk"><body><p>x</p></body></html>', {
      contentLanguageHeader: 'uk, en',
    });
    expect(document.head?.declarations).toEqual([
      { kind: 'content-language', value: 'uk, en', source: 'header' },
    ]);
  });

  it('collects an empty head rather than omitting it, so absent means "not collected"', () => {
    const { document } = digest('<p>x</p>');
    expect(document.head).toEqual({ declarations: [], texts: [] });
  });

  /**
   * `<meta>` in the body is valid (`itemprop` microdata) and routinely injected
   * by scripts and third-party widgets; the parser leaves it where it found it.
   * Scanned document-wide, a widget's content-language became a head declaration
   * and `core/lang-contradicts-content-language` published a `fail` about a head
   * that never declared it.
   */
  it('ignores a <meta> the page carries outside its head', () => {
    const { document } = digest(
      '<div class="widget"><meta http-equiv="content-language" content="ru">' +
        '<meta name="description" content="Body description"></div><p>x</p>',
      '<meta name="description" content="Опис сторінки">',
    );

    expect(document.head?.declarations).toEqual([]);
    expect(document.head?.texts).toEqual([
      { field: 'meta-description', text: 'Опис сторінки', nodePath: 'html > head > meta' },
    ]);
  });

  it('ignores a meta it has no field for', () => {
    const { document } = digest('<p>x</p>', '<meta name="viewport" content="width=device-width">');
    expect(document.head?.texts).toEqual([]);
    expect(document.head?.declarations).toEqual([]);
  });
});
