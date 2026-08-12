/*
 * Where the footer's version stamp points: the public changelog on movar.fyi,
 * deep-linked to the version the user is actually running.
 *
 * The stamp used to be inert text — a user who noticed a new version number had
 * nowhere to go to find out what changed. `movar.fyi/changelog` renders
 * `apps/extension/store-assets/RELEASE-NOTES.md` (the same file the store
 * listings read), so this link lands on the one set of release notes rather
 * than a store page that only ever shows the latest.
 *
 * Locale mirrors `localeChangelogHref()` in `apps/marketing/src/i18n.ts` — the
 * site's `/uk` prefix is duplicated here rather than imported because the
 * extension does not depend on the Astro app. `scripts/check-changelog-urls.mts`
 * fails CI if this copy, the site's routing, or the store-note footer in
 * `scripts/lib/release-notes.mjs` stop agreeing, so they move together by
 * enforcement rather than by memory.
 */
import { SITE_URL } from '@movar/brand';
import type { ResolvedLocale } from '@movar/i18n';

/** A released version — `1.6.2`, optionally with a pre-release suffix. Anything
 *  else (notably the `'preview'` fallback the static-serve preview renders when
 *  `getManifest()` is unavailable) has no anchor on the page. */
const RELEASED_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * The changelog URL for `locale`, anchored at `version` when that version is a
 * real release. The anchor matches the `id` each release carries in
 * `apps/marketing/src/components/Changelog.astro` (`v` + the version) — an
 * unreleased or unknown version simply opens the top of the page, which is the
 * newest release, rather than a fragment that resolves to nothing.
 */
export function changelogUrl(locale: ResolvedLocale, version: string): string {
  const path = locale === 'uk' ? '/uk/changelog' : '/changelog';
  const anchor = RELEASED_VERSION.test(version) ? `#v${version}` : '';
  return `${SITE_URL}${path}${anchor}`;
}
