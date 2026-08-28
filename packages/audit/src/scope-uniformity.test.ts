import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import nodePath from 'node:path';
import ts from 'typescript';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makeHead,
  makePage,
  makePicker,
  makeProbe,
  networkEvidence,
  VERIFIED_UA_VANTAGE,
} from '../test/fixtures';
import { evaluate } from './evaluate';
import type { Evidence, PageEvidence, TextNodeSample } from './evidence';
import type { RuleScope } from './finding';
import type { Report } from './report';
import type { CoreRule } from './rule';
import { findings } from './rule';
import { CORE_RULESET, createRuleset, UA_PACK_FAMILIES, withPack } from './ruleset';

/**
 * **Every finding a rule emits carries the same scope.**
 *
 * Nothing in the type system says so, and `suppress.ts`'s doctrine 2 rests on
 * it entirely: `subjectScopeProblem` requires a `subject` when *all* of a rule's
 * findings are page-scoped and forbids one when *none* are, which partitions the
 * space only while a rule's findings agree. A rule emitting a mix would answer
 * "no problem" to both tests, and one subject-less entry would sweep its page
 * findings alongside its site ones — the blanket ignore doctrine 2 exists to
 * ban. That is latent rather than live, and the safety of reading the scope off
 * the findings rested on a catalogue property nothing asserted.
 *
 * It is asserted in two halves, which together cover the whole catalogue:
 *
 *  - **No draft anywhere overrides its scope to `site`** (the static half).
 *    `gradeFinding` computes `draft.scope ?? rule.scope`, so a rule declaring
 *    `scope: 'page'` can then only ever produce page-scoped findings — uniform
 *    by construction, for all 35 of them, without running anything.
 *  - **Every site-scoped rule is driven until it emits, and what it emits is
 *    uniform** (the runtime half). Those are the only rules left: a `site` rule
 *    *may* legitimately override its drafts to `page` — every family C rule
 *    does — so only they can mix, and there are 11.
 *
 * The corpus is therefore checked for reach as well as for the invariant: a
 * site-scoped rule that stops firing would otherwise quietly leave the half of
 * the catalogue that can actually break this unguarded.
 */

const RULESET = withPack(CORE_RULESET, ...UA_PACK_FAMILIES);

const UK_TEXT =
  'Ще не вмерла України і слава, і воля, ще нам, браття молодії, усміхнеться доля. Згинуть наші воріженьки, як роса на сонці, запануєм і ми, браття, у своїй сторонці.';
const RU_TEXT =
  'Это очень длинный текст на русском языке, который классификатор должен уверенно определить как русский, а не украинский, потому что здесь достаточно слов и предложений.';

function samples(text: string, count: number, offset = 0): TextNodeSample[] {
  return Array.from({ length: count }, (_, index) => ({
    nodePath: `body > p:nth-of-type(${index + 1 + offset})`,
    text,
    inheritedLang: null,
  }));
}

/* -------------------------------------------------------------------------- */
/* The corpus                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A build with a defect for most of families A, B and E at once: a page whose
 * declaration, head and body text disagree, dangling and malformed alternates,
 * a picker offering an option nothing declares, and two more pages that vary
 * the inventory across the site.
 */
