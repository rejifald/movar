#!/usr/bin/env node
// scripts/check-safari-version.mjs
//
// Refuse to release when the Xcode project's version has drifted from
// apps/extension/package.json.
//
// Changesets bumps package.json; Safari's MARKETING_VERSION is a hand step
// (apps/extension/AGENTS.md), and v1.8.0 shipped to the cut with the project
// still on 1.7.0 because nothing compared the two. `release.yml` overrides the
// version on the xcodebuild command line, so CI archives stayed correct and
// the drift was invisible until it reached the Organizer fallback — where it
// would have produced a 1.8.0 release labelled 1.7.0, colliding with the build
// already uploaded under that version.
//
// Wired in three places, each for a different moment:
//   - `pnpm validate` — the invariant holds on every commit, not just releases,
//     so a PR that bumps one file without the other fails. ci.yml runs it as
//     its own step alongside the other `check:*` gates.
//   - `scripts/verify-release.sh` (step 2, before the expensive `validate`) —
//     so the release workflow's `prepare` job fails fast, ahead of every store
//     job and ahead of the approval gate.
//   - `verify-release.yml` post-merge on main, via the same script — which is
//     where this would have caught v1.8.0, minutes after #554 landed.
//
// Dependency-free so it runs under bare `node` in install-free jobs.
//
// Run: node scripts/check-safari-version.mjs   (also `pnpm check:safari-version`)

import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSafariVersion } from './lib/safari-version.mjs';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'apps/extension/package.json';
const PBX = 'apps/extension/safari/Movar/Movar.xcodeproj/project.pbxproj';

const pkgVersion = JSON.parse(readFileSync(nodePath.resolve(repoRoot, PKG), 'utf8')).version;
const pbxproj = readFileSync(nodePath.resolve(repoRoot, PBX), 'utf8');

const { ok, problems, marketingVersions, buildNumbers, configCount } = checkSafariVersion(
  pkgVersion,
  pbxproj,
);

if (!ok) {
  console.error('✗ Safari version is out of step with the package:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\n  Fix in ${PBX}:\n` +
      `    MARKETING_VERSION = ${pkgVersion};        (every build configuration)\n` +
      `    CURRENT_PROJECT_VERSION = <unix timestamp>\n\n` +
      `  A CI archive would still be labelled correctly — release.yml passes both on the\n` +
      `  xcodebuild command line — so this only bites the documented Xcode Organizer\n` +
      `  fallback, which would upload a build under the wrong version.`,
  );
  process.exit(1);
}

console.log(
  `✓ safari version: MARKETING_VERSION ${marketingVersions[0]} matches package.json across all ` +
    `${configCount} build configurations (build ${buildNumbers[0] ?? 'unset'}).`,
);
