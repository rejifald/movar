#!/usr/bin/env node
// Tests for the App Store note span. The cases that matter are the ones where
// the answer is "announce less than the whole history" — an over-wide span is
// a wall of text in a 4000-character field, and a too-narrow one silently
// drops a release nobody on that store ever heard about.
import { strictEqual as eq, deepStrictEqual as deep, ok } from 'node:assert';
import { versionsToAnnounce, composeNote, compareVersions } from './release-span.mjs';

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const KNOWN = ['1.9.1', '1.9.0', '1.8.1', '1.8.0', '1.7.0', '1.6.2'];

console.log('==> versionsToAnnounce');

it('just the target when the store is already current', () => {
  deep(versionsToAnnounce('1.9.1', ['1.9.0', '1.8.1'], KNOWN), ['1.9.1']);
});

it('the exact v1.9.0 case: Safari on 1.8.1, so 1.9.1 carries 1.9.0 too', () => {
  deep(versionsToAnnounce('1.9.1', ['1.6.2', '1.8.0', '1.8.1'], KNOWN), ['1.9.1', '1.9.0']);
});

it('the v1.7.0 case: two stranded releases both get announced', () => {
  deep(versionsToAnnounce('1.8.1', ['1.6.2'], KNOWN), ['1.8.1', '1.8.0', '1.7.0']);
});

it('newest first, which is the order the reader wants and the file uses', () => {
  const span = versionsToAnnounce('1.9.1', ['1.6.2'], KNOWN);
  deep(span, ['1.9.1', '1.9.0', '1.8.1', '1.8.0', '1.7.0']);
});

it('the target alone when Apple has nothing below it — never the whole history', () => {
  // A genuine first submission and a failed/empty query land in the same place
  // on purpose: reciting every release Movar ever made is this function's own
  // bug, not a gap it is reporting.
  deep(versionsToAnnounce('1.9.1', [], KNOWN), ['1.9.1']);
  deep(versionsToAnnounce('1.9.1', undefined, KNOWN), ['1.9.1']);
});

it('ignores versions at Apple ABOVE the target — a re-run must not widen', () => {
  // Re-running a submission for an older version when a newer one is already
  // in review: the floor is still taken from below the target.
  deep(versionsToAnnounce('1.9.0', ['1.8.1', '1.9.1'], KNOWN), ['1.9.0']);
});

it('the target survives even when RELEASE-NOTES does not list it', () => {
  // The caller refuses this case earlier; the span must still never come back
  // empty, because an empty note is a metadata rejection.
  deep(versionsToAnnounce('2.0.0', ['1.9.1'], KNOWN), ['2.0.0']);
});

it('a target Apple already has is still announced, not skipped', () => {
  deep(versionsToAnnounce('1.9.1', ['1.9.1', '1.9.0'], KNOWN), ['1.9.1']);
});

console.log('==> composeNote');

const noteFor = (v) => `What's new in ${v}\n\nFixed\n• thing in ${v}`;
/** A note long enough that two of them cannot share one 4000-char field. */
const long = (v) => `${v}:${'x'.repeat(1500)}`;
/** A note that alone blows the cap. */
const longer = (v) => `${v}:${'x'.repeat(1900)}`;
const huge = () => 'x'.repeat(9000);

it('stacks newest first, blank line between', () => {
  const { note, dropped } = composeNote(['1.9.1', '1.9.0'], noteFor);
  eq(note, `${noteFor('1.9.1')}\n\n${noteFor('1.9.0')}`);
  deep(dropped, []);
});

it('one version composes to exactly that note', () => {
  eq(composeNote(['1.9.1'], noteFor).note, noteFor('1.9.1'));
});

it('skips a version with no note for this locale rather than emitting a hole', () => {
  const sparse = (v) => (v === '1.9.0' ? null : noteFor(v));
  const { note, announced } = composeNote(['1.9.1', '1.9.0'], sparse);
  eq(note, noteFor('1.9.1'));
  deep(announced, ['1.9.1']);
});

it('drops the OLDEST until it fits, and says which', () => {
  const { note, dropped, announced } = composeNote(['1.9.1', '1.9.0', '1.8.1'], long, {
    max: 4000,
  });
  deep(dropped, ['1.8.1']);
  deep(announced, ['1.9.1', '1.9.0']);
  ok(note.length <= 4000);
  ok(note.startsWith('1.9.1:'));
});

it('counts the changelog footer against the cap', () => {
  // withChangelogLink appends a footer AFTER this runs, so the budget it will
  // consume has to be reserved here or the field overflows at Apple.
  const { dropped } = composeNote(['1.9.1', '1.9.0'], longer, { max: 4000, overhead: 300 });
  deep(dropped, ['1.9.0']);
});

it('never drops the target, even if it alone is over the cap', () => {
  // That is a note to shorten, and the caller reports it — silently shipping
  // nothing would be worse than shipping something Apple truncates.
  const { note, dropped } = composeNote(['1.9.1'], huge, { max: 4000 });
  eq(dropped.length, 0);
  eq(note.length, 9000);
});

console.log('==> compareVersions');

it('orders numerically, not lexically', () => {
  ok(compareVersions('1.10.0', '1.9.0') > 0);
  eq(compareVersions('1.9.0', '1.9.0'), 0);
  ok(compareVersions('1.8.1', '1.9.0') < 0);
});

console.log(`\n✓ release-span: ${passed} assertions passed`);
