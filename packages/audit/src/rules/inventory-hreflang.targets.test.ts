import { describe, expect, it } from 'vitest';
import type { PageEvidence } from '../evidence';
import { hreflangRules } from './inventory-hreflang';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';
import { resultFor, link, pageAt, buildPageAt } from './inventory-hreflang.test-utils';

/**
 * The alternates block of a cross-domain translation set: the Ukrainian
 * version lives on a *different* host. Reciprocal hreflang means every page in
 * the set carries this **same** block, which is what both pages below get —
 * the ordinary emission pattern, not a contrived one.
 */
const CROSS_ORIGIN_ALTERNATES = [
  link('en', 'https://our-brand.com/en/'),
  link('uk', 'https://other-brand.de/uk/'),
];

/**
 * That block over a build which happens to carry a same-path `/uk/` file of
 * its own, in another language again.
 *
 * The English page points at itself in its own language, so it says where it
 * is deployed and nothing here is ambiguous: `other-brand.de` is not this
 * site, and the audit collected no page from it. Matching on the path alone
 * reported that target as reachable and then read the local file's `lang` as
 * what `other-brand.de` serves — and note the `/uk` page's own copy of the
 * block puts `other-brand.de` at that page's *own* path, so a claim read
 * without the language check lets the foreign host unlock itself.
 */
const CROSS_ORIGIN_BUILD: readonly PageEvidence[] = [
  makeBuildPage({
    id: 'en',
    path: 'en/index.html',
    document: makeDocument({ htmlLang: 'en', alternates: CROSS_ORIGIN_ALTERNATES }),
  }),
  makeBuildPage({
    id: 'uk',
    path: 'uk/index.html',
    document: makeDocument({ htmlLang: 'ru', alternates: CROSS_ORIGIN_ALTERNATES }),
  }),
];

