#!/usr/bin/env node
/**
 * Parity guard: every "full changelog" link in the repo resolves to a page that
 * actually exists, in the reader's language.
 *
 * Three places independently know that the changelog lives at `/changelog` in
 * English and `/uk/changelog` in Ukrainian:
 *
 *   1. `apps/marketing/src/i18n.ts` — `localeChangelogHref()`, the site's own
 *      routing, and therefore the authority. It is right by construction only
 *      as long as the route files below it exist.
 *   2. `apps/extension/src/lib/changelog-url.ts` — `changelogUrl()`, behind the
 *      footer version stamp in the popup and options page.
 *   3. `scripts/lib/release-notes.mjs` — `CHANGELOG_URLS`, appended to the note
 *      that ships into the App Store's "What's New" and AMO's release notes.
 *
 * They are duplicated rather than collapsed into one builder, and this guard is
 * the reason that is safe. Collapsing them is blocked on a runtime boundary:
 * (3) runs as bare `node scripts/…mjs` in jobs that deliberately never run
 * `pnpm install` — `.github/workflows/safari-submit.yml` (plan + apply) and the
 * AMO step in `release.yml` check out the repo, set up Node, and run. No
 * `node_modules`, so no `tsx` and no workspace package to import from. Making
 * (3) import a shared builder would mean adding a dependency install to the App
 * Store submission path to save two string literals; the trade is not worth it.
 *
 * So the duplication stays and the drift is made loud instead. This runs in
 * CI's `verify` job and in `pnpm validate`, where `node_modules` does exist —
 * off the release path entirely, so it cannot fail a submission, only a PR.
 *
 * What it does NOT do is weaken anything: `check:release-notes` and
 * `scripts/lib/release-notes.test.mjs` are untouched and still run under plain
 * Node as the submission preflight.
 *
 * Run: tsx scripts/check-changelog-urls.mts   (also `pnpm check:changelog-urls`)
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// By relative path, not by package name: root scripts are not a workspace
// member, so `@movar/brand` does not resolve from here. Same shape as
// `scripts/gen-theme-css.mts` reaching into `../packages/theme/src/render`.
import { SITE_URL } from '../packages/brand/src/index.ts';

import { strings, localeChangelogHref, type Locale } from '../apps/marketing/src/i18n.ts';
import { changelogUrl } from '../apps/extension/src/lib/changelog-url.ts';
import { withChangelogLink } from './lib/release-notes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (label: string): void => {
  console.log(`  ✓ ${label}`);
};
const bad = (label: string, detail: string): void => {
  console.error(`  ✗ ${label}\n    ${detail}`);
  failed += 1;
};
const eq = (label: string, actual: string, expected: string): void => {
  if (actual === expected) ok(label);
  else bad(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log('==> changelog URL parity');

/**
 * Every locale the marketing site renders — derived, not listed, so adding a
 * third site language fails here until the extension and the store notes learn
 * about it. `withChangelogLink` degrades to the bare note for a locale it has
 * no entry for, which is the right runtime behaviour (a missing footer must
 * never block a release) and exactly why it needs a build-time guard: without
 * one, a new locale would ship store notes with no changelog link and nothing
 * would say so.
 */
const siteLocales = Object.keys(strings) as Locale[];
if (siteLocales.length > 0) ok(`marketing locales: ${siteLocales.join(', ')}`);
else bad('marketing locales', 'no locales found in apps/marketing/src/i18n.ts `strings`');

/**
 * Store locale codes as the platforms spell them, mapped to the site locale
 * they must resolve to. App Store Connect and AMO both say `en-US` where
 * RELEASE-NOTES.md says `en`; `noteForLocale` bridges that, and the bridge is
 * part of what can drift.
 */
const storeLocales: Record<string, Locale> = { uk: 'uk', en: 'en', 'en-US': 'en' };

for (const locale of siteLocales) {
  const href = localeChangelogHref(locale);
  const expected = `${SITE_URL}${href}`;

  // 1. The site actually serves that path. A page rename fails here rather
  //    than shipping a 404 into a store listing that cannot be edited after
  //    review.
  const route = resolve(repoRoot, `apps/marketing/src/pages${href}.astro`);
  if (existsSync(route)) ok(`[${locale}] route exists: apps/marketing/src/pages${href}.astro`);
  else bad(`[${locale}] route missing`, `localeChangelogHref('${locale}') → ${href}, no ${route}`);

  // 2. The extension's footer version stamp. Unversioned first (the bare page),
  //    then anchored — the anchor is the extension's own concern, but the page
  //    it hangs off has to be the same one.
  eq(`[${locale}] extension changelogUrl (unanchored)`, changelogUrl(locale, 'preview'), expected);
  eq(
    `[${locale}] extension changelogUrl (anchored)`,
    changelogUrl(locale, '1.6.2'),
    `${expected}#v1.6.2`,
  );
}

// 3. The store footer, asserted through `withChangelogLink` rather than by
//    reading its URL table: that also proves the label table agrees with the
//    URL table, since a locale present in one and missing from the other
//    silently produces no footer at all.
for (const [storeLocale, locale] of Object.entries(storeLocales)) {
  if (!siteLocales.includes(locale)) continue;
  const expected = `${SITE_URL}${localeChangelogHref(locale)}`;
  const note = 'What is new\n• A thing';

  const text = withChangelogLink(note, storeLocale, { format: 'text' });
  if (text === note) {
    bad(
      `[${storeLocale}] store note (text) has no changelog footer`,
      `withChangelogLink returned the note unchanged — ${storeLocale} is missing from CHANGELOG_URLS or CHANGELOG_LABELS in scripts/lib/release-notes.mjs`,
    );
  } else if (text.startsWith(`${note}\n\n`) && text.endsWith(`: ${expected}`)) {
    // Asserted by shape, not by exact string: the label is editorial wording
    // that may legitimately change, the URL is not.
    ok(`[${storeLocale}] store note (text) links ${expected}`);
  } else {
    bad(
      `[${storeLocale}] store note (text)`,
      `expected a footer ending ": ${expected}", got ${JSON.stringify(text)}`,
    );
  }

  const html = withChangelogLink(note, storeLocale, { format: 'html' });
  if (html.includes(`href="${expected}"`))
    ok(`[${storeLocale}] store note (html) links ${expected}`);
  else bad(`[${storeLocale}] store note (html)`, `expected href="${expected}" in ${html}`);
}

if (failed > 0) {
  console.error(
    `\n✗ ${failed} changelog URL parity check(s) failed.\n` +
      '  The changelog path is duplicated in three places on purpose (see the\n' +
      '  header of this file). Update all of them together:\n' +
      '    apps/marketing/src/i18n.ts        localeChangelogHref()\n' +
      '    apps/extension/src/lib/changelog-url.ts  changelogUrl()\n' +
      '    scripts/lib/release-notes.mjs     CHANGELOG_URLS / CHANGELOG_LABELS',
  );
  process.exit(1);
}

console.log('\n✓ changelog URLs agree across the site, the extension, and the store notes.');
