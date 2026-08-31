#!/usr/bin/env node
/**
 * Unit test for the Safari version cross-check.
 *
 * Same self-contained assertion-runner pattern as
 * scripts/lib/release-notes.test.mjs (no vitest project globs root `scripts/`).
 *
 * Why this is worth a test: the guard's whole job is to notice a mismatch that
 * is otherwise invisible — `release.yml` overrides MARKETING_VERSION on the
 * xcodebuild command line, so a CI archive is right whatever the project file
 * says. A guard that quietly stopped matching (a pbxproj reformat, a renamed
 * setting) would report "no problems" forever and look exactly like a healthy
 * one. Hence the vacuous-pass case below, and the assertion against the LIVE
 * project file.
 *
 * Run: node scripts/lib/safari-version.test.mjs  (also `pnpm test:safari-version`)
 */
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSafariVersion, settingValues, settingCount } from './safari-version.mjs';

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

console.log('Safari version cross-check');

/** A pbxproj fragment with `n` build configurations. */
const project = (marketing, build = '1788087223', n = 8) =>
  Array.from(
    { length: n },
    (_, i) =>
      `\t\t3B701C9${i} /* Release */ = {\n` +
      `\t\t\tbuildSettings = {\n` +
      `\t\t\t\tCURRENT_PROJECT_VERSION = ${Array.isArray(build) ? build[i] : build};\n` +
      `\t\t\t\tMARKETING_VERSION = ${Array.isArray(marketing) ? marketing[i] : marketing};\n` +
      `\t\t\t};\n\t\t};`,
  ).join('\n');

// --- the happy path ------------------------------------------------------
{
  const r = checkSafariVersion('1.8.0', project('1.8.0'));
  truthy('agreeing project passes', r.ok, r.problems.join('; '));
  eq('reports the configuration count', r.configCount, 8);
  eq('reports the single marketing version', r.marketingVersions.join(', '), '1.8.0');
}

// --- the v1.8.0 regression this guard exists for -------------------------
{
  const r = checkSafariVersion('1.8.0', project('1.7.0'));
  eq('stale MARKETING_VERSION is REJECTED', r.ok, false);
  truthy(
    'the message names both versions',
    r.problems[0].includes('1.7.0') && r.problems[0].includes('1.8.0'),
    r.problems[0],
  );
}

// --- configurations drifting apart from each other -----------------------
{
  const mixed = ['1.8.0', '1.8.0', '1.7.0', '1.8.0', '1.8.0', '1.8.0', '1.8.0', '1.8.0'];
  const r = checkSafariVersion('1.8.0', project(mixed));
  eq('disagreeing configurations are REJECTED', r.ok, false);
  truthy('it says they disagree', r.problems[0].includes('disagree'), r.problems[0]);
}

// --- a build number that is not uniform ----------------------------------
{
  const builds = ['1', '1', '1', '1', '1', '1', '1', '2'];
  const r = checkSafariVersion('1.8.0', project('1.8.0', builds));
  eq('disagreeing build numbers are REJECTED', r.ok, false);
  truthy(
    'CURRENT_PROJECT_VERSION is named',
    r.problems.some((p) => p.includes('CURRENT_PROJECT_VERSION')),
    r.problems.join('; '),
  );
}

// --- the vacuous pass: the guard stops reading the file ------------------
{
  const r = checkSafariVersion('1.8.0', 'buildSettings = {\n\tSOMETHING_ELSE = 1;\n};');
  eq('a project with no MARKETING_VERSION is REJECTED, not passed', r.ok, false);
  truthy(
    'it says the guard is no longer reading the project',
    r.problems[0].includes('no longer reading'),
    r.problems[0],
  );
}

// --- parsing details -----------------------------------------------------
{
  eq('settingValues dedupes', settingValues(project('1.8.0'), 'MARKETING_VERSION').length, 1);
  eq(
    'settingCount counts every configuration',
    settingCount(project('1.8.0'), 'MARKETING_VERSION'),
    8,
  );
  eq(
    'a quoted value is unwrapped',
    settingValues('\t\tMARKETING_VERSION = "1.8.0";', 'MARKETING_VERSION').join(', '),
    '1.8.0',
  );
  eq(
    'a commented-out setting is not matched mid-line',
    settingValues('// MARKETING_VERSION = 9.9.9;', 'MARKETING_VERSION').length,
    0,
  );
}

// --- the live project must agree with the live package -------------------
{
  const pkg = JSON.parse(
    readFileSync(nodePath.resolve(repoRoot, 'apps/extension/package.json'), 'utf8'),
  ).version;
  const pbx = readFileSync(
    nodePath.resolve(repoRoot, 'apps/extension/safari/Movar/Movar.xcodeproj/project.pbxproj'),
    'utf8',
  );
  const r = checkSafariVersion(pkg, pbx);
  truthy(`live project matches package.json (${pkg})`, r.ok, r.problems.join('; '));
  truthy(
    'live project has more than one build configuration',
    r.configCount > 1,
    `saw ${r.configCount}`,
  );
}

console.log(failed ? `\n${failed} assertion(s) failed` : '\nAll assertions passed');
process.exit(failed ? 1 : 0);