describe('core/hreflang-target-unresolvable', () => {
  const RULE = 'core/hreflang-target-unresolvable';
  // `traversal` on network evidence needs *some* page reached by following a
  // declared target; this anchor establishes the capability without being
  // the target under test in any single case.
  const ANCHOR = makePage({
    id: 'anchor',
    url: 'https://example.com/anchor/',
    reach: 'declared-target',
  });

  it('needs traversal — folded from the catalogue’s static|traversal', () => {
    const rule = hreflangRules.find((entry) => entry.id === RULE);
    expect(rule?.capabilities).toEqual(['traversal']);
  });

  it('passes when every declared target is in the collected set', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const ru = pageAt('https://example.com/ru/', [], { id: 'ru' });
    expect(resultFor(RULE, networkEvidence([uk, ru, ANCHOR])).verdict).toBe('pass');
  });

  it('fails a target absent from the collected page set', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/absent from the collected page set/);
  });

  it('cites the matching probe when one 404s', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const probe = makeProbe({ id: 'probe-404', url: 'https://example.com/ru/', status: 404 });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR], [probe]));
    expect(result.findings[0]?.summary).toMatch(/404/);
    expect(result.findings[0]?.evidence).toContainEqual({ kind: 'probe', probeId: 'probe-404' });
  });

  /**
   * A chain the collector stopped following at a ceiling of its own. **One
   * check for both ceilings**, because they share the one flag: an 11-hop chain
   * and a chain the request budget ended are the same fact here — nobody
   * fetched the URL the last hop pointed at, so no page exists to resolve
   * against, and "absent from the collected page set" would name a site for the
   * operator's `--budget` or the collector's `maxHops`. `core/switch-bounces`
   * publishes the truthful `observed` warn about that same chain.
   */
  it('withholds the fail when the target’s chain was never followed to its end', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const probe = makeProbe({
      id: 'probe-truncated',
      url: 'https://example.com/ru/',
      status: 302,
      redirectChain: [
        { url: 'https://example.com/ru/', status: 302, location: 'https://example.com/ru/1' },
      ],
      redirectChainTruncated: true,
    });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR], [probe]));

    expect(result.findings).toEqual([]);
    // Withholding is not passing. `pass` would say the declared `ru` target
    // resolves, off a chain whose end nobody saw — the silence one layer up
    // that "`not-collected` is never `pass`" exists to refuse.
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/never observed/u);
  });

  /** The withholding is that flag's, not "any probe whose chain redirected". */
  it('still fails a target whose chain the collector followed to its end', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
      id: 'uk',
    });
    const probe = makeProbe({
      id: 'probe-landed',
      url: 'https://example.com/ru/',
      status: 404,
      redirectChain: [
        { url: 'https://example.com/ru/', status: 302, location: 'https://example.com/ru/1' },
      ],
    });
    expect(resultFor(RULE, networkEvidence([uk, ANCHOR], [probe])).verdict).toBe('fail');
  });

  it('resolves targets on a filesystem build with no fetch involved', () => {
    const uk = makeBuildPage({
      id: 'uk',
      // Declared from `/uk/index.html`, so the sibling build directory is
      // `../ru/`. A bare `ru/index.html` would name `/uk/ru/index.html` —
      // which is what a browser reads, and what this rule must read too.
      document: makeDocument({ alternates: [link('ru', '../ru/index.html')] }),
      path: 'uk/index.html',
    });
    const ru = makeBuildPage({ id: 'ru', path: 'ru/index.html' });
    expect(resultFor(RULE, filesystemEvidence([uk, ru])).verdict).toBe('pass');
  });

  it('resolves a relative target against the declaring page, not the site root', () => {
    const en = pageAt('https://example.com/docs/en/guide.html', [link('uk', '../uk/guide.html')], {
      id: 'en',
    });
    const target = pageAt('https://example.com/docs/uk/guide.html', [], { id: 'uk-doc' });
    expect(resultFor(RULE, networkEvidence([en, target, ANCHOR])).verdict).toBe('pass');
  });

  it('resolves a relative target on a build the same way — the dogfood gate’s own shape', () => {
    // Filesystem evidence is what `nx run marketing:audit` adjudicates, and a
    // build page carries a `path` and no `url`. Threading the url as the base
    // handed this page `undefined` and the alternate fell back to the site
    // root, publishing a `fail` against markup a browser resolves correctly.
    const en = buildPageAt('docs/en/guide.html', [link('uk', '../uk/guide.html')], 'en');
    const target = buildPageAt('docs/uk/guide.html', [], 'uk-doc');
    expect(resultFor(RULE, filesystemEvidence([en, target])).verdict).toBe('pass');
  });

  it('still fails a relative target on a build that resolves to nothing collected', () => {
    // The mirror of the case above: correct resolution is not permissiveness.
    const en = buildPageAt('docs/en/guide.html', [link('uk', '../uk/guide.html')], 'en');
    const stray = buildPageAt('uk/guide.html', [], 'stray');
    const result = resultFor(RULE, filesystemEvidence([en, stray]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/absent from the collected page set/);
  });

  it('resolves an absolute target on a build that declares that origin for itself', () => {
    const uk = makeBuildPage({
      id: 'uk',
      path: 'uk/index.html',
      document: makeDocument({
        alternates: [link('uk', 'https://example.com/uk/'), link('ru', 'https://example.com/ru/')],
      }),
    });
    const ru = makeBuildPage({
      id: 'ru',
      path: 'ru/index.html',
      document: makeDocument({ alternates: [link('ru', 'https://example.com/ru/')] }),
    });
    expect(resultFor(RULE, filesystemEvidence([uk, ru])).verdict).toBe('pass');
  });

  it('fails a cross-origin target that shares its path with a local build file', () => {
    const result = resultFor(RULE, filesystemEvidence(CROSS_ORIGIN_BUILD));
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject).toEqual({ path: 'en/index.html' });
    expect(result.findings[0]?.summary).toMatch(
      /"https:\/\/other-brand\.de\/uk\/" is absent from the collected page set/,
    );
  });

  it('resolves absolute targets on a build whose pages carry no self-reference', () => {
    // A missing self-reference is `core/hreflang-self-missing`, and it grades
    // `warn`. It must not become a wall of unresolvable fails on targets that
    // are sitting in the build — an unknown origin is not a foreign one.
    const en = makeBuildPage({
      id: 'en',
      path: 'en/index.html',
      document: makeDocument({
        htmlLang: 'en',
        alternates: [link('uk', 'https://example.com/uk/')],
      }),
    });
    const uk = makeBuildPage({
      id: 'uk',
      path: 'uk/index.html',
      document: makeDocument({
        htmlLang: 'uk',
        alternates: [link('en', 'https://example.com/en/')],
      }),
    });
    expect(resultFor(RULE, filesystemEvidence([en, uk])).verdict).toBe('pass');
  });

  it('reports an alternate with an empty href as unresolvable, citing no probe', () => {
    const uk = pageAt('https://example.com/uk/', [link('ru', '')], { id: 'uk' });
    const result = resultFor(RULE, networkEvidence([uk, ANCHOR]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/absent from the collected page set/);
    expect(result.findings[0]?.evidence).not.toContainEqual(
      expect.objectContaining({ kind: 'probe' }),
    );
  });

  it('does not flag a self-referencing alternate as unresolvable', () => {
    const uk = pageAt(
      'https://example.com/uk/',
      [link('uk', 'https://example.com/uk/'), link('ru', 'https://example.com/ru/')],
      { id: 'uk' },
    );
    const ru = pageAt('https://example.com/ru/', [], { id: 'ru' });
    expect(resultFor(RULE, networkEvidence([uk, ru, ANCHOR])).verdict).toBe('pass');
  });
});

