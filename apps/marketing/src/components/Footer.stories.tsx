import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DISCORD_URL, FEEDBACK_URL, SOURCE_URL } from '@movar/brand';

import { socialLinks } from '../lib/social-links';
import {
  strings,
  localeChangelogHref,
  localeHomeHref,
  localeHowMovarWorksHref,
  localeInstallHref,
  localePrivacyHref,
  localeTransparencyHref,
  localeWhyNotAiHref,
} from '../i18n';
import type { Locale } from '../i18n';

/** React mock of `Footer.astro`. Mirrors its four-column grouping — see the
 *  component for why the single row stopped working at nine links. */
function FooterMock({ lang = 'en' as Locale, year = new Date().getFullYear() }): JSX.Element {
  const t = strings[lang].footer;
  const home = localeHomeHref(lang);
  const hero = strings[lang].hero;
  const tagline = `${hero.headlineLine1} ${hero.headlineLine2}`;
  const columns = [
    {
      id: 'install',
      heading: t.groups.install,
      links: [
        { href: `${home}#download`, label: t.download, external: false },
        {
          href: localeInstallHref(lang),
          label: strings[lang].installGuide.linkLabel,
          external: false,
        },
        { href: localeChangelogHref(lang), label: t.changelog, external: false },
      ],
    },
    {
      id: 'understand',
      heading: t.groups.understand,
      links: [
        { href: localeHowMovarWorksHref(lang), label: t.howMovarWorks, external: false },
        {
          href: localeWhyNotAiHref(lang),
          label: strings[lang].whyNotAi.linkLabel,
          external: false,
        },
        { href: SOURCE_URL, label: t.sourceCode, external: true },
      ],
    },
    {
      id: 'trust',
      heading: t.groups.trust,
      links: [
        { href: localePrivacyHref(lang), label: t.privacy, external: false },
        { href: localeTransparencyHref(lang), label: t.transparency, external: false },
      ],
    },
    {
      id: 'contact',
      heading: t.groups.contact,
      links: [
        { href: FEEDBACK_URL, label: t.email, external: false },
        { href: DISCORD_URL, label: t.discord, external: true },
      ],
    },
  ];
  return (
    <footer className="border-border bg-surface text-ink-soft mt-auto border-t px-6 py-8 text-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="" width={20} height={20} className="rounded" />
              <span className="font-display text-ink-strong font-bold">movar.fyi</span>
            </div>
            <p className="text-ink-faint max-w-48">{tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-8 lg:flex lg:gap-x-10">
            {columns.map((column) => (
              <nav key={column.id} aria-labelledby={`footer-${column.id}`}>
                <h2
                  id={`footer-${column.id}`}
                  className="font-display tracking-label text-ink-faint text-xs font-bold uppercase"
                >
                  {column.heading}
                </h2>
                <ul className="mt-2 flex flex-col sm:mt-3 sm:gap-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noopener noreferrer' : undefined}
                        className="hover:text-ink-strong -mx-2 inline-block px-2 py-3 transition sm:mx-0 sm:p-0"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="border-border/60 flex flex-col items-start gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span>
            &copy; {year} {t.credits}
          </span>
          <ul
            aria-label={t.social.label}
            className="-ml-2 flex items-center gap-1 sm:-mr-2 sm:ml-0"
          >
            {socialLinks.map((social) => (
              <li key={social.id}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.social[social.id]}
                  className="hover:text-ink-strong inline-flex p-2 transition"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    className="size-5"
                  >
                    <path d={social.iconPath} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

const meta = {
  title: 'Marketing/Footer',
  component: FooterMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
    year: { control: 'number' },
  },
} satisfies Meta<typeof FooterMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