function buildBundle(): Evidence {
  const alternates = [
    { hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' as const },
    { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' as const },
    { hreflang: 'en', href: 'https://example.com.ua/en/', source: 'link' as const },
    { hreflang: 'zz-bogus!', href: 'https://example.com.ua/zz/', source: 'link' as const },
    { hreflang: 'de', href: '#', source: 'link' as const },
  ];
  return filesystemEvidence([
    makeBuildPage({
      id: 'build-root',
      path: '/index.html',
      document: makeDocument({
        htmlLang: 'en',
        alternates,
        picker: makePicker({
          options: [
            { label: 'Українська', href: '/uk/', active: false, nodePath: 'a:nth-of-type(1)' },
            { label: 'Русский', href: '/ru/', active: true, nodePath: 'a:nth-of-type(2)' },
            { label: '???', href: null, active: false, nodePath: 'a:nth-of-type(3)' },
          ],
        }),
        links: [
          { href: '/uk/', rel: 'alternate', nodePath: 'a.uk', hreflang: 'uk' },
          { href: '/ru/', nodePath: 'a.ru' },
        ],
        textNodes: [...samples(RU_TEXT, 4), ...samples(UK_TEXT, 2, 4)],
        textSampling: { examined: 200, sampled: 6 },
        head: makeHead({
          declarations: [
            {
              kind: 'og-locale',
              value: 'ru_RU',
              source: 'meta',
              nodePath: 'head > meta:nth-of-type(1)',
            },
            { kind: 'content-language', value: 'ru', source: 'header' },
          ],
          texts: [
            {
              field: 'title',
              text: 'Заголовок по-русски и ещё немного слов, чтобы его вообще можно было измерить.',
              nodePath: 'head > title',
            },
          ],
        }),
        langAttributes: [
          { nodePath: 'body > div', value: 'ru' },
          { nodePath: 'body > span', value: 'bogus!!' },
        ],
      }),
    }),
    makeBuildPage({
      id: 'build-uk',
      path: '/uk/index.html',
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [{ hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' }],
        textNodes: samples(UK_TEXT, 3),
        textSampling: { examined: 100, sampled: 3 },
      }),
    }),
    makeBuildPage({
      id: 'build-ru',
      path: '/ru/index.html',
      document: makeDocument({
        htmlLang: '',
        textNodes: samples(RU_TEXT, 5),
        textSampling: { examined: 100, sampled: 5 },
      }),
    }),
  ]);
}

const VARY_URL = 'https://example.com.ua/vary/';
const IGNORED_URL = 'https://example.com.ua/ignored/';
const GEO_URL = 'https://example.com.ua/geo/';
const COOKIE_URL = 'https://example.com.ua/cookie/';
const DEFAULT_URL = 'https://example.com.ua/default/';

function servedPage(id: string, url: string, lang: string): PageEvidence {
  return makePage({
    id,
    url,
    document: makeDocument({
      htmlLang: lang,
      alternates: [
        { hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' },
        { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
      ],
      textNodes: samples(lang === 'uk' ? UK_TEXT : RU_TEXT, 4),
      textSampling: { examined: 100, sampled: 4 },
      picker: makePicker({
        options: [
          {
            label: 'Українська',
            href: '/uk/',
            active: lang === 'uk',
            nodePath: 'a:nth-of-type(1)',
          },
          { label: 'Русский', href: '/ru/', active: lang !== 'uk', nodePath: 'a:nth-of-type(2)' },
        ],
      }),
    }),
  });
}

/**
 * The response matrix, shaped so each family C rule finds its own defect: a leg
 * whose body changes with the header and carries no `Vary`, a leg that answers
 * byte-identically whatever it is asked, one URL read from two vantages under
 * one header, a cold/warm cookie pair, and a no-preference leg.
 */
function matrixBundle(): Evidence {
  return networkEvidence(
    [
      servedPage('vary-uk', VARY_URL, 'uk'),
      servedPage('vary-ru', VARY_URL, 'ru'),
      servedPage('ignored-uk', IGNORED_URL, 'ru'),
      servedPage('ignored-ru', IGNORED_URL, 'ru'),
      servedPage('geo-ua', GEO_URL, 'uk'),
      servedPage('geo-de', GEO_URL, 'ru'),
      servedPage('cookie-cold', COOKIE_URL, 'uk'),
      servedPage('cookie-warm', COOKIE_URL, 'ru'),
      servedPage('default', DEFAULT_URL, 'en'),
    ],
    [
      makeProbe({
        id: 'v-uk',
        pageId: 'vary-uk',
        url: VARY_URL,
        acceptLanguage: 'uk',
        bodyHash: 'vary-a',
      }),
      makeProbe({
        id: 'v-ru',
        pageId: 'vary-ru',
        url: VARY_URL,
        acceptLanguage: 'ru',
        bodyHash: 'vary-b',
      }),
      makeProbe({
        id: 'i-uk',
        pageId: 'ignored-uk',
        url: IGNORED_URL,
        acceptLanguage: 'uk',
        bodyHash: 'same',
      }),
      makeProbe({
        id: 'i-ru',
        pageId: 'ignored-ru',
        url: IGNORED_URL,
        acceptLanguage: 'ru',
        bodyHash: 'same',
      }),
      makeProbe({
        id: 'g-ua',
        pageId: 'geo-ua',
        url: GEO_URL,
        acceptLanguage: 'uk',
        vantage: VERIFIED_UA_VANTAGE,
        bodyHash: 'geo-a',
      }),
      makeProbe({
        id: 'g-de',
        pageId: 'geo-de',
        url: GEO_URL,
        acceptLanguage: 'uk',
        vantage: CLAIMED_DE_VANTAGE,
        bodyHash: 'geo-b',
      }),
      makeProbe({
        id: 'c-cold',
        pageId: 'cookie-cold',
        url: COOKIE_URL,
        acceptLanguage: 'uk',
        cookieState: 'cold',
        bodyHash: 'cookie-a',
      }),
      makeProbe({
        id: 'c-warm',
        pageId: 'cookie-warm',
        url: COOKIE_URL,
        acceptLanguage: 'uk',
        cookieState: 'warm',
        bodyHash: 'cookie-b',
      }),
      makeProbe({
        id: 'd-none',
        pageId: 'default',
        url: DEFAULT_URL,
        acceptLanguage: null,
        bodyHash: 'def-a',
      }),
      makeProbe({
        id: 'd-uk',
        pageId: 'default',
        url: DEFAULT_URL,
        acceptLanguage: 'uk',
        bodyHash: 'def-b',
        redirectChain: [{ url: DEFAULT_URL, status: 302, location: 'https://example.com.ua/uk/' }],
      }),
    ],
  );
}

const UA_HOST = 'https://shop.example.com.ua';

function marketPage(
  id: string,
  path: string,
  lang: string,
  chromeLang: string | null,
): PageEvidence {
  return makePage({
    id,
    url: `${UA_HOST}${path}`,
    document: makeDocument({
      htmlLang: lang,
      textNodes: [
        ...samples(lang === 'uk' ? UK_TEXT : RU_TEXT, 3),
        {
          nodePath: 'nav > a:nth-of-type(1)',
          text: 'Каталог товарів и другие разделы этого магазина',
          inheritedLang: chromeLang,
          region: 'nav',
        },
      ],
      textSampling: { examined: 60, sampled: 4 },
    }),
  });
}

/**
 * A `.ua` site — so family F's market test is met — serving three Russian
 * versions against one Ukrainian, whose own chrome is Russian.
 */
function marketBundle(): Evidence {
  const pages = [
    marketPage('market-ru-a', '/a/', 'ru', null),
    marketPage('market-ru-b', '/b/', 'ru', null),
    marketPage('market-ru-c', '/c/', 'ru', null),
    marketPage('market-uk', '/uk/', 'uk', 'ru'),
  ];
  return networkEvidence(
    pages,
    pages.map((page, index) =>
      makeProbe({
        id: `market-${index}`,
        pageId: page.id,
        url: page.url ?? '',
        acceptLanguage: 'uk',
        bodyHash: `market-${index}`,
      }),
    ),
  );
}

/** Rule ID → every scope its findings carried, across every bundle in the corpus. */
function scopesByRule(reports: readonly Report[]): ReadonlyMap<string, ReadonlySet<RuleScope>> {
  const scopes = new Map<string, Set<RuleScope>>();
  for (const report of reports) {
    for (const finding of report.findings) {
      const seen = scopes.get(finding.rule) ?? new Set<RuleScope>();
      seen.add(finding.scope);
      scopes.set(finding.rule, seen);
    }
  }
  return scopes;
}

const CORPUS = [buildBundle(), matrixBundle(), marketBundle()];
const OBSERVED = scopesByRule(CORPUS.map((evidence) => evaluate(evidence, RULESET)));

describe('finding scope uniformity', () => {
  it('gives every rule that fired findings of a single scope', () => {
    const mixed = [...OBSERVED.entries()]
      .filter(([, scopes]) => scopes.size > 1)
      .map(([rule, scopes]) => `${rule}: ${[...scopes].toSorted().join(' + ')}`);
    expect(mixed).toEqual([]);
  });

  /**
   * The measurement, falsified. Without this the test above would keep passing
   * if `scopesByRule` stopped reading `Finding.scope` at all.
   */
  it('would catch a rule that emitted both scopes', () => {
    const mixedRule: CoreRule<'site'> = {
      id: 'core/mixed-scope',
      title: 'a rule that names a page and the site in one breath',
      capabilities: ['static'],
      grounding: 'declared',
      scope: 'site',
      run: () =>
        findings(
          {
            grounding: 'declared',
            verdict: 'fail',
            scope: 'page',
            subject: { path: '/index.html' },
            evidence: [],
            summary: 'this one names a page.',
          },
          {
            grounding: 'declared',
            verdict: 'fail',
            subject: {},
            evidence: [],
            summary: 'and this one names the site.',
          },
        ),
    };
    const ruleset = createRuleset({
      id: 'mixed',
      version: '0.0.0',
      families: [{ id: 'X', title: 'synthetic', rules: [mixedRule] }],
    });
    const scopes = scopesByRule([evaluate(buildBundle(), ruleset)]).get('core/mixed-scope');
    expect(scopes === undefined ? [] : [...scopes].toSorted()).toEqual(['page', 'site']);
  });

  /**
   * Reach, not coverage-for-its-own-sake. A `page` rule is covered by the static
   * half below whether it fires or not; a `site` rule is not covered by
   * anything unless this corpus makes it speak.
   */
  it('drives every site-scoped rule in the catalogue until it emits a finding', () => {
    const silent = RULESET.rules
      .filter((rule) => rule.scope === 'site')
      .map((rule) => rule.id)
      .filter((id) => !OBSERVED.has(id));
    expect(silent).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The static half                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue's own source, read as **syntax** rather than as text.
 *
 * Exhaustiveness matters more here than anywhere else in this file: the
 * inference that makes all 35 page-scoped rules uniform without running them is
 * only as good as the scan that establishes its premise, and a scan that misses
 * an assignment reports **zero** rather than an error. A regex over
 * `src/rules/*.ts` was the first shape of it, and two ordinary refactors walked
 * past it with the whole suite still green — a scope written without a trailing
 * comma (`const SITE_WIDE = { scope: 'site' } as const;`, spread into a draft),
 * which a comma-anchored pattern does not match; and a draft shape declared one
 * directory up, which a listing of `src/rules` never opens.
 *
 * Parsing closes both at once. A `scope` property is a `scope` property
 * wherever it is written and whatever punctuation follows it, and the file set
 * is the **import closure of `ruleset.ts`** rather than a directory listing, so
 * a shape is scanned exactly when a rule can reach it — which is the same
 * condition under which it can reach a finding. Whatever this file cannot
 * resolve to a literal is recorded as unresolved rather than skipped, so an
 * unrecognised spelling fails loudly instead of counting as nothing.
 *
 * It also settles the exposure a text scan could only lose to: a doc comment
 * quoting `scope: 'site',` in a family file counted as a twelfth assignment and
 * failed this file for a sentence. A comment is not a property assignment, so
 * prose about scope now costs nothing.
 */

/** This module's own directory, `src`. */
const SRC_DIR = new URL('.', import.meta.url).pathname;

/**
 * Where the catalogue is assembled, and therefore where the scan starts.
 * Rooting the closure at the ruleset rather than at a directory makes the scan
 * cover exactly the rules {@link RULESET} is made of: a family file nothing
 * imports emits no findings, and a helper module that *is* imported is read
 * wherever it happens to sit.
 */
const CATALOGUE_ROOT = nodePath.join(SRC_DIR, 'ruleset.ts');

function parseSource(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** The file a relative specifier names; `null` for a package, which is not the catalogue. */
function resolveRelative(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = nodePath.resolve(nodePath.dirname(from), specifier);
  return [`${base}.ts`, nodePath.join(base, 'index.ts')].find((path) => existsSync(path)) ?? null;
}

function moduleSpecifierOf(statement: ts.Statement): string | null {
  if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return null;
  const { moduleSpecifier } = statement;
  return moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier)
    ? moduleSpecifier.text
    : null;
}

/** Every module the catalogue is built from, transitively, in a stable order. */
function catalogueSources(): readonly string[] {
  const seen = new Set<string>();
  const pending = [CATALOGUE_ROOT];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const statement of parseSource(file).statements) {
      const specifier = moduleSpecifierOf(statement);
      const next = specifier === null ? null : resolveRelative(file, specifier);
      if (next !== null) pending.push(next);
    }
  }
  return [...seen].toSorted();
}

/** The wrappers a scope value legally arrives in: `as const`, `satisfies`, parentheses. */
function unwrap(expression: ts.Expression): ts.Expression {
  let node = expression;
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

/** The scope a `'page'` / `'site'` literal states, or `null` for anything else. */
function literalScope(node: ts.Expression): RuleScope | null {
  if (!ts.isStringLiteral(node)) return null;
  const { text } = node;
  return text === 'page' || text === 'site' ? text : null;
}

/** Every node of a parsed module, depth-first — nesting is never a hiding place. */
function* descendants(node: ts.Node): Generator<ts.Node> {
  yield node;
  for (const child of node.getChildren()) yield* descendants(child);
}

/**
 * `const SITE = 'site' as const;` — how every family file names its scope
 * values. Per file, deliberately: a constant imported from elsewhere stays
 * unresolved, and unresolved is loud, which is the right answer for a value
 * this scan would otherwise have to take another module's word for.
 */
function scopeConstants(source: ts.SourceFile): ReadonlyMap<string, RuleScope> {
  const constants = new Map<string, RuleScope>();
  for (const node of descendants(source)) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const scope = literalScope(unwrap(node.initializer));
      if (scope !== null) constants.set(node.name.text, scope);
    }
  }
  return constants;
}

/** The key a property writes — bare, quoted, or computed from a string. */
function propertyKey(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return null;
}

/** `draft.scope = …` / `draft['scope'] = …` — a scope set after the literal was built. */
function scopeWrite(node: ts.Node): ts.BinaryExpression | null {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return null;
  }
  const { left } = node;
  if (ts.isPropertyAccessExpression(left) && left.name.text === 'scope') return node;
  if (
    ts.isElementAccessExpression(left) &&
    ts.isStringLiteralLike(left.argumentExpression) &&
    left.argumentExpression.text === 'scope'
  ) {
    return node;
  }
  return null;
}

interface ScopeAssignment {
  readonly file: string;
  readonly expression: string;
  readonly scope: RuleScope | null;
}

/** The scope an expression states, read through its own file's constants. */
function resolveScope(
  value: ts.Expression,
  constants: ReadonlyMap<string, RuleScope>,
): RuleScope | null {
  const node = unwrap(value);
  return literalScope(node) ?? (ts.isIdentifier(node) ? (constants.get(node.text) ?? null) : null);
}

/** Every `scope` one module sets, wherever in it they are written. */
function scopesIn(file: string, source: ts.SourceFile): readonly ScopeAssignment[] {
  const constants = scopeConstants(source);
  const found: ScopeAssignment[] = [];
  for (const node of descendants(source)) {
    const write = scopeWrite(node);
    if (ts.isPropertyAssignment(node) && propertyKey(node.name) === 'scope') {
      const { initializer } = node;
      const expression = initializer.getText(source);
      found.push({ file, expression, scope: resolveScope(initializer, constants) });
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'scope') {
      // `{ scope }` names a value from somewhere this scan cannot see.
      found.push({ file, expression: '{ scope }', scope: null });
    } else if (write !== null) {
      const expression = write.getText(source);
      found.push({ file, expression, scope: resolveScope(write.right, constants) });
    }
  }
  return found;
}

/** Every `scope` the catalogue's source sets, across every module a rule can reach. */
function scopeAssignments(): readonly ScopeAssignment[] {
  return catalogueSources().flatMap((path) =>
    scopesIn(nodePath.relative(SRC_DIR, path), parseSource(path)),
  );
}

describe('the catalogue’s own scope assignments', () => {
  const assignments = scopeAssignments();

  /**
   * Unresolved is the only honest answer for a value this scan cannot read — a
   * computed expression, a constant from another module, a `{ scope }`
   * shorthand — and saying so out loud is what stops an unrecognised spelling
   * from being counted as zero by the assertion below.
   */
  it('states every scope as a literal or a named constant of the same file', () => {
    const unresolved = assignments.filter((assignment) => assignment.scope === null);
    expect(unresolved.map(({ file, expression }) => `${file}: ${expression}`)).toEqual([]);
  });

  /**
   * The exact-equality is what makes this exhaustive: every site-valued `scope`
   * in the catalogue is accounted for by a rule that declares itself site-scoped,
   * so **no draft carries one**. A page-scoped rule can therefore only ever emit
   * `draft.scope ?? 'page'` — page-scoped findings, all of them, whatever the
   * rule does. A scan that silently found nothing fails this too.
   */
  it('never overrides a draft’s scope to site, anywhere in the catalogue', () => {
    const siteValued = assignments
      .filter((assignment) => assignment.scope === 'site')
      .map(({ file, expression }) => `${file}: scope: ${expression}`);
    const siteRules = RULESET.rules.filter((rule) => rule.scope === 'site');
    expect(siteValued).toHaveLength(siteRules.length);
  });
});