describe('core/hreflang-target-wrong-language', () => {
  const RULE = 'core/hreflang-target-wrong-language';
  const ANCHOR = makePage({
    id: 'anchor',
    url: 'https://example.com/anchor/',
    reach: 'declared-target',
  });
  const source = pageAt('https://example.com/uk/', [link('ru', 'https://example.com/ru/')], {
    id: 'source',
  });
  // Real prose: the classifier fallback is only meaningful against text it
  // actually has an opinion about. Same strings already proven in
  // page-declaration.test.ts.
  const UK_TEXT =
    'Ми доставляємо замовлення по всій Україні протягом двох робочих днів, а оплата можлива карткою або готівкою при отриманні.';
  const RU_TEXT =
    'Мы доставляем заказы по всей стране в течение двух рабочих дней, оплата возможна картой или наличными при получении.';

  it('is the family’s one hybrid rule, needing traversal', () => {
    const rule = hreflangRules.find((entry) => entry.id === RULE);
    expect(rule?.hybrid).toBe(true);
    expect(rule?.capabilities).toEqual(['traversal']);
  });

  it('passes when the target’s own <html lang> agrees with the declaration', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    expect(resultFor(RULE, networkEvidence([source, target, ANCHOR])).verdict).toBe('pass');
  });

  it('fails outright on a declared mismatch — a real, undowngraded fail', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    expect(result.verdict).toBe('fail');
    const finding = result.findings[0];
    expect(finding?.via).toBeUndefined();
    expect(finding?.downgradedFrom).toBeUndefined();
    expect(finding?.summary).toMatch(/serves the wrong language/);
  });

  it('falls back to the classifier when <html lang> is absent, and the kernel downgrades the fail', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [{ nodePath: 'main > p', text: UK_TEXT, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.verdict).toBe('observation');
    expect(finding?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('passes when the classifier agrees with the declared language', () => {
    const target = makePage({
      id: 'target',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [{ nodePath: 'main > p', text: RU_TEXT, inheritedLang: null }],
      }),
    });
    expect(resultFor(RULE, networkEvidence([source, target, ANCHOR])).verdict).toBe('pass');
  });

  it('follows a relative target, so a wrong-language alternate is still caught', () => {
    const en = pageAt('https://example.com/docs/en/guide.html', [link('uk', '../uk/guide.html')], {
      id: 'en',
    });
    const target = makePage({
      id: 'uk-doc',
      url: 'https://example.com/docs/uk/guide.html',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    const result = resultFor(RULE, networkEvidence([en, target, ANCHOR]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/serves the wrong language/);
  });

  it('does not fire when the target is absent from the collected set', () => {
    expect(resultFor(RULE, networkEvidence([source, ANCHOR])).verdict).toBe('pass');
  });

  it('does not read a local build file’s lang and attribute it to a cross-origin target', () => {
    const result = resultFor(RULE, filesystemEvidence(CROSS_ORIGIN_BUILD));
    // The `/uk` file promising `uk` from its own copy of the block while
    // declaring `ru` is a real defect *of that page*, and stays reported. What
    // must not happen is the English page's `other-brand.de` alternate being
    // answered with that local file's `lang`.
    expect(result.findings.map((finding) => finding.subject)).toEqual([{ path: 'uk/index.html' }]);
  });

  it('falls back to the classifier when the target’s <html lang> is blank, the same as absent', () => {
    const target = makePage({
      id: 'target-blank',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: '   ',
        textNodes: [{ nodePath: 'main > p', text: UK_TEXT, inheritedLang: null }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.denominator).toEqual({ examined: 1, matched: 1 });
  });

  it('reports the majority classified language among several sampled nodes, not just any node that matched', () => {
    const target = makePage({
      id: 'target-majority',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [
          { nodePath: 'main > p.1', text: UK_TEXT, inheritedLang: null },
          { nodePath: 'main > p.2', text: UK_TEXT, inheritedLang: null },
          { nodePath: 'main > p.3', text: RU_TEXT, inheritedLang: null },
        ],
      }),
    });
    const result = resultFor(RULE, networkEvidence([source, target, ANCHOR]));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.summary).toMatch(/classified uk/);
    // Two of the three nodes classified `uk`; the third classified `ru`. The
    // published sentence reads «N of M text nodes … classified uk», so `matched`
    // has to be the winner's own count — a third node that voted for something
    // else cannot be counted toward the language the sentence names.
    expect(finding?.denominator).toEqual({ examined: 3, matched: 2 });
  });

  it('does not flag a target with no classifiable text and no <html lang>', () => {
    const target = makePage({
      id: 'target-empty',
      url: 'https://example.com/ru/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [{ nodePath: 'main > p', text: 'Hi', inheritedLang: null }],
      }),
    });
    expect(resultFor(RULE, networkEvidence([source, target, ANCHOR])).verdict).toBe('pass');
  });

  it('reports no evidence when the declared language has no shipped classifier profile', () => {
    const deSource = pageAt(
      'https://example.com/de-src/',
      [link('de', 'https://example.com/de/')],
      {
        id: 'de-source',
      },
    );
    const target = makePage({
      id: 'target-de',
      url: 'https://example.com/de/',
      document: makeDocument({
        htmlLang: null,
        textNodes: [
          {
            nodePath: 'main > p',
            text: 'Ein ausreichend langer Textabschnitt, der mehr als vierzig Zeichen enthält, damit er nicht zu kurz ist.',
            inheritedLang: null,
          },
        ],
      }),
    });
    expect(resultFor(RULE, networkEvidence([deSource, target, ANCHOR])).verdict).toBe('pass');
  });

  it('skips an x-default alternate — it names a fallback, not a language', () => {
    const withXDefault = pageAt(
      'https://example.com/uk/',
      [
        link('ru', 'https://example.com/ru/'),
        link('x-default', 'https://example.com/nonexistent-fallback/'),
      ],
      { id: 'source-xdefault' },
    );
    const target = makePage({
      id: 'target-ru2',
      url: 'https://example.com/ru/',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    expect(resultFor(RULE, networkEvidence([withXDefault, target, ANCHOR])).verdict).toBe('pass');
  });
});
