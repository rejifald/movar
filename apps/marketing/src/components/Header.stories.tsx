import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale, localeHomeHref, localePrivacyHref } from '../i18n';

/** React mock of `Header.astro` — sticky nav with the brand mark + section links. */
function HeaderMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang];
  const home = localeHomeHref(lang);
  const privacy = localePrivacyHref(lang);
  return (
    <header className="border-border/60 bg-bg/85 supports-[backdrop-filter]:bg-bg/70 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href={home} className="font-display text-ink-strong flex items-center gap-2.5 font-bold">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <span className="text-lg tracking-tight">
            movar<span className="text-accent">.fyi</span>
          </span>
        </a>
        <nav className="text-ink-soft flex items-center gap-x-5 text-sm">
          <a
            href={`${home}#how-it-works`}
            className="hover:text-ink-strong hidden transition sm:inline"
          >
            {t.nav.howItWorks}
          </a>
          <a
            href={`${home}#examples`}
            className="hover:text-ink-strong hidden transition sm:inline"
          >
            {t.nav.examples}
          </a>
          <a
            href={`${home}#limitations`}
            className="hover:text-ink-strong hidden transition sm:inline"
          >
            {t.nav.limitations}
          </a>
          <a href={`${home}#download`} className="hover:text-ink-strong transition">
            {t.nav.download}
          </a>
          <a href={privacy} className="hover:text-ink-strong transition">
            {t.nav.privacy}
          </a>
        </nav>
      </div>
    </header>
  );
}

const meta = {
  title: 'Marketing/Header',
  component: HeaderMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof HeaderMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
