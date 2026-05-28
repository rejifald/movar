import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/**
 * React mock of `BeforeAfter.astro`.
 *
 * The Astro version checks for two PNGs in `public/screenshots/` and
 * silently omits the section when either is missing. The PNGs don't exist
 * yet — the story would otherwise render broken `<img>` icons in the
 * placeholder cards.
 *
 * To keep the layout visually meaningful in the gallery, the story
 * renders an inline mock SERP (Russian for "without", Ukrainian for
 * "with") inside each frame by default. Once the real screenshots land at
 * `apps/marketing/public/screenshots/google-{without,with}-movar.png`,
 * flip the `useRealImages` control to point at them instead.
 */
interface MockProps {
  lang?: Locale;
  /** Mirrors the `hasImages` silent-omit in .astro — section returns null. */
  missing?: boolean;
  /**
   * Render the real `/screenshots/google-{without,with}-movar.png` files
   * instead of the inline mock SERP. Only works once they're captured;
   * Storybook serves the marketing app's `/public/` at the root.
   */
  useRealImages?: boolean;
}

type Variant = 'without' | 'with';

interface SerpItem {
  site: string;
  title: string;
  snippet: string;
}

/**
 * Module-level mock SERP item lists. Hoisting them out of `MockSerp`
 * keeps the function under the unit-size threshold and signals that
 * these are static, not parameterised per render.
 */
const WITHOUT_ITEMS: readonly SerpItem[] = [
  {
    site: 'ru.wikipedia.example',
    title: 'Политика — Википедия',
    snippet:
      'Политика (от греч. πολιτικά) — общественная деятельность, связанная с распределением власти…',
  },
  {
    site: 'gazeta.example',
    title: 'Новости политики России и мира',
    snippet:
      'Главные политические события дня, заявления первых лиц, аналитика и комментарии экспертов…',
  },
  {
    site: 'lenta.example',
    title: 'Политика в Украине: последние события',
    snippet:
      'Обзор политических событий на Украине, заявления чиновников и партий, реакция избирателей…',
  },
];

const WITH_ITEMS: readonly SerpItem[] = [
  {
    site: 'uk.wikipedia.example',
    title: 'Політика — Вікіпедія',
    snippet: 'Полі́тика (від грец. πολιτικά) — суспільна діяльність, повʼязана з розподілом влади…',
  },
  {
    site: 'pravda.example',
    title: 'Українська політика — новини та аналітика',
    snippet:
      'Останні події української політики, оперативні новини з парламенту, коментарі експертів…',
  },
  {
    site: 'novyny.example',
    title: 'Політика в Україні: огляд тижня',
    snippet: 'Огляд основних політичних подій тижня, інтервʼю з експертами, аналітичні матеріали…',
  },
];

/**
 * Inline mock SERP used as a placeholder until the real screenshots land.
 * Russian when `variant === 'without'` (what Google returns for a Cyrillic
 * query absent Movar) and Ukrainian when `variant === 'with'` (what Movar
 * negotiates for the same query). Hostnames use `.example` and brand-free
 * names so nothing reads as a real site.
 */
function MockSerp({ variant }: { variant: Variant }): JSX.Element {
  const items = variant === 'without' ? WITHOUT_ITEMS : WITH_ITEMS;
  return (
    <div className="size-full overflow-hidden bg-white p-5 text-left">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] text-zinc-600">
        <span aria-hidden="true">🔍</span>
        <span>політика</span>
      </div>
      <div className="space-y-3.5">
        {items.map((item) => (
          <div key={item.site}>
            <div className="text-[10px] tracking-wide text-zinc-400 uppercase">{item.site}</div>
            <div className="mt-0.5 text-[13px] leading-snug font-medium text-blue-700">
              {item.title}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-600">
              {item.snippet}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Comparison {
  label: string;
  variant: Variant;
  caption: string;
  src: string;
  alt: string;
}

function buildComparisons(t: (typeof strings)[Locale]['beforeAfter']): readonly Comparison[] {
  return [
    {
      label: t.without,
      variant: 'without',
      caption: t.withoutCaption,
      src: '/screenshots/google-without-movar.png',
      alt: 'Google search results for a Cyrillic query, with Russian-language pages dominating',
    },
    {
      label: t.withMovar,
      variant: 'with',
      caption: t.withCaption,
      src: '/screenshots/google-with-movar.png',
      alt: 'Same Google search, now returning Ukrainian-language pages',
    },
  ];
}

function ComparisonFigure({
  c,
  useRealImages,
}: {
  c: Comparison;
  useRealImages: boolean;
}): JSX.Element {
  return (
    <figure
      className={`bg-bg rounded-2xl border p-3 shadow-sm ${
        c.variant === 'with' ? 'border-accent/30' : 'border-border'
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-white">
        {useRealImages ? (
          <img src={c.src} alt={c.alt} loading="lazy" className="size-full object-cover" />
        ) : (
          <MockSerp variant={c.variant} />
        )}
      </div>
      <figcaption className="mt-3 px-1 pb-1">
        <div
          className={`font-mono text-xs tracking-[0.1em] uppercase ${
            c.variant === 'with' ? 'text-accent' : 'text-ink-faint'
          }`}
        >
          {c.label}
        </div>
        <p className="text-ink mt-1 text-sm">{c.caption}</p>
      </figcaption>
    </figure>
  );
}

function BeforeAfterMock({
  lang = 'en' as Locale,
  missing = false,
  useRealImages = false,
}: MockProps): JSX.Element | null {
  const t = strings[lang].beforeAfter;
  if (missing) return null;
  const comparisons = buildComparisons(t);

  return (
    <section id="before-after" className="border-border bg-surface border-t px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {comparisons.map((c) => (
            <ComparisonFigure key={c.variant} c={c} useRealImages={useRealImages} />
          ))}
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/BeforeAfter',
  component: BeforeAfterMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
    missing: { control: 'boolean' },
    useRealImages: { control: 'boolean' },
  },
} satisfies Meta<typeof BeforeAfterMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en', missing: false, useRealImages: false } };
export const Ukrainian: Story = { args: { lang: 'uk', missing: false, useRealImages: false } };
export const RealScreenshots: Story = {
  name: 'Real screenshots (once captured)',
  args: { lang: 'en', missing: false, useRealImages: true },
};
export const ImagesMissing: Story = {
  name: 'Images missing (section omitted)',
  args: { lang: 'en', missing: true },
};
