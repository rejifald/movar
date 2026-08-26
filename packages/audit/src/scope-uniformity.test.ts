import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import nodePath from 'node:path';
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

const RULES_DIR = nodePath.join(new URL('.', import.meta.url).pathname, 'rules');

/** `const SITE = 'site' as const;` — how every family file names its scope values. */
const SCOPE_CONSTANT =
  /const\s+(?<name>[A-Z][A-Z\d_]*)\s*=\s*'(?<scope>page|site)'\s+as\s+const;/gu;

/**
 * Every `scope:` a family file assigns, on a rule or on a draft alike. The
 * trailing comma is what tells an assignment from an interface field or a
 * sentence in a doc comment; Prettier's `trailingComma: "all"` puts one on the
 * last property too, and the exact count below is what would notice if it ever
 * stopped.
 */
const SCOPE_ASSIGNMENT = /\bscope:\s*(?<expression>[^\s,][^,\n]*),/gu;

interface ScopeAssignment {
  readonly file: string;
  readonly expression: string;
  readonly scope: RuleScope | null;
}

/** Every `scope:` in the catalogue's own source, resolved through the file's constants. */
function scopeAssignments(): readonly ScopeAssignment[] {
  const found: ScopeAssignment[] = [];
  for (const entry of readdirSync(RULES_DIR).toSorted()) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    const source = readFileSync(nodePath.join(RULES_DIR, entry), 'utf8');
    const constants = new Map<string, RuleScope>();
    for (const { groups } of source.matchAll(SCOPE_CONSTANT)) {
      constants.set(groups?.['name'] ?? '', (groups?.['scope'] ?? 'page') as RuleScope);
    }
    for (const { groups } of source.matchAll(SCOPE_ASSIGNMENT)) {
      const expression = (groups?.['expression'] ?? '').trim();
      const literal = expression === "'page'" || expression === "'site'";
      found.push({
        file: entry,
        expression,
        scope: literal
          ? (expression.slice(1, -1) as RuleScope)
          : (constants.get(expression) ?? null),
      });
    }
  }
  return found;
}

describe('the catalogue’s own scope assignments', () => {
  const assignments = scopeAssignments();

  /** A computed scope would slip past the count below without being counted. */
  it('states every scope as a literal or a named constant of the same file', () => {
    const unresolved = assignments.filter((assignment) => assignment.scope === null);
    expect(unresolved.map(({ file, expression }) => `${file}: ${expression}`)).toEqual([]);
  });

  /**
   * The exact-equality is what makes this exhaustive: every site-valued `scope:`
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
