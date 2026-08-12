/*
 * The footer version stamp, shared by the popup and the options page.
 *
 * Both footers used to render the same inert `<span>v1.6.2</span>`. It's the one
 * place in the UI that names a release, so it's where a user goes looking for
 * what changed — this makes it the link to `movar.fyi/changelog`, anchored at
 * the running version (see `changelog-url.ts`). Shared rather than duplicated so
 * the two surfaces can't drift into linking differently.
 *
 * Resting appearance is unchanged from the old span (same type ramp, no
 * underline) — it reads as a stamp until hovered or focused.
 */
import type { JSX } from 'react';
import type { ResolvedLocale } from '@movar/i18n';
import { changelogUrl } from './changelog-url';

interface VersionLinkProps {
  /** Manifest version, without the `v` prefix (`1.6.2`). */
  version: string;
  /** Resolved UI locale — picks the changelog's language on the site. */
  locale: ResolvedLocale;
  /** `t.versionLink`: takes the rendered stamp, returns the accessible name. */
  label: (stamp: string) => string;
}

export function VersionLink({ version, locale, label }: Readonly<VersionLinkProps>): JSX.Element {
  const stamp = `v${version}`;
  const name = label(stamp);
  return (
    <a
      href={changelogUrl(locale, version)}
      // The popup is a transient window and the options page is a regular tab;
      // in both, navigating in place would throw away the surface the user is
      // standing on. `noopener` keeps the changelog from reaching back through
      // `window.opener`.
      target="_blank"
      rel="noopener noreferrer"
      title={name}
      aria-label={name}
      className="hover:text-ink-strong text-ui-micro font-mono tracking-wide transition-colors"
    >
      {stamp}
    </a>
  );
}
