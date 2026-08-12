// scripts/lib/release-notes.mjs
//
// Parse apps/extension/store-assets/RELEASE-NOTES.md into per-version,
// per-locale user-facing notes.
//
// One parser, four consumers: the App Store submission, AMO's per-version
// release notes, the marketing site's /changelog, and the GitHub Release body.
//
// The file is the human-authored source of truth (uk leads, en is the
// fallback; both ship every release — see the note at the top of the file).
// Its shape:
//
//     ## 1.6.2
//     …prose about the release, NOT part of the note…
//     ### Українська (uk)
//     ```
//     Що нового у версії 1.6.2
//     • …
//     ```
//     ### English (en)
//     ```
//     What's new in 1.6.2
//     • …
//     ```
//
// Only the fenced block is the note. The prose between the headings is
// editorial context for whoever writes the next one, and must not be shipped.
//
// This is parsed rather than read loosely because a silent miss is expensive
// and late: App Store Connect REJECTS a version whose localizations have no
// "What's New", and the other surfaces just render blank. A parser that quietly
// returned nothing would surface as a metadata rejection far from the actual
// cause, so every extraction failure here is explicit.
//
// It also composes the store-only "full changelog" footer — see
// `withChangelogLink` below.

/** Locale code as written in a `### Name (code)` heading. */
const LOCALE_HEADING = /^###\s+.*\(([a-zA-Z-]+)\)\s*$/;
const VERSION_HEADING = /^##\s+(\d+\.\d+\.\d+)\s*$/;

/**
 * @param {string} markdown  contents of RELEASE-NOTES.md
 * @returns {Map<string, Map<string, string>>} version → locale → note
 */
