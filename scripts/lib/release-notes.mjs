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
