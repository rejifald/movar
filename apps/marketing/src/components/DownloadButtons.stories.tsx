import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings } from '../i18n';
import type { Locale } from '../i18n';
import { browserIconPaths, githubIconPath } from '../lib/browser-icons';

/**
 * React mock of `DownloadButtons.astro`. The Astro version SSR-renders the
 * neutral "Add Movar to your browser" label (with the GitHub releases href),
 * then an inline script detects the browser and swaps in the per-browser
 * label + target. The button is ALWAYS enabled; when the matched store isn't
 * live yet it becomes inert (no-op click) and shows a "Soon" chip.
 *
 * This mock skips the script and takes `browser` + `live` controls so each
 * post-detection state has its own story. `live` is ignored for `unknown`
 * (GitHub is always available, so unknown is never Soon).
 */
type Browser =
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'opera'
  | 'brave'
  | 'safari'
  | 'safari-ios'
  | 'unknown';

interface MockProps {
  lang?: Locale;
  browser?: Browser;
  /** Whether the matched store has `liveAt` set. Mocks the "Soon" → live flip. */
  live?: boolean;
}

/** Per-browser label, with the GitHub fallback label for unknown browsers. */
function resolveLabel(t: (typeof strings)[Locale]['download'], browser: Browser): string {
  if (browser === 'unknown') return t.viaGithub;
  if (browser in t.add) return t.add[browser];
  return t.addGeneric;
}

/**
 * Logo prepended before the label by the Astro client script on detection: the
 * matching browser glyph, or the GitHub mark for the `unknown` fallback (which
 * routes to GitHub releases).
 */
function BrowserGlyph({ browser }: Readonly<{ browser: Browser }>): JSX.Element {
  const path = browser === 'unknown' ? githubIconPath : browserIconPaths[browser];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** The CTA anchor on its own — shared by the single-state mock and the gallery. */
function CtaButton({
  lang = 'en',
  browser = 'unknown',
  live = false,
}: Readonly<MockProps>): JSX.Element {
  const t = strings[lang].download;
  // A recognised browser whose store isn't live yet → inert + "Soon" chip.
  // Unknown browsers route to GitHub releases, so they're never Soon.
  const soon = browser !== 'unknown' && !live;

  return (
    <a
      {...(soon ? {} : { href: '#' })}
      className="group border-accent bg-accent text-accent-on inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm transition hover:shadow-md"
    >
      <BrowserGlyph browser={browser} />
      <span>{resolveLabel(t, browser)}</span>
      {soon && (
        <span className="text-accent-on rounded-md bg-black/25 px-2 py-1 text-[11px] font-medium tracking-wide uppercase">
          {t.soon}
        </span>
      )}
    </a>
  );
}

function DownloadButtonsMock(props: Readonly<MockProps>): JSX.Element {
  return (
    <div className="grid place-items-center px-6 py-20">
      <div id="download" className="flex justify-center">
        <CtaButton {...props} />
      </div>
    </div>
  );
}

const meta = {
  title: 'Marketing/DownloadButtons',
  component: DownloadButtonsMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
    browser: {
      control: { type: 'inline-radio' },
      options: [
        'unknown',
        'chrome',
        'edge',
        'firefox',
        'opera',
        'brave',
        'safari',
        'safari-ios',
      ] satisfies Browser[],
    },
    live: { control: 'boolean' },
  },
} satisfies Meta<typeof DownloadButtonsMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const FallbackUnknown: Story = {
  name: 'GitHub fallback · unknown browser',
  args: { lang: 'en', browser: 'unknown', live: false },
};
export const SoonChrome: Story = {
  name: 'Soon · Chrome',
  args: { lang: 'en', browser: 'chrome', live: false },
};
export const LiveSafari: Story = {
  name: 'Live · Safari (macOS)',
  args: { lang: 'en', browser: 'safari', live: true },
};
export const LiveSafariIos: Story = {
  name: 'Live · Safari (iOS)',
  args: { lang: 'en', browser: 'safari-ios', live: true },
};
export const LiveFirefox: Story = {
  name: 'Live · Firefox',
  args: { lang: 'en', browser: 'firefox', live: true },
};
export const SoonUkrainian: Story = {
  name: 'Soon · Chrome · Ukrainian',
  args: { lang: 'uk', browser: 'chrome', live: false },
};

/**
 * Every per-browser CTA on one screen so the branded glyphs can be eyeballed
 * side by side. Each row shows the live (store-linked) button next to its
 * detection key; `unknown` is the text-only GitHub fallback.
 */
const GALLERY_BROWSERS: Browser[] = [
  'chrome',
  'edge',
  'firefox',
  'opera',
  'brave',
  'safari',
  'safari-ios',
  'unknown',
];

export const AllBrowsers: Story = {
  name: 'Gallery · all browsers',
  parameters: { controls: { disable: true } },
  render: ({ lang = 'en' }) => (
    <div className="mx-auto grid max-w-md gap-4 px-6 py-12">
      {GALLERY_BROWSERS.map((browser) => (
        <div key={browser} className="flex items-center justify-between gap-6">
          <code className="text-ink-soft text-xs">{browser}</code>
          <CtaButton lang={lang} browser={browser} live />
        </div>
      ))}
    </div>
  ),
};
