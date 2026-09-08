/** Movar brand & contact constants — shared by the extension and marketing site. */

/** Movar's support inbox. Reports and feedback are addressed here; nothing is
 *  ever sent automatically — the user's own mail client composes and sends. */
export const SUPPORT_EMAIL = 'support@movar.fyi';

/**
 * Where users can send feedback. Used by the options page and marketing site.
 * (The popup uses a contextual "report an issue" mailto instead — it prefills
 * the active page's URL; see the popup's report-mailto builder.)
 */
export const FEEDBACK_URL = `mailto:${SUPPORT_EMAIL}?subject=Movar%20feedback`;

/** Public source repository. Movar is open source under the MIT license. */
export const SOURCE_URL = 'https://github.com/rejifald/movar';

/**
 * Movar's marketing site — origin only, no trailing slash.
 *
 * Deliberately not a set of per-page URLs: the site is bilingual and its `/uk`
 * prefix is the site's own routing concern (`localeHomeHref` and friends in
 * `apps/marketing/src/i18n.ts`). Consumers outside the site compose the path
 * they need on top of this origin. Two pages are exceptions — the changelog and
 * the uninstall page; see {@link changelogPath} and {@link uninstallPath} at the
 * bottom of this file for why those two routes had to move here.
 */
export const SITE_URL = 'https://movar.fyi';

/**
 * Movar's Discord server — the community channel, alongside `FEEDBACK_URL` for
 * anything that needs a private reply.
 *
 * MUST be a never-expiring invite ("Expire after: Never", "Max uses: No limit"
 * in Discord's invite settings). Discord's default invite dies after 7 days,
 * and this link is printed on a static site that nobody re-checks — verify with
 * `curl -s https://discord.com/api/v10/invites/<code>` and confirm the response
 * carries `"expires_at": null` before changing it.
 */
export const DISCORD_URL = 'https://discord.gg/tRfbndt6C';

/** Movar on Instagram. */
export const INSTAGRAM_URL = 'https://www.instagram.com/movar.fyi/';

/** Movar on Facebook. Numeric profile URL — the page has no vanity handle. */
export const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61591986419299';

// ---------------------------------------------------------------------------
// Derived URLs — the changelog.
//
// FOUR surfaces need to name the changelog and they used to each spell it out:
// the extension's popup and options footers, the Safari host app's About
// footer, and the marketing site's own footer link. Three of those are outside
// the Astro app and can't import its `i18n.ts`; the host app can't import the
// extension's `src/lib` either. So the `/uk` prefix and the `#v…` anchor rule
// live here — the one package all four already depend on — instead of being
// copied into each.
// ---------------------------------------------------------------------------

/**
 * The languages the marketing site publishes. Structurally identical to
 * `@movar/i18n`'s `ResolvedLocale` and the marketing app's `Locale`, declared
 * locally so this package stays a zero-dep leaf the Astro site can import.
 */
export type SiteLocale = 'en' | 'uk';

/**
 * A released version — `1.6.2`, optionally with a pre-release suffix.
 *
 * Anything else has no entry on the page to anchor to: the extension renders
 * `'preview'` when `getManifest()` is unavailable under static-serve, and the
 * Safari host app renders `'dev'` when the build-time version define is absent.
 * Browsers silently ignore an unmatched fragment, so `#vpreview` would land at
 * the top of the page behind a URL that merely looks broken — better to emit no
 * fragment and mean it.
 */
const RELEASED_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Site-relative path to the changelog page for `locale`.
 *
 * This is the site's own `/uk`-prefix routing convention, which every localized
 * page follows — `apps/marketing/src/i18n.ts` keeps a `locale*Href` helper per
 * page and `localeChangelogHref` delegates here. It is the one of that family
 * that also has readers outside the Astro app (see {@link changelogUrl}), which
 * is the only reason it lives in this package rather than beside its siblings.
 */
export function changelogPath(locale: SiteLocale): string {
  return locale === 'uk' ? '/uk/changelog' : '/changelog';
}

/**
 * Absolute changelog URL for `locale`, anchored at `version` when that version
 * is a real release — what a product surface's `v<version>` stamp links to.
 *
 * The anchor matches the `id` each release carries in
 * `apps/marketing/src/components/Changelog.astro` (`v` + the version); both
 * sides take the version string from the same `RELEASE-NOTES.md` headings. An
 * unreleased or unknown version simply opens the top of the page, which is the
 * newest release.
 *
 * The extension follows this as a plain `target="_blank"` anchor; the Safari
 * host app's WKWebView runs under `default-src 'self'` and hands it to Swift's
 * `open-url` case instead. Only the opening differs — the URL is built here.
 */
export function changelogUrl(locale: SiteLocale, version: string): string {
  const anchor = RELEASED_VERSION.test(version) ? `#v${version}` : '';
  return `${SITE_URL}${changelogPath(locale)}${anchor}`;
}

// ---------------------------------------------------------------------------
// Derived URLs — the uninstall page.
//
// `browser.runtime.setUninstallURL` is handed a URL by the background worker,
// which lives outside the Astro app and so cannot import its `i18n.ts` — the
// same bind that moved `changelogPath` here. This is the second and, for now,
// last exception to "no per-page URLs in this package".
// ---------------------------------------------------------------------------

/**
 * Site-relative path to the uninstall page for `locale`.
 *
 * Mirrors {@link changelogPath}, with one difference worth knowing: the
 * changelog is linked from the site, so `apps/marketing` keeps its own
 * `localeChangelogHref` that delegates here. Nothing links to the uninstall page
 * — it is reached only by the browser's uninstall hook — so there is no
 * `locale*Href` twin, and this is the ONLY place the route is spelled. Adding
 * one would be dead code, which `pnpm metrics` rejects.
 *
 * `pnpm check:locale-redirects` still enforces that the page has a `uk/`
 * counterpart and a MIRRORED_PAGES entry; `index.test.ts` pins what this builds.
 */
export function uninstallPath(locale: SiteLocale): string {
  return locale === 'uk' ? '/uk/uninstall' : '/uninstall';
}

/**
 * Absolute uninstall URL for `locale`, carrying `version` when it is a real
 * release — what `browser.runtime.setUninstallURL` is set to.
 *
 * The version is the ONLY thing this URL ever carries, and it describes the
 * build, not the person: it is identical for every user on that release, and
 * the page it opens has no form, no analytics and no account. Adding any
 * further parameter would make the extension report on the user at the one
 * moment it can no longer be inspected, which is exactly what the
 * network-silent promise forbids — see `scripts/lib/promises.mts`.
 *
 * An unreleased or unknown version (`preview` under static-serve, `dev` in the
 * host app — see {@link RELEASED_VERSION}) emits no parameter at all rather
 * than a bare `?v=` or a fabricated value; the page renders its own no-version
 * copy in that case.
 */
export function uninstallUrl(locale: SiteLocale, version: string): string {
  const query = RELEASED_VERSION.test(version) ? `?v=${encodeURIComponent(version)}` : '';
  return `${SITE_URL}${uninstallPath(locale)}${query}`;
}
