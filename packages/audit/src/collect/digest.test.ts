import { describe, expect, it } from 'vitest';
import { digestDocument, MAX_TEXT_NODE_SAMPLES, nodePathOf } from './digest';

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

  it('reports the cap rather than truncating silently', () => {
    const many = Array.from({ length: MAX_TEXT_NODE_SAMPLES + 20 }, (_, i) => `<p>text ${i}</p>`);
    const { sampling } = digest(many.join(''));
    expect(sampling.sampled).toBe(MAX_TEXT_NODE_SAMPLES);
    expect(sampling.examined).toBeGreaterThan(sampling.sampled);
    expect(sampling.cappedAt).toBe(MAX_TEXT_NODE_SAMPLES);
  });

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
});

describe('links', () => {
  it('records rel and hreflang where present', () => {
    const { document } = digest('<a href="/uk/" rel="alternate" hreflang="uk">uk</a>');
    expect(document.links[0]?.href).toBe('/uk/');
    expect(document.links[0]?.rel).toBe('alternate');
    expect(document.links[0]?.hreflang).toBe('uk');
  });
});
