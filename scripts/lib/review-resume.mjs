/**
 * Resume a review submission that was staged but never submitted.
 *
 * The failure this exists for, observed on v1.8.1 (2026-09-07): `apple-submit`
 * ran all the way through — build processed VALID, version created, build
 * attached, export compliance answered, uk + en "What's New" set, review
 * submission created, version added to it — and then the final
 * `PATCH /v1/reviewSubmissions/<id>` returned **500 UNEXPECTED_ERROR** on both
 * platforms. Apple's side, not ours.
 *
 * What that leaves is a version in `READY_FOR_REVIEW`: fully staged, not
 * submitted, and invisible to `gh release list`. It is the same shape as the
 * v1.7.0 incident (uploaded, never submitted) reached by a different route.
 *
 * Re-running the normal path cannot fix it, and would nearly lie about it:
 * `READY_FOR_REVIEW` is in neither `EDITABLE_STATES` nor `IN_FLIGHT_STATES`, so
 * `submitPlatform` dies at the version-state check — and had it gotten one step
 * further, its "a review submission already exists — not creating another"
 * branch would have returned `skipped` and reported a green run that submitted
 * nothing.
 *
 * This module is the pure decision half, kept out of `apple-submit.mjs` because
 * that file calls `await main()` at import and so cannot be required by a test.
 * Everything here is a function of what the API returned, which is what lets
 * `review-resume.test.mjs` cover the states that matter without credentials.
 *
 * FAIL CLOSED, ALWAYS. Submitting for review is irreversible in practice, and
 * submitting the WRONG thing is far worse than submitting nothing: every branch
 * that cannot positively prove "this submission stages exactly this version"
 * refuses and tells the operator to look in App Store Connect. There is no
 * best-effort path here on purpose.
 */

/** Version states meaning the version is already with Apple — resume is a
 *  no-op, not a failure. Someone (or a retry) got there first. */
export const ALREADY_SUBMITTED_VERSION_STATES = new Set([
  'WAITING_FOR_REVIEW',
  'IN_REVIEW',
  'PENDING_DEVELOPER_RELEASE',
  'PENDING_APPLE_RELEASE',
  'PROCESSING_FOR_APP_STORE',
  'READY_FOR_SALE',
  'REPLACED_WITH_NEW_VERSION',
]);

/** The one version state resume acts on: staged, not submitted. */
export const RESUMABLE_VERSION_STATE = 'READY_FOR_REVIEW';

/** The one submission state resume acts on. A submission leaves it the moment
 *  it is successfully submitted, so its presence IS the "never submitted"
 *  evidence — which is why nothing here needs to guess from timestamps. */
export const RESUMABLE_SUBMISSION_STATE = 'READY_FOR_REVIEW';

/**
 * The appStoreVersion ids a `/v1/reviewSubmissions/{id}/items` response stages.
 *
 * Returns null — NOT an empty array — when the linkage cannot be read, because
 * the two mean opposite things to {@link resumeDecision}: an empty array is
 * "this submission provably stages nothing of ours" (refuse), while null is
 * "we could not tell" (also refuse, but for a different reason the operator
 * needs to hear). Collapsing them would turn an unreadable response into a
 * confident negative.
 */
export function stagedVersionIds(body) {
  const data = body?.data;
  if (!Array.isArray(data)) return null;
  const ids = [];
  for (const item of data) {
    const id = item?.relationships?.appStoreVersion?.data?.id;
    // A single unreadable item poisons the whole answer: a partial list could
    // omit precisely the version we are checking for and read as "not ours".
    if (typeof id !== 'string') return null;
    ids.push(id);
  }
  return ids;
}

/**
 * What a resume run should do, given what the API returned.
 *
 * @param versionState   the appStoreVersion's state
 * @param versionId      its id, to match against submission items
 * @param submissions    open reviewSubmissions: [{ id, state }]
 * @param stagedBySubmission  Map<submissionId, string[] | null> from
 *                            {@link stagedVersionIds}
 * @returns { action: 'submit', submissionId }
 *        | { action: 'noop',   reason }
 *        | { action: 'refuse', reason }
 */
export function resumeDecision({ versionState, versionId, submissions, stagedBySubmission }) {
  if (ALREADY_SUBMITTED_VERSION_STATES.has(versionState)) {
    return {
      action: 'noop',
      reason: `version is ${versionState} — already submitted, nothing to resume`,
    };
  }
  if (versionState !== RESUMABLE_VERSION_STATE) {
    return {
      action: 'refuse',
      reason:
        `version is ${versionState}, not ${RESUMABLE_VERSION_STATE} — nothing is staged. ` +
        `Run mode=submit to prepare and submit it normally.`,
    };
  }

  const staged = (submissions ?? []).filter((s) => s.state === RESUMABLE_SUBMISSION_STATE);
  if (staged.length === 0) {
    return {
      action: 'refuse',
      reason:
        `version is ${RESUMABLE_VERSION_STATE} but no unsubmitted review submission exists for it. ` +
        `That combination is inconsistent — check App Store Connect by hand.`,
    };
  }
  if (staged.length > 1) {
    // Never guess between two. Picking wrong submits the other one's contents.
    return {
      action: 'refuse',
      reason: `${staged.length} unsubmitted review submissions exist (${staged
        .map((s) => s.id)
        .join(', ')}) — refusing to guess which stages this version.`,
    };
  }

  const [only] = staged;
  const ids = stagedBySubmission?.get(only.id) ?? null;
  if (ids === null) {
    return {
      action: 'refuse',
      reason: `could not read what submission ${only.id} stages — refusing to submit blind.`,
    };
  }
  if (!ids.includes(versionId)) {
    return {
      action: 'refuse',
      reason: `submission ${only.id} does not stage version ${versionId} (it stages ${
        ids.length > 0 ? ids.join(', ') : 'nothing'
      }) — submitting it would ship something else.`,
    };
  }
  return { action: 'submit', submissionId: only.id };
}