export function parseReleaseNotes(markdown) {
  /** @type {Map<string, Map<string, string>>} */
  const byVersion = new Map();

  let version = null;
  let locale = null;
  let fence = null;
  /** @type {string[]} */
  let buffer = [];

  const flush = () => {
    if (version && locale) {
      if (!byVersion.has(version)) byVersion.set(version, new Map());
      // First fenced block after the locale heading wins; a second one would
      // be an editing accident, not a second note.
      //
      // An EMPTY block is recorded as '' rather than dropped. That distinction
      // is load-bearing: the scaffold writes empty slots, so dropping them
      // would make `has(version)` false for a block that plainly exists —
      // which made the scaffolder insert a duplicate block on re-run, and made
      // the guard report "no block, run the scaffold" for a block the scaffold
      // had just written. Presence and emptiness are different facts.
      const locales = byVersion.get(version);
      if (!locales.has(locale)) locales.set(locale, buffer.join('\n').trim());
    }
    buffer = [];
  };

  for (const line of markdown.split('\n')) {
    if (fence !== null) {
      if (line.trimEnd() === fence) {
        flush();
        fence = null;
      } else {
        buffer.push(line);
      }
      continue;
    }

    const versionMatch = VERSION_HEADING.exec(line);
    if (versionMatch) {
      version = versionMatch[1];
      locale = null;
      // Register on sight: a version heading with no locale blocks beneath it
      // is a real (if unusable) block, and callers need to tell that apart
      // from the version being absent.
      if (!byVersion.has(version)) byVersion.set(version, new Map());
      continue;
    }

    const localeMatch = LOCALE_HEADING.exec(line);
    if (localeMatch) {
      locale = localeMatch[1];
      continue;
    }

    const fenceMatch = /^(```+)\s*\w*\s*$/.exec(line.trimEnd());
    if (fenceMatch && version && locale) {
      fence = fenceMatch[1];
      buffer = [];
    }
  }

  return byVersion;
}

/**
 * Resolve the note for one App Store locale, tolerating the mismatch between
 * how the file names locales and how App Store Connect does: the file says
 * `en`, App Store Connect says `en-US`. Match exactly first, then on the
 * language subtag, so adding `pt-BR` to the store doesn't silently inherit a
 * `pt` note it wasn't written for — it just reports as missing.
 *
 * @param {Map<string, string>} notes  locale → note for one version
 * @param {string} storeLocale         e.g. "en-US", "uk"
 * @returns {string | undefined}
 */
export function noteForLocale(notes, storeLocale) {
  const exact = notes.get(storeLocale);
  if (exact !== undefined) return exact;
  const language = storeLocale.split('-')[0].toLowerCase();
  for (const [locale, note] of notes) {
    if (locale.toLowerCase() === language) return note;
    if (locale.split('-')[0].toLowerCase() === language) return note;
  }
  return undefined;
}

/**
 * The public changelog on movar.fyi, per locale — en at the root, uk under
 * `/uk/`.
 *
 * Every product surface builds this URL from `changelogUrl()` in
 * `@movar/brand`. This is the one place that spells it out instead, because
 * this module is imported by `apple-submit.mjs` and `amo-release-notes.mjs`,
 * which run as bare `node scripts/…mjs` in workflow jobs that never run
 * `pnpm install` — there is no `node_modules` to resolve a workspace package
 * from. The duplication is deliberate and guarded:
 * `scripts/check-changelog-urls.mts` fails CI if this table stops agreeing
 * with the shared builder or with the site's own route files. Keep the keys of
 * this map and `CHANGELOG_LABELS` identical — a locale in one and not the
 * other silently drops the footer, which is also what that guard checks.
 *
 * Deep-link the page rather than the home page: `/install`
 * carries Chrome / Firefox / Edge store links, and App Store guideline 2.3.10
 * ("no other mobile platforms or alternative app marketplaces in your
 * metadata") is only unarguable if a reviewer following the link never lands
 * on them.
 *
 * Keyed the same way notes are, so `noteForLocale` resolves `en-US` → `en`.
 */
const CHANGELOG_URLS = new Map([
  ['uk', 'https://movar.fyi/uk/changelog'],
  ['en', 'https://movar.fyi/changelog'],
]);

/** Link label, per locale. "журнал змін" matches the site's own wording. */
const CHANGELOG_LABELS = new Map([
  ['uk', 'Повний журнал змін'],
  ['en', 'Full changelog'],
]);

/**
 * Append "full changelog" pointer to a note bound for a store listing.
 *
 * A store note covers ONE version. Someone arriving on 1.7.0 after skipping
 * three releases has no way, from the listing alone, to see what changed in
 * the ones they missed — the store shows one block and the older text is
 * either buried (AMO) or gone (App Store). movar.fyi/changelog is the whole
 * history in the reader's language, so the stores link out to it.
 *
 * Applied at the store boundary rather than written into the fenced block in
 * RELEASE-NOTES.md, for two reasons: the marketing changelog renders those
 * same blocks and would end up linking to itself, and each surface needs its
 * own idiom — App Store's "What's New" is plain text, while AMO's release
 * notes are sanitized HTML (`sanitizeUserHTML`, whose allowlist includes `a`,
 * with newlines converted by `nl2br` first).
 *
 * Both stores permit this: Apple's metadata rules bar other marketplaces and
 * irrelevant content, not a link to your own site, and its 3.1.1 external-link
 * ban is about purchase mechanisms, which Movar has none of. AMO renders the
 * anchor through Mozilla's outgoing-link bouncer.
 *
 * An unknown locale degrades to the bare note instead of throwing. The note is
 * load-bearing — App Store Connect rejects a localization without one — and
 * the footer is not, so a locale we have no label for must not be able to
 * block a release.
 *
 * @param {string} note          the note as written in RELEASE-NOTES.md
 * @param {string} storeLocale   'uk', 'en-US', …
 * @param {{ format: 'text' | 'html' }} options
 * @returns {string}
 */
export function withChangelogLink(note, storeLocale, { format }) {
  const url = noteForLocale(CHANGELOG_URLS, storeLocale);
  const label = noteForLocale(CHANGELOG_LABELS, storeLocale);
  if (!url || !label) return note;
  // Idempotent: a note that already spells out the URL by hand keeps whatever
  // wording the author chose rather than getting a second copy underneath.
  if (note.includes(url)) return note;

  const footer = format === 'html' ? `<a href="${url}">${label}</a>` : `${label}: ${url}`;
  return `${note.trimEnd()}\n\n${footer}`;
}
