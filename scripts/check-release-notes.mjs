#!/usr/bin/env node
// scripts/check-release-notes.mjs
//
// Refuse to release a version whose user-facing notes are missing, empty, or
// still the scaffold.
//
// This is the gate that makes RELEASE-NOTES.md un-forgettable. Without it the
// failure modes are all silent-ish and all late: the App Store rejects the
// version on metadata (after the build has been uploaded), the Firefox listing
// and movar.fyi/changelog simply show nothing, and a Ukrainian visitor — the
// primary audience — sees an empty page. Running here means the release stops
// before any store sees anything.
//
// Wired into `scripts/verify-release.sh`, so it runs in the release workflow's
// `prepare` job — ahead of every store job, and ahead of the approval gate.
//
// Run: node scripts/check-release-notes.mjs   (also `pnpm check:release-notes`)

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseNotes, noteForLocale } from './lib/release-notes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = 'apps/extension/store-assets/RELEASE-NOTES.md';

/** Both are required every release — see the file's own preamble. */
const REQUIRED_LOCALES = ['uk', 'en'];

/** Shorter than this is a stub, not a note. */
const MIN_LENGTH = 20;

const version =
  (process.env.VERSION ?? '').trim() ||
  JSON.parse(readFileSync(resolve(repoRoot, 'apps/extension/package.json'), 'utf8')).version;

const notes = parseReleaseNotes(readFileSync(resolve(repoRoot, NOTES), 'utf8'));
const problems = [];

const forVersion = notes.get(version);
if (!forVersion) {
  problems.push(
    `no "## ${version}" block. Run \`pnpm version:packages\` to scaffold one, or add it by hand.`,
  );
} else {
  for (const locale of REQUIRED_LOCALES) {
    const note = noteForLocale(forVersion, locale);
    if (note === undefined) {
      problems.push(`no "### … (${locale})" block under "## ${version}".`);
    } else if (note.trim().length < MIN_LENGTH) {
      problems.push(
        `the ${locale} note under "## ${version}" is empty or a stub (${note.trim().length} chars) — the scaffold was never filled in.`,
      );
    }
  }
}

if (problems.length) {
  console.error(`✗ release notes for ${version} are not ready:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\n  ${NOTES} feeds the App Store, the Firefox listing, movar.fyi/changelog and the\n` +
      `  GitHub Release. Shipping without it means the App Store rejects the version on\n` +
      `  metadata and every other surface shows a blank.`,
  );
  process.exit(1);
}

console.log(
  `✓ release notes: "${version}" has ${REQUIRED_LOCALES.join(' + ')} notes ready for every surface.`,
);
