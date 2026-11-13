#!/usr/bin/env node
// Tests for formatAscErrors — the one place an App Store Connect failure turns
// into a log line. If it drops a field, the operator is left guessing.
import { strictEqual as eq } from 'node:assert';
import { formatAscErrors } from './asc-api.mjs';

let passed = 0;
function it(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('==> formatAscErrors');

it('formats code: detail, falling back to title', () => {
  eq(
    formatAscErrors({
      errors: [
        { code: 'NOT_FOUND', detail: 'no such app' },
        { code: 'FORBIDDEN', title: 'nope' },
      ],
    }),
    'NOT_FOUND: no such app | FORBIDDEN: nope',
  );
});

it('keeps meta.associatedErrors — the v1.9.3 409 carried its reason only there', () => {
  eq(
    formatAscErrors({
      errors: [
        {
          code: 'STATE_ERROR.ENTITY_STATE_INVALID',
          detail: 'This resource cannot be reviewed, please check associated errors to see why.',
          meta: {
            associatedErrors: {
              '/v1/appStoreVersions/abc': [
                { code: 'ENTITY_ERROR.ATTRIBUTE.REQUIRED', detail: 'copyright is required' },
              ],
              '/v1/ageRatingDeclarations/xyz': [
                { code: 'ENTITY_ERROR.ATTRIBUTE.REQUIRED', title: 'question unanswered' },
              ],
            },
          },
        },
      ],
    }),
    'STATE_ERROR.ENTITY_STATE_INVALID: This resource cannot be reviewed, please check associated errors to see why. ' +
      '[associated: /v1/appStoreVersions/abc: ENTITY_ERROR.ATTRIBUTE.REQUIRED: copyright is required; ' +
      '/v1/ageRatingDeclarations/xyz: ENTITY_ERROR.ATTRIBUTE.REQUIRED: question unanswered]',
  );
});

it('ignores malformed associatedErrors instead of throwing', () => {
  eq(formatAscErrors({ errors: [{ code: 'X', meta: { associatedErrors: 'oops' } }] }), 'X');
  eq(formatAscErrors({ errors: [{ code: 'X', meta: { associatedErrors: { '/a': 'no' } } }] }), 'X');
});

it('empty string for a body with no errors', () => {
  eq(formatAscErrors({}), '');
  eq(formatAscErrors(null), '');
});

console.log(`\n${passed} passed`);
