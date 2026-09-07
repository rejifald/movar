#!/usr/bin/env node
// Tests for the resume decision. Every case here is a state App Store Connect
// can actually put us in; the ones that matter most are the REFUSALS, because
// submitting for review is irreversible and the whole design of
// `resumeDecision` is that it would rather do nothing than do the wrong thing.
import { strictEqual as eq, deepStrictEqual as deep } from 'node:assert';
import { resumeDecision, stagedVersionIds } from './review-resume.mjs';

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('==> stagedVersionIds');

it('reads the appStoreVersion ids an items response stages', () => {
  deep(
    stagedVersionIds({
      data: [
        { relationships: { appStoreVersion: { data: { id: 'v1' } } } },
        { relationships: { appStoreVersion: { data: { id: 'v2' } } } },
      ],
    }),
    ['v1', 'v2'],
  );
});

it('an empty submission stages nothing — [], which is a real answer', () => {
  deep(stagedVersionIds({ data: [] }), []);
});

it('null (not []) when the body is unreadable — the two mean opposite things', () => {
  eq(stagedVersionIds(), null);
  eq(stagedVersionIds({}), null);
  eq(stagedVersionIds({ data: 'nope' }), null);
});

it('one unreadable item poisons the whole list rather than silently shortening it', () => {
  eq(
    stagedVersionIds({
      data: [{ relationships: { appStoreVersion: { data: { id: 'v1' } } } }, { relationships: {} }],
    }),
    null,
  );
});

console.log('==> resumeDecision');

const staged = (id = 's1') => [{ id, state: 'READY_FOR_REVIEW' }];
const stagesOurs = (id = 's1', v = 'ver1') => new Map([[id, [v]]]);

it('submits the one staged submission that provably holds our version', () => {
  deep(
    resumeDecision({
      versionState: 'READY_FOR_REVIEW',
      versionId: 'ver1',
      submissions: staged(),
      stagedBySubmission: stagesOurs(),
    }),
    { action: 'submit', submissionId: 's1' },
  );
});

it('the v1.8.1 incident exactly: 500 at the PATCH, everything else staged', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ios-1-8-1',
    submissions: [{ id: 'sub-ios', state: 'READY_FOR_REVIEW' }],
    stagedBySubmission: new Map([['sub-ios', ['ios-1-8-1']]]),
  });
  deep(d, { action: 'submit', submissionId: 'sub-ios' });
});

it('is a no-op once the version is actually with Apple — a retry must not error', () => {
  for (const state of ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_SALE']) {
    const d = resumeDecision({
      versionState: state,
      versionId: 'ver1',
      submissions: [],
      stagedBySubmission: new Map(),
    });
    eq(d.action, 'noop', `${state} should be a no-op`);
  }
});

it('refuses when nothing was ever prepared — that is mode=submit’s job', () => {
  const d = resumeDecision({
    versionState: 'PREPARE_FOR_SUBMISSION',
    versionId: 'ver1',
    submissions: [],
    stagedBySubmission: new Map(),
  });
  eq(d.action, 'refuse');
  eq(/mode=submit/.test(d.reason), true, 'should point at the normal path');
});

it('refuses a staged version with no unsubmitted submission — inconsistent', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ver1',
    submissions: [{ id: 's1', state: 'IN_REVIEW' }],
    stagedBySubmission: new Map(),
  });
  eq(d.action, 'refuse');
});

it('refuses rather than guessing between two unsubmitted submissions', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ver1',
    submissions: [
      { id: 's1', state: 'READY_FOR_REVIEW' },
      { id: 's2', state: 'READY_FOR_REVIEW' },
    ],
    stagedBySubmission: new Map([
      ['s1', ['ver1']],
      ['s2', ['ver1']],
    ]),
  });
  eq(d.action, 'refuse');
  eq(/refusing to guess/.test(d.reason), true);
});

it('refuses when the submission stages a DIFFERENT version — the dangerous case', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ver1',
    submissions: staged(),
    stagedBySubmission: new Map([['s1', ['someone-elses-version']]]),
  });
  eq(d.action, 'refuse');
  eq(/would ship something else/.test(d.reason), true);
});

it('refuses when the items could not be read — never submits blind', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ver1',
    submissions: staged(),
    stagedBySubmission: new Map([['s1', null]]),
  });
  eq(d.action, 'refuse');
  eq(/blind/.test(d.reason), true);
});

it('refuses when the submission is absent from the map entirely', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ver1',
    submissions: staged(),
    stagedBySubmission: new Map(),
  });
  eq(d.action, 'refuse');
});

it('never submits on an empty submission', () => {
  const d = resumeDecision({
    versionState: 'READY_FOR_REVIEW',
    versionId: 'ver1',
    submissions: staged(),
    stagedBySubmission: new Map([['s1', []]]),
  });
  eq(d.action, 'refuse');
  eq(/stages nothing/.test(d.reason), true);
});

console.log(`\n✓ review-resume: ${passed} assertions passed`);
