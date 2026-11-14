import { describe, expect, it } from 'vitest';
import { MOCK_HOSTS, SCENES, resolveRoute } from '../src/mock/routes';

function get(url: string): ReturnType<typeof resolveRoute> {
  const u = new URL(url);
  return resolveRoute(u.hostname, `${u.pathname}${u.search}`);
}

function bodyOf(url: string): string {
  const hit = get(url);
  if (hit === null) throw new Error(`no route for ${url}`);
  return hit.body;
}

describe('scene 1: google search', () => {
  const start = SCENES.google.startUrl;

  it('serves the un-rewritten SERP at the start URL', () => {
    const hit = get(start);
    expect(hit?.status).toBe(200);
    expect(hit?.body).toContain('<html lang="ru">');
  });

  it('serves the Ukrainian SERP once Movar adds hl=uk&lr', () => {
    const finalUrl = `${start}&hl=uk&lr=lang_uk%7Clang_en`;
    const body = bodyOf(finalUrl);
    expect(body).toContain('<html lang="uk">');
    // The extractor anchors: #rso > data-hveid card > h3, snippet data-sncf.
    expect(body).toContain('id="rso"');
    expect(body.match(/data-hveid=/g)?.length).toBe(7);
    expect(body).toContain('data-sncf="1"');
    // Russian results carry Google's translate link with the declared source.
    expect(body.match(/sl=ru/g)?.length).toBe(2);
  });

  it('treats other queries and paths as misses', () => {
    expect(get('https://www.google.com/search?q=other')).toBeNull();
    expect(get('https://www.google.com/maps')).toBeNull();
  });

  it('bounces the bare host to www', () => {
    expect(get('https://google.com/search?q=x')?.headers['location']).toBe(
      'https://www.google.com/search?q=x',
    );
  });
});

describe('scene 2: tochka24', () => {
  it('serves the Russian default behind a blocking language gate', () => {
    const body = bodyOf(SCENES.tochka24.startUrl);
    expect(body).toContain('<html lang="ru">');
    expect(body).toContain('id="language-gate"');
    expect(body).toContain('hreflang="uk" href="https://tochka24.example/uk/"');
  });

  it('serves the Ukrainian page with no gate and a three-entry language menu', () => {
    const body = bodyOf(SCENES.tochka24.finalUrl);
    expect(body).toContain('<html lang="uk">');
    expect(body).not.toContain('id="language-gate"');
    expect(body).toContain('id="lang-menu-button"');
    expect(body.match(/<li><a /g)?.length).toBe(3);
    for (const label of ['Українська', 'English', 'Русский']) expect(body).toContain(label);
  });

  it('answers the sibling language paths and misses the rest', () => {
    expect(get('https://tochka24.example/ru/')?.status).toBe(200);
    expect(get('https://tochka24.example/en/')?.status).toBe(200);
    expect(get('https://tochka24.example/nope')).toBeNull();
  });
});

describe('scene 3: youtube', () => {
  it('serves an 8-card feed on both mobile and desktop hosts', () => {
    for (const host of ['m.youtube.com', 'www.youtube.com']) {
      const body = bodyOf(`https://${host}/`);
      expect(body.match(/<ytm-video-with-context-renderer /g)?.length).toBe(8);
    }
  });

  it('misses an unknown path', () => {
    expect(get('https://m.youtube.com/watch?v=1')).toBeNull();
  });
});

describe('route table', () => {
  it('only answers for mocked hosts', () => {
    expect(resolveRoute('example.org', '/')).toBeNull();
    expect(MOCK_HOSTS).toContain('www.google.com');
  });

  it('answers favicon requests quietly on every mocked host', () => {
    for (const host of MOCK_HOSTS) expect(resolveRoute(host, '/favicon.ico')?.status).toBe(204);
  });

  it('keeps every rendered page free of external resources and banned strings', () => {
    const urls = [
      `${SCENES.google.startUrl}`,
      `${SCENES.google.startUrl}&hl=uk`,
      SCENES.tochka24.startUrl,
      SCENES.tochka24.finalUrl,
      'https://tochka24.example/en/',
      SCENES.youtube.startUrl,
    ];
    for (const url of urls) {
      const body = bodyOf(url);
      expect(body).not.toMatch(/<script[^>]+src=/);
      expect(body).not.toMatch(/<link[^>]+rel="stylesheet"/);
      expect(body).not.toMatch(/@import|url\(\s*['"]?https?:/);
      expect(body).not.toMatch(/<img[^>]+src="https?:/);
      // Every absolute URL targets a fictitious or Google/YouTube host; never `.ru`.
      for (const m of body.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        const host = (m[1] ?? '').toLowerCase();
        expect(host).not.toMatch(/\.ru$/);
        expect(host).toMatch(/\.example$|^(www\.|translate\.)?google\.com$|^tochka24\.example$/);
      }
      // Ukrainian apostrophe is U+02BC; never U+2019 / ASCII between letters.
      expect(body).not.toMatch(/[А-Яа-яІіЇїЄє][’'][А-Яа-яІіЇїЄє]/);
    }
  });
});
