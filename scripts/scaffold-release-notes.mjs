#!/usr/bin/env node
// scripts/scaffold-release-notes.mjs
//
// After `changeset version` bumps the package and writes the new CHANGELOG
// section, open a matching block in RELEASE-NOTES.md — empty uk and en slots,
// with the changesets summaries quoted inline to distil from.
//
// WHY IT RUNS HERE
//
// Release notes are the step that gets forgotten, and forgetting them is
// expensive and silent: the App Store rejects a version whose localization has
// no "What's New", the Firefox listing and movar.fyi/changelog just show
// nothing, and none of that surfaces until the release is already moving. This
// puts the empty block in the version PR's diff, where it is impossible to
// miss, next to the changelog text it should be distilled from. `pnpm
// check:release-notes` then refuses to release while a slot is still empty.
//
// It deliberately does NOT write the notes. Changesets summaries are developer
// voice and English only — the right register for CHANGELOG.md and the wrong
// one for a Ukrainian user reading a store listing. Machine-filling the slots
// from them would produce exactly the text this split exists to avoid, and
// would satisfy the guard while doing so.
//
// Idempotent: a block for the version is left alone, so re-running
// `pnpm version:packages` never clobbers notes already written.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseNotes } from './lib/release-notes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = 'apps/extension/store-assets/RELEASE-NOTES.md';
const CHANGELOG = 'apps/extension/CHANGELOG.md';
const PKG = 'apps/extension/package.json';

/** Pull one version's section out of the changesets-generated CHANGELOG. */
function changelogSection(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.trim());
}

/**
 * Quote the changelog as an HTML comment. It is context for the human, not
 * shipped text — and being a comment means an unedited scaffold cannot leak
 * developer prose into a store listing even if someone commits it as-is.
 */
function scaffold(version, changelogLines) {
  const quoted = changelogLines.length
    ? changelogLines.map((l) => `  ${l}`).join('\n')
    : '  (no changesets summaries found for this version)';
  return `## ${version}

<!-- Distil the user-facing highlights below into both locales, then delete
     this comment. User's voice: what changed for them, not for the code.
     \`pnpm check:release-notes\` fails while either fenced block is empty.

     From CHANGELOG.md:

${quoted}
-->

### Українська (uk)

\`\`\`
\`\`\`

### English (en)

\`\`\`
\`\`\`

`;
}

const notesPath = resolve(repoRoot, NOTES);
// VERSION override exists so the scaffold can be exercised without bumping the
// package — the guard takes the same override, so both sides of the contract
// are testable.
const version =
  (process.env.VERSION ?? '').trim() ||
  JSON.parse(readFileSync(resolve(repoRoot, PKG), 'utf8')).version;
const notes = readFileSync(notesPath, 'utf8');

if (parseReleaseNotes(notes).has(version)) {
  console.log(`✓ RELEASE-NOTES.md already has a block for ${version} — leaving it alone.`);
  process.exit(0);
}

// New blocks go directly under the `---` that closes the file's preamble, so
// the newest version stays at the top.
const separator = '\n---\n\n';
const at = notes.indexOf(separator);
if (at === -1) {
  console.error(
    `✗ ${NOTES} has no '---' separator after its preamble; cannot place the new block.`,
  );
  process.exit(1);
}

const changelog = changelogSection(readFileSync(resolve(repoRoot, CHANGELOG), 'utf8'), version);
const insertAt = at + separator.length;
writeFileSync(
  notesPath,
  notes.slice(0, insertAt) + scaffold(version, changelog) + notes.slice(insertAt),
);

console.log(
  `✓ Opened an empty ${version} block in ${NOTES} (${changelog.length} changelog line(s) quoted).\n` +
    `  Write both locales before releasing — pnpm check:release-notes will fail until you do.`,
);
