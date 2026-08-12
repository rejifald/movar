#!/usr/bin/env node
/**
 * Parity guard: the "full changelog" link in the store notes resolves to a page
 * that actually exists, in the reader's language.
 *
 * Every product surface that names the changelog builds its URL from one place
 * — `changelogPath()` / `changelogUrl()` in `@movar/brand`. The extension's
 * popup and options footers, the Safari host app's About footer, and the
 * marketing site's `localeChangelogHref()` all read it.
 *
 * `CHANGELOG_URLS` in `scripts/lib/release-notes.mjs` is the one holdout, and
 * it is the copy with the worst failure mode: it is appended to the note that
 * ships into the App Store's "What's New" and AMO's release notes, which cannot
 * be edited after review.
 *
 * It cannot import the builder. That module is loaded by `apple-submit.mjs` and
 * `amo-release-notes.mjs`, which run as bare `node scripts/…mjs` in workflow
 * jobs that deliberately never run `pnpm install` — `safari-submit.yml` (plan +
 * apply) and the AMO step in `release.yml` check out the repo, set up Node, and
 * run. No `node_modules`, so no `tsx` and no workspace package to resolve.
 * Making it import `@movar/brand` would mean adding a dependency install to the
 * App Store submission path to save two string literals; the trade is not worth
 * it.
 *
 * So that one copy stays, and this makes its drift loud. It runs in CI's
 * `verify` job and in `pnpm validate`, where `node_modules` does exist — off
 * the release path entirely, so it can fail a PR but never a submission.
 *
 * It weakens nothing: `check:release-notes` and
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
import { SITE_URL, changelogUrl, type SiteLocale } from '../packages/brand/src/index.ts';

import { strings, localeChangelogHref } from '../apps/marketing/src/i18n.ts';
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

console.log('==> changelog URL parity');

/**
 * Every locale the marketing site renders — derived, not listed, so adding a
 * third site language fails here until the store notes learn about it.
 * `withChangelogLink` degrades to the bare note for a locale it has no entry
 * for, which is the right runtime behaviour (a missing footer must never block
 * a release) and exactly why it needs a build-time guard: without one, a new
 * locale would ship store notes with no changelog link and nothing would say so.
 */
const siteLocales = Object.keys(strings) as SiteLocale[];
if (siteLocales.length > 0) ok(`marketing locales: ${siteLocales.join(', ')}`);
else bad('marketing locales', 'no locales found in apps/marketing/src/i18n.ts `strings`');

/**
 * Store locale codes as the platforms spell them, mapped to the site locale
 * they must resolve to. App Store Connect and AMO both say `en-US` where
 * RELEASE-NOTES.md says `en`; `noteForLocale` bridges that, and the bridge is
 * part of what can drift.
 */
const storeLocales: Record<string, SiteLocale> = { uk: 'uk', en: 'en', 'en-US': 'en' };

for (const locale of siteLocales) {
  // The site actually serves the page the shared builder points at. A route
  // rename fails here rather than shipping a dead link into a store listing
  // that cannot be edited after review. `localeChangelogHref` delegates to
  // `changelogPath`, so this also pins the delegation in place.
  const href = localeChangelogHref(locale);
  const route = resolve(repoRoot, `apps/marketing/src/pages${href}.astro`);
  if (existsSync(route)) ok(`[${locale}] route exists: apps/marketing/src/pages${href}.astro`);
  else bad(`[${locale}] route missing`, `localeChangelogHref('${locale}') → ${href}, no ${route}`);
}

// The store footer, asserted through `withChangelogLink` rather than by reading
// its URL table: that also proves the label table agrees with the URL table,
// since a locale present in one and missing from the other silently produces no
// footer at all.
//
// The expected value comes from the shared builder — `changelogUrl` with a
// version that is not a release, which is the bare page with no `#v…` anchor.
// A store note covers many versions' worth of history, so it links the page,
// not one release on it.
for (const [storeLocale, locale] of Object.entries(storeLocales)) {
  if (!siteLocales.includes(locale)) continue;
  const expected = changelogUrl(locale, 'unreleased');
  if (expected !== `${SITE_URL}${localeChangelogHref(locale)}`) {
    bad(
      `[${storeLocale}] shared builder disagrees with the site's own routing`,
      `changelogUrl → ${expected}, SITE_URL + localeChangelogHref → ${SITE_URL}${localeChangelogHref(locale)}`,
    );
    continue;
  }
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
      '  Every product surface builds this URL from `@movar/brand`; the store-note\n' +
      '  footer spells it out because it runs without node_modules (see the header\n' +
      '  of this file). Reconcile:\n' +
      '    packages/brand/src/index.ts     changelogPath() / changelogUrl()\n' +
      '    scripts/lib/release-notes.mjs   CHANGELOG_URLS / CHANGELOG_LABELS\n' +
      '    apps/marketing/src/pages/       the page the path resolves to',
  );
  process.exit(1);
}

console.log('\n✓ changelog URLs agree between the shared builder and the store notes.');
