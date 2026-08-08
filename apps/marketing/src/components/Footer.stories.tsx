import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FEEDBACK_URL, SOURCE_URL } from '@movar/brand';

import { socialLinks } from '../lib/social-links';
import {
  strings,
  localeHomeHref,
  localeInstallHref,
  localePrivacyHref,
  localeTransparencyHref,
} from '../i18n';
import type { Locale } from '../i18n';

/** React mock of `Footer.astro`. */
function FooterMock({ lang = 'en' as Locale, year = new Date().getFullYear() }): JSX.Element {
  const t = strings[lang].footer;
  const privacy = localePrivacyHref(lang);
  const transparency = localeTransparencyHref(lang);
  const home = localeHomeHref(lang);
  const install = localeInstallHref(lang);
  const installLabel = strings[lang].installGuide.linkLabel;
  return (
    <footer className="border-border bg-surface text-ink-soft mt-auto border-t px-6 py-8 text-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-3">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" width={20} height={20} className="rounded" />
            <span className="font-display text-ink-strong font-bold">movar.fyi</span>
          </div>
          <nav className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-5 sm:gap-y-2">
            <a
              href={privacy}
              className="hover:text-ink-strong -mx-2 px-2 py-3 transition sm:mx-0 sm:p-0"
            >
              {t.privacy}
            </a>
            <a
              href={transparency}
              className="hover:text-ink-strong -mx-2 px-2 py-3 transition sm:mx-0 sm:p-0"
            >
              {t.transparency}
            </a>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink-strong -mx-2 px-2 py-3 transition sm:mx-0 sm:p-0"
            >
              {t.sourceCode}
            </a>
            <a
              href={`${home}#download`}
              className="hover:text-ink-strong -mx-2 px-2 py-3 transition sm:mx-0 sm:p-0"
            >
              {t.download}
            </a>
            <a
              href={install}
              className="hover:text-ink-strong -mx-2 px-2 py-3 transition sm:mx-0 sm:p-0"
            >
              {installLabel}
            </a>
            <a
              href={FEEDBACK_URL}
              className="hover:text-ink-strong -mx-2 px-2 py-3 transition sm:mx-0 sm:p-0"
            >
              {t.feedback}
            </a>
          </nav>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
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
