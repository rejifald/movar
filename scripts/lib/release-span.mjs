#!/usr/bin/env node
// scripts/lib/release-span.mjs
//
// WHICH VERSIONS' NOTES ONE APP STORE SUBMISSION HAS TO CARRY.
//
// The App Store shows ONE version's "What's New" and nothing else. That is
// fine while every release reaches every store, and wrong the moment one does
// not: a Safari build that is uploaded and never submitted takes its notes out
// of circulation with it, and the next release's note — written as if the
// reader had seen the last one — is the only thing its users ever get.
//
// It has happened twice. v1.7.0 was uploaded 2026-08-22 and never submitted,
// so v1.8.0's note was the whole of what Safari users were told about two
// releases (docs/ROADMAP.md records the consequence: a v1.7.0 regression read
// as "the latest release broke Google"). v1.9.0 went the same way on
// 2026-09-20. `submit-safari` in release.yml stops NEW versions stranding, but
// it cannot un-strand the ones already behind, and a superseded build will
// always be possible — a release can be cut faster than Apple reviews.
//
// So the span is resolved at the App Store boundary rather than written into
// RELEASE-NOTES.md by hand. That file stays one block per version, which is
// what movar.fyi/changelog, AMO and the GitHub Release body all want; only the
// App Store note is composed, and only across versions Apple is actually
// missing. Combining them in the file instead would publish the same bullets
// twice on the changelog page, which renders every version in full.
//
// Pure decision logic, no API calls — same split as review-resume.mjs, and for
// the same reason: the cases worth testing are the ones where the answer is
// "do less than you were asked", and they are unreachable through a live
// App Store Connect client.

/** Numeric-tuple comparison, `X.Y.Z` only. Returns <0, 0, >0 like a sort
 *  comparator. Duplicated from check-store-parity.mjs rather than imported:
 *  that file reaches for git and the filesystem at import time, and this one
 *  is meant to stay a pure module its tests can load in isolation. */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The versions this submission must announce, NEWEST FIRST.
 *
 * `reached` is every version string this platform has on record at Apple in a
 * state that means it got there (check-store-parity's REACHED_APPLE). `known`
 * is every version RELEASE-NOTES.md has a block for. The answer is everything
 * known in `(highest reached below target, target]`.
 *
 * WHEN APPLE HAS NOTHING BELOW THE TARGET the answer is `[target]` alone, not
 * the whole history. Two different situations land here — a genuine first
 * submission, which owes no "What's New" at all, and a query that failed or
 * came back empty — and neither is improved by reciting every release Movar
 * has ever made into a 4000-character field. Announcing too little is a thin
 * note; announcing too much is a wall of text nobody reads, and it would be
 * this function's own fault rather than a gap it is reporting.
 */
export function versionsToAnnounce(target, reached, known) {
  const below = (reached ?? []).filter((v) => compareVersions(v, target) < 0);
  if (below.length === 0) return [target];
  const floor = below.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
  const span = (known ?? []).filter(
    (v) => compareVersions(v, floor) > 0 && compareVersions(v, target) <= 0,
  );
  // The target is the thing being submitted; it is in the span by definition,
  // even if RELEASE-NOTES.md somehow did not list it (the caller has already
  // refused that case, but this must not silently return an empty note).
  if (!span.includes(target)) span.push(target);
  return span.toSorted((a, b) => compareVersions(b, a));
}

/**
 * Stack the notes into one field, newest first, dropping the OLDEST until it
 * fits.
 *
 * Stacked rather than merged by category: each block already opens with its
 * own title line ("Що нового у версії 1.9.0"), because the App Store's field
 * has no heading of its own — so stacking reads as a short changelog, which is
 * what it is. Merging "Виправлено" across two versions would silently present
 * older fixes as new ones.
 *
 * TRIMMING, RATHER THAN FAILING, is the deliberate choice. This runs inside an
 * unattended release: refusing to submit because the third-oldest note pushed
 * the field over Apple's cap would strand the build all over again, which is
 * the failure the caller exists to prevent. The most recent versions are the
 * ones the reader most needs, so the oldest go first and `dropped` names them
 * for the log. `note` is never empty — the target's own block always survives,
 * and if that alone is over the cap, that is a note to shorten and the caller
 * reports it.
 */
export function composeNote(versions, noteFor, { max = 4000, overhead = 0 } = {}) {
  const blocks = [];
  for (const version of versions) {
    const note = noteFor(version);
    if (note) blocks.push({ version, note });
  }
  const dropped = [];
  const joined = () => blocks.map((b) => b.note).join('\n\n');
  while (blocks.length > 1 && joined().length + overhead > max) {
    dropped.push(blocks.pop().version);
  }
  return { note: joined(), dropped, announced: blocks.map((b) => b.version) };
}
