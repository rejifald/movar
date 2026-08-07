import type { JSX } from 'react';
import { browser } from 'wxt/browser';
import { renderBrowserUi } from '@movar/browser-ui';
import type { BrowserUiLocale, BrowserUiMockup } from '@movar/browser-ui';

/**
 * Mounts a `@movar/browser-ui` mockup — a recreation of the real browser UI the
 * step is pointing at.
 *
 * The mockups live in a package, and render to an HTML string rather than to
 * components, because the marketing site's /install page has to show the same
 * picture for the same step and is Astro with no React integration. Before that
 * package existed these were two hand-maintained files kept in step by a comment
 * asking the next person to keep them in step.
 */

const ICON_PATH = '/icon/48.png';

/** The icon the browser itself shows for Movar. Resolved through `runtime` so
 *  it's the packaged asset, falling back to the plain path under test, where
 *  there's no extension origin to resolve against.
 *
 *  The cast mirrors `lib/capability-loader.ts`: WXT's typed `getURL` only
 *  accepts paths it knows about at build time and rejects this one. */
function iconSrc(): string {
  try {
    const runtime = browser.runtime as unknown as { getURL(path: string): string };
    return runtime.getURL(ICON_PATH);
  } catch {
    return ICON_PATH;
  }
}

interface StepIllustrationProps {
  readonly mockup: BrowserUiMockup;
  readonly locale: BrowserUiLocale;
}

export function StepIllustration({ mockup, locale }: Readonly<StepIllustrationProps>): JSX.Element {
  const markup = renderBrowserUi(mockup, { locale, iconSrc: iconSrc() });

  return (
    // `contents` so the wrapper adds no box — the mockup sits directly in the
    // step card's flex column, exactly as it sits in the marketing site's step.
    // `aria-hidden` is belt-and-braces: the mockup's own root carries it too,
    // because a screen reader reading out a fake "Add extension" button would
    // be worse than reading nothing.
    <div
      className="contents"
      aria-hidden="true"
      /* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- `markup` is assembled from `@movar/browser-ui`'s own compile-time label catalogue plus ICON_PATH above; no page content, message payload, stored setting, or other runtime input reaches it, every interpolated label goes through the package's `esc`, and it contains no script or event-handler attributes. Mounting a string is the only way an Astro-rendered page and a React tree can carry byte-identical markup, which is the entire reason that package exists. */
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
