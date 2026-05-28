#!/usr/bin/env node
//
// AMO submission linter — runs Mozilla's `addons-linter` (the same engine the
// Firefox add-on review pipeline uses) against the built Firefox zip and
// fails on any issue that isn't on our allowlist.
//
// Why this exists: the in-repo `verify:release` checks (typecheck, lint,
// test, publint, zip-contents scan) caught everything *we* could foresee but
// nothing AMO-specific — Firefox-only manifest keys, permission/version
// mismatches, sourceless `innerHTML` assignments. Those rules ship with
// `addons-linter` and change as AMO policy evolves, so the only durable fix
// is to run that linter as part of `pnpm verify:release`.
//
// Allowlist: lint codes we have inspected and accept as unavoidable. Each
// entry must come with a reason and a source pointer so a future reader can
// re-evaluate.
//
// Usage:
//   node apps/extension/scripts/lint-amo.mjs <firefox-zip-or-dir>
//
// Exits 0 if every reported issue is on the allowlist, 1 otherwise.

import path from 'node:path';

import linter from 'addons-linter';

// Lint codes we accept. Tighten this set whenever we eliminate one of the
// underlying causes — do NOT add to it without a written reason.
const ALLOWED_CODES = new Map([
  [
    'UNSAFE_VAR_ASSIGNMENT',
    // React DOM writes to `innerHTML` in two places inside its production
    // bundle (a `<script>` feature-probe and the `dangerouslySetInnerHTML`
    // setter). Both are inside React's vendored code path, no Movar input
    // reaches them. We ship React in popup.html / options.html; the only
    // way to remove these warnings is to stop shipping React.
    'React DOM internals (feature probe + dangerouslySetInnerHTML setter)',
  ],
]);

const target = process.argv[2];
if (!target) {
  console.error('usage: lint-amo.mjs <firefox-zip-or-dir>');
  process.exit(2);
}
const absTarget = path.resolve(process.cwd(), target);

const instance = linter.createInstance({
  config: {
    _: [absTarget],
    // Suppress addons-linter's own pretty printer — we render our own report.
    output: 'none',
    logLevel: 'fatal',
    stack: false,
    pretty: false,
    warningsAsErrors: false,
    // addons-linter gates the `data_collection_permissions` validator behind
    // an opt-in flag (it's still tagged "reserved" otherwise). AMO's review
    // pipeline runs with this on — match it locally so we catch the same
    // issues (missing key, exclusive-with-"none", invalid permission names).
    enableDataCollectionPermissions: true,
  },
  // `runAsBinary: false` returns the report object instead of calling
  // process.exit, which lets us filter before deciding the exit code.
  runAsBinary: false,
});

const report = await instance.run();

const buckets = [
  ['error', report.errors ?? []],
  ['warning', report.warnings ?? []],
  ['notice', report.notices ?? []],
];

const unexpected = [];
const allowed = [];

for (const [severity, items] of buckets) {
  for (const item of items) {
    if (ALLOWED_CODES.has(item.code)) {
      allowed.push({ severity, ...item });
    } else {
      unexpected.push({ severity, ...item });
    }
  }
}

const fmt = (item) => {
  const loc = item.file ? `${item.file}${item.line ? `:${item.line}` : ''}` : 'manifest.json';
  return `  [${item.severity}/${item.code}] ${item.message} (${loc})`;
};

if (unexpected.length > 0) {
  console.error(`addons-linter: ${unexpected.length} unexpected issue(s) (not on allowlist):\n`);
  for (const item of unexpected) console.error(fmt(item));
  if (allowed.length > 0) {
    console.error(
      `\n(plus ${allowed.length} allowlisted issue(s): ${[
        ...new Set(allowed.map((x) => x.code)),
      ].join(', ')})`,
    );
  }
  console.error(
    '\nTo accept a finding permanently, add its code + a written reason to ALLOWED_CODES in this script.',
  );
  process.exit(1);
}

const summary =
  allowed.length === 0
    ? 'addons-linter: clean'
    : `addons-linter: clean (${allowed.length} allowlisted issue(s) ignored: ${[
        ...new Set(allowed.map((x) => x.code)),
      ].join(', ')})`;
console.log(summary);
