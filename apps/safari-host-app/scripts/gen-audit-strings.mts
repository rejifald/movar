/*
 * Generate the audit CATALOGUE's strings into the native app's
 * `Localizable.strings`.
 *
 * `docs/native-shells.md` ("i18n moves native") ends with the whole native
 * string set being generated from the TS catalogues at build time. This is that
 * step for the two tables where hand-syncing is indefensible rather than merely
 * tedious:
 *
 *   - **46 Ukrainian rule titles** (`src/i18n/audit-rule-titles.ts`). A drift
 *     guard in this package already asserts that map covers exactly the shipped
 *     ruleset — every rule the kernel exports has a title, and no title names a
 *     rule that no longer exists — so adding a rule fails the tests until its
 *     Ukrainian title lands. Copying the result into a `.strings` by hand would
 *     put a second, unguarded copy one commit behind the guarded one.
 *   - **6 family headings, in both locales** (`src/i18n/audit-family-titles.ts`).
 *     English is listed there too, because the kernel's own family names are
 *     written for the catalogue ("Serving behaviour — the Accept-Language
 *     response matrix") and are the wrong register for a heading a
 *     non-technical advocate reads.
 *
 * WHAT THIS DELIBERATELY DOES NOT GENERATE: the ~70 hand-written `audit.*` UI
 * strings. Those are prose whose Swift form differs from its React form on
 * purpose — the native screen has a filter row the web bar had no label for, and
 * has no per-row "Remove <target>" because swipe-to-delete names its own row —
 * so a generator would have to encode which strings survived the port and which
 * changed. It is written by hand for the same reason `HostStrings` is: a drift
 * there is meant to be a judgement, not a merge conflict.
 *
 * There is no `audit.rule.*` block in English. A `RuleResult` already carries
 * the kernel's own English title, and `HostStrings.auditRuleTitle` returns `nil`
 * for a missing key precisely so that title is what renders — emitting the same
 * strings twice would be a second English copy to keep in step with the kernel.
 *
 * Output: one delimited block per file, rewritten in place. Everything outside
 * the markers is left alone, so the hand-written strings above it are safe.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { auditFamilyTitles } from '../src/i18n/audit-family-titles';
import { auditRuleTitlesUk } from '../src/i18n/audit-rule-titles';
import type { HostLocale } from '../src/i18n';

const ROOT = path.resolve(import.meta.dirname, '..');
/** `apps/safari-host-app` → repo root → the App target's Resources. */
const RESOURCES = path.resolve(
  ROOT,
  '..',
  '..',
  'apps',
  'extension',
  'safari',
  'Movar',
  'Shared (App)',
  'Resources',
);

const BEGIN = '/* --- BEGIN generated audit catalogue (pnpm gen:audit-strings) --- */';
const END = '/* --- END generated audit catalogue --- */';

/**
 * A `.strings` key or value.
 *
 * Family IDs carry punctuation and spaces (`A. Page declaration`) — they are
 * the kernel's external identifiers and are deliberately used verbatim, so the
 * engine's `catalogue.describe` and this table cannot disagree about what a
 * family is called. A quoted `.strings` key holds any of that; what it cannot
 * hold unescaped is a quote or a backslash.
 */
function quote(value: string): string {
  return `"${value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`;
}

function entry(key: string, value: string): string {
  return `${quote(key)} = ${quote(value)};`;
}

/** The generated block for one locale. */
function block(locale: HostLocale): string {
  const families = Object.entries(auditFamilyTitles[locale]).map(([id, title]) =>
    entry(`audit.family.${id}`, title),
  );
  // Ukrainian only — see the header.
  const rules =
    locale === 'uk'
      ? Object.entries(auditRuleTitlesUk).map(([id, title]) => entry(`audit.rule.${id}`, title))
      : [];

  return [
    BEGIN,
    '',
    '/* Catalogue family headings — the questions the report answers. */',
    ...families,
    ...(rules.length === 0
      ? [
          '',
          '/* No audit.rule.* entries: English rule titles come from the report itself,',
          '   where evaluate() already stamped the kernel wording onto every RuleResult. */',
        ]
      : [
          '',
          '/* Rule titles. The kernel is not localised; these restate it for the UI',
          '   only — nothing here feeds adjudication. */',
          ...rules,
        ]),
    '',
    END,
  ].join('\n');
}

/** Replace the delimited block, or append one if the file has none yet. */
function write(locale: HostLocale): void {
  const file = path.join(RESOURCES, `${locale}.lproj`, 'Localizable.strings');
  const current = readFileSync(file, 'utf8');
  const start = current.indexOf(BEGIN);
  const finish = current.indexOf(END);

  const next =
    start === -1 || finish === -1
      ? `${current.trimEnd()}\n\n${block(locale)}\n`
      : `${current.slice(0, start)}${block(locale)}${current.slice(finish + END.length)}`;

  writeFileSync(file, next, 'utf8');
  process.stdout.write(`[movar:audit-strings] wrote ${locale}.lproj/Localizable.strings\n`);
}

for (const locale of ['en', 'uk'] as const) write(locale);
