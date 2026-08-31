// scripts/lib/safari-version.mjs
//
// Parse and cross-check the version Safari ships under.
//
// Movar carries its version in TWO places that have to agree:
//
//   apps/extension/package.json          "version"  — bumped by Changesets
//   .../Movar.xcodeproj/project.pbxproj  MARKETING_VERSION — bumped BY HAND
//
// Safari is not on Changesets (apps/extension/AGENTS.md), so the second one is
// a manual step in the release ritual, and manual steps get skipped. v1.8.0
// was cut with the project file still on 1.7.0 and nothing noticed.
//
// Nothing noticed because the drift is invisible on the path actually used:
// `release.yml` passes `MARKETING_VERSION=$VERSION` on the xcodebuild command
// line, so a CI archive is correct whatever the file says. It only surfaces on
// the documented fallback — a local archive through Xcode Organizer — which
// would have produced a 1.8.0 release labelled 1.7.0, colliding with the build
// already uploaded to App Store Connect under that version.
//
// Pure functions, no I/O and no dependencies, so the CLI can run under bare
// `node` in install-free jobs and the self-test can feed it fixtures.

/** Every distinct value of `key` in a pbxproj, in first-seen order. */
export function settingValues(pbxproj, key) {
  const found = [];
  const re = new RegExp(String.raw`^\s*${key} = ([^;]+);`, 'gm');
  for (const m of pbxproj.matchAll(re)) {
    const value = m[1].trim().replace(/^"|"$/g, '');
    if (!found.includes(value)) found.push(value);
  }
  return found;
}

/** How many build configurations declare `key` at all. */
export function settingCount(pbxproj, key) {
  return [...pbxproj.matchAll(new RegExp(String.raw`^\s*${key} = [^;]+;`, 'gm'))].length;
}

/**
 * Cross-check the Xcode project against the package version.
 *
 * Returns `{ ok, problems, marketingVersions, buildNumbers, configCount }`.
 * `problems` is empty iff every build configuration agrees on one
 * MARKETING_VERSION, that value equals `pkgVersion`, and the build number is
 * likewise uniform.
 */
export function checkSafariVersion(pkgVersion, pbxproj) {
  const marketingVersions = settingValues(pbxproj, 'MARKETING_VERSION');
  const buildNumbers = settingValues(pbxproj, 'CURRENT_PROJECT_VERSION');
  const configCount = settingCount(pbxproj, 'MARKETING_VERSION');
  const problems = [];

  // Fail loudly rather than vacuously passing: if the project format changes
  // and the pattern stops matching, "no mismatches found" would be a lie.
  if (configCount === 0) {
    problems.push(
      'no MARKETING_VERSION found in the Xcode project — the project format changed and this guard is no longer reading it.',
    );
  } else if (marketingVersions.length > 1) {
    problems.push(
      `build configurations disagree on MARKETING_VERSION: ${marketingVersions.join(', ')}. All ${configCount} must carry one value.`,
    );
  } else if (marketingVersions[0] !== pkgVersion) {
    problems.push(
      `MARKETING_VERSION is ${marketingVersions[0]} but apps/extension/package.json is ${pkgVersion}. Safari is not on Changesets — bump it by hand across all ${configCount} build configurations.`,
    );
  }

  if (buildNumbers.length > 1) {
    problems.push(
      `build configurations disagree on CURRENT_PROJECT_VERSION: ${buildNumbers.join(', ')}. One build number per release.`,
    );
  }

  return { ok: problems.length === 0, problems, marketingVersions, buildNumbers, configCount };
}
