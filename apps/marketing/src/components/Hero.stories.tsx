import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CodeXml, ShieldCheck, Tag } from 'lucide-react';

import { strings, type Locale } from '../i18n';

/**
 * React mock of `Hero.astro`. Keep markup + className strings in lockstep
 * when either side changes. The inlined download button mirrors the
 * always-enabled SSR CTA from `DownloadButtons.astro` (neutral label, before
 * browser detection); the detected states have their own story.
 */
function HeroMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].hero;
  const dl = strings[lang].download;
  // Mirror of Hero.astro's claims chip — keep markup + classNames in step.
  const claims = [
    { label: t.badge.free, Icon: Tag },
    { label: t.badge.openSource, Icon: CodeXml },
    { label: t.badge.privacy, Icon: ShieldCheck },
  ];
  return (
    <section className="hero-glow relative px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div className="relative mx-auto max-w-3xl text-center">
        <div className="border-border bg-surface text-ink-soft mb-6 inline-flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm">
          {claims.map(({ label, Icon }) => (
            <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Icon className="text-accent size-3.5 shrink-0" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>

        <h1 className="font-display text-ink-strong text-5xl font-extrabold tracking-tight sm:text-6xl">
          {t.headlineLine1}
          <span className="text-accent block">{t.headlineLine2}</span>
        </h1>

        <p className="text-ink-soft mx-auto mt-6 max-w-2xl text-lg sm:text-xl">{t.subhead}</p>

        <div className="mt-10">
          <div id="download" className="flex justify-center">
            <a
              href="#"
              className="group border-accent bg-accent text-accent-on inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm transition hover:shadow-md"
            >
              <span>{dl.addGeneric}</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Hero',
  component: HeroMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof HeroMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
