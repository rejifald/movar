#!/usr/bin/env node
/**
 * Unit test for the RELEASE-NOTES.md parser.
 *
 * Same self-contained assertion-runner pattern as scripts/lib/promises.test.mts
 * (no vitest project globs the root `scripts/` dir).
 *
 * Why this is worth a test: App Store Connect rejects a version whose
 * localizations carry no "What's New" once the app has shipped once. A parser
 * that silently returns nothing would surface as a metadata rejection at the
 * submission step, long after the actual mistake, on the single most
 * irreversible action in the repo. So it asserts against the LIVE file too —
 * a reformat that breaks extraction fails here, not at Apple.
 *
 * Run: node scripts/lib/release-notes.test.mjs   (also `pnpm test:release-notes`)
 */
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseNotes, noteForLocale, withChangelogLink } from './release-notes.mjs';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..', '..');
let failed = 0;
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, detail) => {
  failed++;
  console.error(`  ✗ ${label}\n    ${detail}`);
};
const eq = (label, actual, expected) =>
  actual === expected
    ? ok(label)
    : fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const truthy = (label, value, detail = '') =>
  value ? ok(label) : fail(label, detail || 'expected a truthy value');

console.log('RELEASE-NOTES parser');

// --- synthetic: the shape, including the traps ---------------------------
const sample = [
  '# Header prose',
  '',
  '## 1.6.2',
  '',
  'Editorial context that must NOT ship.',
  '',
  '### Українська (uk)',
  '',
  '```',
  'Що нового у версії 1.6.2',
  '',
  '• Пункт один',
  '```',
  '',
  '### English (en)',
  '',
  '```',
  "What's new in 1.6.2",
  '```',
  '',
  '## 1.6.1',
  '',
  '### English (en)',
  '',
  '```',
  'Older note',
  '```',
].join('\n');

const parsed = parseReleaseNotes(sample);
eq('finds both versions', [...parsed.keys()].join(','), '1.6.2,1.6.1');
eq('finds both locales for 1.6.2', [...parsed.get('1.6.2').keys()].join(','), 'uk,en');
truthy(
  'keeps the fenced note only',
  parsed.get('1.6.2').get('uk')?.startsWith('Що нового') &&
    !parsed.get('1.6.2').get('uk').includes('Editorial context'),
  'editorial prose leaked into the note, or the note is missing',
);
truthy(
  'preserves blank lines inside a note',
  parsed.get('1.6.2').get('uk')?.includes('\n\n• Пункт один'),
);
eq('scopes notes to their own version', parsed.get('1.6.1').get('en'), 'Older note');

// --- the scaffold's empty slots ------------------------------------------
// Regression: empty blocks used to be dropped entirely, so a scaffolded
// version looked ABSENT. That made the scaffolder write a duplicate block on
// re-run, and made the guard say "no block — run the scaffold" about a block
// the scaffold had just written. Presence and emptiness are different facts.
const scaffolded = parseReleaseNotes(
  [
    '## 2.0.0',
    '',
    '### Українська (uk)',
    '',
    '```',
    '```',
    '',
    '### English (en)',
    '',
    '```',
    '```',
  ].join('\n'),
);
truthy('a scaffolded-but-empty version is PRESENT', scaffolded.has('2.0.0'));
eq('its uk slot reads as empty, not missing', scaffolded.get('2.0.0').get('uk'), '');
eq('its en slot reads as empty, not missing', scaffolded.get('2.0.0').get('en'), '');
eq(
  'a version heading with no locale blocks is still present',
  parseReleaseNotes('## 3.0.0\n\nprose only\n').has('3.0.0'),
  true,
);

// --- locale resolution ----------------------------------------------------
const notes = parsed.get('1.6.2');
truthy('en-US resolves to the en note', noteForLocale(notes, 'en-US')?.startsWith("What's new"));
truthy('uk resolves exactly', noteForLocale(notes, 'uk')?.startsWith('Що нового'));
eq('an unwritten locale reports missing rather than guessing', noteForLocale(notes, 'de-DE'));

// --- the store-only changelog footer --------------------------------------
// The stores show one version's note and nothing else, so they link out to the
// full history. Applied at the store boundary, NOT in RELEASE-NOTES.md, so the
// marketing changelog that renders the same blocks never links to itself.
const ukNote = 'Що нового у версії 1.6.2\n\n• Пункт один';
eq(
  'uk gets the Ukrainian page as plain text',
  withChangelogLink(ukNote, 'uk', { format: 'text' }),
  `${ukNote}\n\nПовний журнал змін: https://movar.fyi/uk/changelog`,
);
eq(
  "the App Store's en-US resolves to the en page",
  withChangelogLink('Note', 'en-US', { format: 'text' }),
  'Note\n\nFull changelog: https://movar.fyi/changelog',
);
eq(
  'html format emits an anchor for AMO',
  withChangelogLink('Note', 'en', { format: 'html' }),
  'Note\n\n<a href="https://movar.fyi/changelog">Full changelog</a>',
);
truthy(
  'the uk footer never points at the English page',
  !withChangelogLink(ukNote, 'uk', { format: 'text' }).includes('movar.fyi/changelog'),
  'uk note linked to the en changelog',
);
eq(
  'a hand-written link is not duplicated',
  withChangelogLink('Note https://movar.fyi/changelog', 'en', { format: 'text' }),
  'Note https://movar.fyi/changelog',
);
eq(
  'an unknown locale degrades to the bare note rather than failing the release',
  withChangelogLink('Note', 'de-DE', { format: 'text' }),
  'Note',
);

// --- the live file --------------------------------------------------------
const livePath = nodePath.resolve(repoRoot, 'apps/extension/store-assets/RELEASE-NOTES.md');
const live = parseReleaseNotes(readFileSync(livePath, 'utf8'));
const version = JSON.parse(
  readFileSync(nodePath.resolve(repoRoot, 'apps/extension/package.json'), 'utf8'),
).version;

truthy(
  `live file has a block for the current version (${version})`,
  live.has(version),
  `no "## ${version}" block in RELEASE-NOTES.md`,
);
if (live.has(version)) {
  for (const locale of ['uk', 'en-US']) {
    const note = noteForLocale(live.get(version), locale);
    truthy(
      `live ${version} has a ${locale} note`,
      note && note.length > 20,
      `empty or missing note for ${locale}`,
    );
  }
}

console.log(failed ? `\n${failed} assertion(s) failed` : '\nAll assertions passed');
process.exit(failed ? 1 : 0);
