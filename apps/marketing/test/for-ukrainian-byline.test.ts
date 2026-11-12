/**
 * Renders the real `ForUkrainian.astro` through Astro's container API against a
 * test-only collection, to pin the address line's three states — no mark
 * (globe), a square mark, a wordmark — and the funding label as plain text.
 *
 * Why a fixture here and not an entry in `src/content/projects`: no real entry
 * carries a mark yet, and a fake one in production content would ship to
 * movar.fyi. `astro:content` is mocked instead, so the collection the
 * component reads is exactly the three entries below.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const base = {
  sphere: 'games',
  summary: { uk: 'Опис.', en: 'Summary.' },
  lastVerified: new Date('2026-11-12'),
  badge: false,
  person: false,
};

const fixtureEntries = [
  {
    id: 'globe',
    data: { ...base, name: 'Аглобус', url: 'https://www.globe.example/', funding: 'volunteer' },
  },
  {
    id: 'square',
    data: {
      ...base,
      name: 'Бквадрат',
      url: 'https://square.example/',
      funding: 'commercial',
      mark: { src: '/_astro/square.svg', width: 24, height: 24, format: 'svg' },
      markConsent: { date: new Date('2026-11-12'), channel: 'email' },
    },
  },
  {
    id: 'wordmark',
    data: {
      ...base,
      name: 'Вслово',
      url: 'https://a-rather-long-host.wordmark.example/',
      funding: 'mixed',
      mark: { src: '/_astro/wordmark.svg', width: 120, height: 32, format: 'svg' },
      markConsent: { date: new Date('2026-11-12'), channel: 'email' },
    },
  },
];

vi.mock('astro:content', () => ({
  getCollection: async () => fixtureEntries,
}));

const { default: ForUkrainian } = await import('../src/components/ForUkrainian.astro');

/** The rendered `<li data-entry>` blocks, keyed by host so a test reads by card. */
let cards: Map<string, string>;

/** The address line: the flex `<p>` right after the card heading. */
const addressLine = (card: string): string =>
  /<\/h3>\s*(<p[^>]*>[\s\S]*?<\/p>)/.exec(card)?.[1] ?? '';

beforeAll(async () => {
  const container = await AstroContainer.create();
  // Vitest renders in dev mode, which stamps every element with its source
  // location; strip those so the assertions read the markup that ships.
  const html = (await container.renderToString(ForUkrainian, { props: { lang: 'uk' } })).replaceAll(
    / data-astro-source-(?:file|loc)="[^"]*"/g,
    '',
  );
  cards = new Map(
    html
      .split('<li data-entry')
      .slice(1)
      .map((chunk) => {
        const card = chunk.slice(0, chunk.indexOf('</li>'));
        const host = /<span class="min-w-0 truncate">([^<]+)<\/span>/.exec(card)?.[1] ?? '';
        return [host, card];
      }),
  );
}, 120_000);

describe('«Для української» card — address line', () => {
  it('renders every fixture card, host truncating last in a 16px row', () => {
    expect([...cards.keys()].toSorted()).toEqual([
      'a-rather-long-host.wordmark.example',
      'globe.example',
      'square.example',
    ]);
    for (const card of cards.values()) {
      expect(addressLine(card)).toMatch(/^<p class="flex h-4 items-center gap-1\.5 /);
      expect(addressLine(card)).toContain('text-ink-faint');
    }
  });

  it('no mark: a decorative 14px globe, no image role, no separator', () => {
    const line = addressLine(cards.get('globe.example') ?? '');
    expect(line).toMatch(/<svg[^>]*width="14"[^>]*height="14"/);
    expect(line).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(line).not.toContain('role="img"');
    expect(line).not.toContain('·');
  });

  it('square mark: the mark in the globe’s 14×14 box, named, no separator', () => {
    const line = addressLine(cards.get('square.example') ?? '');
    expect(line).not.toContain('<svg');
    expect(line).toMatch(/role="img"[^>]*aria-label="Бквадрат"/);
    expect(line).toContain('byline-mark');
    // The quote is entity-escaped inside the attribute; which entity is Astro's call.
    expect(line).toMatch(/--byline-mark: url\((&#34;|&quot;)\/_astro\/square\.svg\1\)/);
    expect(line).toContain('width: 14px; height: 14px');
    expect(line).not.toContain('h-4 max-w-12');
    expect(line).not.toContain('·');
  });

  it('wordmark: line height, own ratio, 48px cap, then a decorative `·`', () => {
    const line = addressLine(cards.get('a-rather-long-host.wordmark.example') ?? '');
    expect(line).not.toContain('<svg');
    expect(line).toMatch(/role="img"[^>]*aria-label="Вслово"/);
    expect(line).toMatch(/class="byline-mark shrink-0 h-4 max-w-12"/);
    expect(line).toContain('aspect-ratio: 120 / 32');
    expect(line).toMatch(
      /<span aria-hidden="true" class="shrink-0">\s*·\s*<\/span>\s*<span class="min-w-0 truncate">/,
    );
  });
});

describe('«Для української» card — funding label', () => {
  it('is plain faint text, not a chip', () => {
    const card = cards.get('square.example') ?? '';
    const label = /<p class="([^"]*)">\s*Комерційний\s*<\/p>/.exec(card);
    expect(label?.[1]).toContain('text-ink-faint');
    expect(label?.[1]).toContain('pt-1');
    expect(label?.[1]).not.toMatch(/\b(border|rounded-md|bg-surface-2)\b/);
  });
});
