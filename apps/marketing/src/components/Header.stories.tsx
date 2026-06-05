import { useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Menu, X } from 'lucide-react';

import { FEEDBACK_URL } from '@movar/brand';

import { FALLBACK_HREF } from '../lib/downloads';
import { strings, type Locale, localeHomeHref, localePrivacyHref } from '../i18n';

/** React mock of `Header.astro` — links inline on desktop, behind a hamburger on mobile. */
function HeaderMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang];
  const home = localeHomeHref(lang);
  const privacy = localePrivacyHref(lang);
  const [open, setOpen] = useState(false);
  const links = [
    { href: FALLBACK_HREF, label: t.nav.download },
    { href: FEEDBACK_URL, label: t.nav.feedback },
    { href: privacy, label: t.nav.privacy },
  ];
  return (
    <header className="border-border/60 bg-bg/85 supports-[backdrop-filter]:bg-bg/70 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href={home} className="font-display text-ink-strong flex items-center gap-2.5 font-bold">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <span className="text-lg tracking-tight">
            movar<span className="text-accent">.fyi</span>
          </span>
        </a>
        <nav className="text-ink-soft hidden items-center gap-x-5 text-sm sm:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-ink-strong transition">
              {link.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          aria-label={t.nav.menu}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="text-ink-soft hover:text-ink-strong -mr-2 inline-flex items-center justify-center rounded-md p-2 transition sm:hidden"
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <nav className="border-border/60 border-t sm:hidden">
          <ul className="text-ink-soft mx-auto flex max-w-5xl flex-col px-4 py-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="hover:bg-surface hover:text-ink-strong flex items-center gap-1.5 rounded-lg px-2 py-3 transition"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
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
