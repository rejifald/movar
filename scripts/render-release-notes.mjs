#!/usr/bin/env node
// scripts/render-release-notes.mjs
//
// Render one version's notes out of RELEASE-NOTES.md for a surface that wants
// text rather than structured data — currently the GitHub Release body.
//
// The stores each take the notes through their own API (App Store, AMO), and
// the marketing site imports the parser directly at build time. This exists
// for the one consumer that just needs a string, and keeps that formatting in
// one place instead of inlining markdown assembly in a workflow's shell.
//
// Both locales are emitted, Ukrainian first, matching every other surface:
// Movar's audience is Ukrainian, so uk leads and en is the fallback.
//
// Required env:
//   VERSION   the version to render
//
// Usage:
//   VERSION=1.6.2 node scripts/render-release-notes.mjs --format=github

import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseNotes, noteForLocale } from './lib/release-notes.mjs';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = 'apps/extension/store-assets/RELEASE-NOTES.md';

/**
 * uk leads, en follows — the same order every surface uses.
 *
 * The heading is the LANGUAGE, not "What's new": each note already opens with
 * its own title line ("Що нового у версії 1.6.2"), because the App Store's
 * What's New field is plain text with no heading of its own. A topical heading
 * here would just repeat it.
 */
const LOCALES = [
  { code: 'uk', heading: 'Українська' },
  { code: 'en', heading: 'English' },
];

const version = (process.env.VERSION ?? '').trim();
if (!version) {
  console.error('✗ VERSION is not set.');
  process.exit(1);
}

const forVersion = parseReleaseNotes(readFileSync(nodePath.resolve(repoRoot, NOTES), 'utf8')).get(
  version,
);
if (!forVersion) {
  console.error(`✗ No "## ${version}" block in ${NOTES}.`);
  process.exit(1);
}

const sections = [];
for (const { code, heading } of LOCALES) {
  const note = noteForLocale(forVersion, code);
  if (!note) {
    console.error(`✗ No ${code} note for ${version} — refusing to render a half-localized body.`);
    process.exit(1);
  }
  sections.push(`### ${heading}\n\n${note}`);
}

process.stdout.write(`${sections.join('\n\n')}\n`);
