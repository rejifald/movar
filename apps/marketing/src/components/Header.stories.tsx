import { useState } from 'react';
import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ChevronDown, Menu, X } from 'lucide-react';

import { headerEntries, isHeaderGroup } from '../lib/header-links';
import { strings, localeHomeHref } from '../i18n';
import type { Locale } from '../i18n';
import { browserIconPaths, githubIconPath } from '../lib/browser-icons';
import type { BrowserId } from '../lib/downloads';

/**
 * The detected browser whose glyph the Download link carries — or `unknown`,
 * the no-detection state where it points at GitHub releases (GitHub mark).
 */
type Browser = BrowserId | 'unknown';

interface MockProps {
  lang?: Locale;
  browser?: Browser;
}

/**
 * Logo the client script prepends before the Download label: the matching
 * browser glyph, or the GitHub mark for the `unknown` fallback.
 */
function DownloadGlyph({ browser }: Readonly<{ browser: Browser }>): JSX.Element {
  const path = browser === 'unknown' ? githubIconPath : browserIconPaths[browser];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/**
 * React mock of `Header.astro` — entries inline on desktop, behind a hamburger
 * on mobile. The «Для мови» group is a `<details>` in the real header, so it is
 * one here too: a `useState` disclosure would look right and behave differently
 * from the thing it stands in for.
 */
function HeaderMock({ lang = 'en', browser = 'chrome' }: Readonly<MockProps>): JSX.Element {
  const t = strings[lang];
  const home = localeHomeHref(lang);
  const [open, setOpen] = useState(false);
  const entries = headerEntries(lang);
  return (
    <header className="border-border/60 bg-bg/85 supports-[backdrop-filter]:bg-bg/70 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href={home} className="font-display text-ink-strong flex items-center gap-3 font-bold">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <span className="text-lg tracking-tight">
            movar<span className="text-accent-text">.fyi</span>
          </span>
        </a>
        <nav className="text-ink-soft hidden items-center gap-x-5 text-sm sm:flex">
          {entries.map((entry) =>
            isHeaderGroup(entry) ? (
              <details key={entry.id} className="group relative">
                <summary className="hover:text-ink-strong inline-flex cursor-pointer list-none items-center gap-1 transition [&::-webkit-details-marker]:hidden">
                  {entry.label}
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-border bg-surface absolute top-full left-0 z-10 mt-3 min-w-44 rounded-lg border p-1.5 shadow-lg">
                  {entry.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="hover:bg-surface-2 hover:text-ink-strong block rounded-md px-3 py-2 whitespace-nowrap transition"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </details>
            ) : (
              <a
                key={entry.href}
                href={entry.href}
                className="hover:text-ink-strong inline-flex items-center gap-2 transition"
              >
                {entry.download && <DownloadGlyph browser={browser} />}
                {entry.label}
              </a>
            ),
          )}
        </nav>
        <button
          type="button"
          aria-label={t.nav.menu}
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
          }}
          className="text-ink-soft hover:text-ink-strong -mr-2 inline-flex items-center justify-center rounded-md p-2 transition sm:hidden"
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <nav className="border-border/60 border-t sm:hidden">
          <ul className="text-ink-soft mx-auto flex max-w-5xl flex-col px-4 py-2 text-sm">
            {entries.map((entry) =>
              isHeaderGroup(entry) ? (
                <li key={entry.id} className="border-border/60 mb-2 border-b pb-2">
                  <p className="tracking-label text-ink-faint px-2 pt-3 pb-1 font-mono text-xs font-semibold uppercase">
                    {entry.label}
                  </p>
                  <ul>
                    {entry.links.map((link) => (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          className="hover:bg-surface hover:text-ink-strong flex items-center gap-2 rounded-lg px-2 py-3 transition"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={entry.href}>
                  <a
                    href={entry.href}
                    className="hover:bg-surface hover:text-ink-strong flex items-center gap-2 rounded-lg px-2 py-3 transition"
                  >
                    {entry.download && <DownloadGlyph browser={browser} />}
                    {entry.label}
                  </a>
                </li>
              ),
            )}
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
    browser: {
      control: { type: 'inline-radio' },
      options: [
        'chrome',
        'edge',
        'firefox',
        'opera',
        'brave',
        'safari',
        'safari-ios',
        'unknown',
      ] satisfies Browser[],
    },
  },
} satisfies Meta<typeof HeaderMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en', browser: 'chrome' } };
export const Ukrainian: Story = { args: { lang: 'uk', browser: 'chrome' } };
export const GitHubFallback: Story = {
  name: 'GitHub fallback · unknown browser',
  args: { lang: 'en', browser: 'unknown' },
};
