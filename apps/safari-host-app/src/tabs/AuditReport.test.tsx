import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CORE_RULESET, evaluate } from '@movar/audit';
import type { Evidence } from '@movar/audit';
import { messagesEn } from '../i18n/messages-en';
import { messagesUk } from '../i18n/messages-uk';
import { familyTitleFor } from '../i18n';
import { exportReport, openAuditedSite } from '../bridge';
import { AuditReportScreen, artifactFilename, subjectOf } from './AuditReport';

vi.mock('../bridge', () => ({ exportReport: vi.fn(), openAuditedSite: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('artifactFilename', () => {
  it('names the file after the site and the moment it was checked', () => {
    expect(artifactFilename('https://example.com/uk/', '2026-08-14T14:05:09.123Z')).toBe(
      'movar-audit-example-com-2026-08-14t14-05-09.html',
    );
  });

  it('keeps two different targets from collapsing onto one name', () => {
    const a = artifactFilename('https://a.example/', '2026-08-14T14:05:09.000Z');
    const b = artifactFilename('https://b.example/', '2026-08-14T14:05:09.000Z');
    expect(a).not.toBe(b);
  });

  it('never produces an empty or traversing name from a hostile target', () => {
    // Swift re-validates before touching the filesystem, but this side must not
    // hand it something absurd in the first place.
    for (const target of ['not a url', 'https://../../etc/', '']) {
      const name = artifactFilename(target, '2026-08-14T14:05:09.000Z');
      expect(name.startsWith('movar-audit-')).toBe(true);
      expect(name.endsWith('.html')).toBe(true);
      expect(name).not.toContain('/');
      expect(name).not.toContain('..');
    }
  });
});

/** A page with enough wrong to produce failures, warnings and observations. */
const MIXED = `<!doctype html><html lang="uk"><head>
    <link rel="alternate" hreflang="ru" href="/ru/">
  </head><body>
    <nav class="lang"><a href="#">UKR</a><a href="#">RU</a></nav>
    <main><p>Добро пожаловать на наш сайт, здесь очень много интересного текста.</p></main>
  </body></html>`;

function reportFor(html: string) {
  const evidence = {
    schemaVersion: 1,
    source: {
      kind: 'network',
      vantage: { id: 'local', kind: 'local' },
      probes: [
        {
          id: 'probe-1',
          pageId: 'page-1',
          url: 'https://example.com/',
          acceptLanguage: null,
          vantage: { id: 'local', kind: 'local' },
          cookieState: 'cold',
          outcome: 'ok',
          status: 200,
          responseHeaders: {},
          redirectChain: [],
        },
      ],
      robots: 'not-applicable',
    },
    collectedAt: '2026-08-14T14:05:09.000Z',
    collector: { id: 'swift-urlsession', version: '1' },
    pages: [
      {
        id: 'page-1',
        url: 'https://example.com/',
        reach: 'requested',
        rendered: false,
        document: {
          htmlLang: 'uk',
          langAttributes: [],
          alternates: [{ hreflang: 'ru', href: '/ru/', source: 'link' }],
          picker: null,
          links: [],
          textNodes: [
            {
              nodePath: 'html > body > main > p',
              text: 'Добро пожаловать на наш сайт, здесь очень много интересного текста.',
              inheritedLang: null,
            },
          ],
        },
      },
    ],
  } as unknown as Evidence;
  return { evidence, report: evaluate(evidence, CORE_RULESET), html };
}

/**
 * The same evidence with every leg bounced through two redirects.
 *
 * The shape UMI-CMS Ukrainian shops publish: a `uk` target that 301s straight
 * back to Russian. It is the case the whole tool exists for, and the chain is
 * the only place the report can show it.
 */
function bouncingEvidence(): Evidence {
  const { evidence } = reportFor(MIXED);
  const source = evidence.source as unknown as { probes: readonly Record<string, unknown>[] };
  return {
    ...evidence,
    source: {
      ...evidence.source,
      probes: source.probes.map((probe) => ({
        ...probe,
        redirectChain: [
          { url: 'https://example.com/', status: 302, location: 'https://example.com/uk/' },
          { url: 'https://example.com/uk/', status: 301, location: 'https://example.com/ru/' },
        ],
      })),
    },
  } as unknown as Evidence;
}

function renderScreen(overrides: Partial<Parameters<typeof AuditReportScreen>[0]> = {}) {
  const { evidence, report } = reportFor(MIXED);
  const onBack = vi.fn();
  const onRerun = vi.fn();
  const result = render(
    <AuditReportScreen
      messages={messagesEn}
      locale="en"
      target="https://example.com/"
      report={report}
      evidence={evidence}
      ranAt="2026-08-14T14:05:09.000Z"
      running={false}
      onBack={onBack}
      onRerun={onRerun}
      {...overrides}
    />,
  );
  return { ...result, onBack, onRerun, report };
}

describe('AuditReportScreen', () => {
  it('leads with the site, then the verdict, then the actions', () => {
    const { container } = renderScreen();
    const order = [
      ...container.querySelectorAll('.audit-screen-title, .result-head, .audit-actions'),
    ].map((node) => node.className.split(' ')[0]);
    expect(order).toEqual(['audit-screen-title', 'result-head', 'audit-actions']);
    // The title is the SITE; the exact audited address stays beneath it.
    expect(container.querySelector('.audit-screen-title')?.textContent).toBe('example.com');
    expect(container.querySelector('.audit-screen-target')?.textContent).toBe(
      'https://example.com/',
    );
  });

  it('goes back and re-runs through its own callbacks', () => {
    const { onBack, onRerun } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.again }));
    expect(onRerun).toHaveBeenCalledTimes(1);
  });

  it('disables the re-run while a check is in flight', () => {
    renderScreen({ running: true });
    const button = screen.getByRole('button', { name: messagesEn.audit.running });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks coverage rows that produced findings, and jumps to the first', () => {
    const { container } = renderScreen();
    const indexed = container.querySelector('.audit-rule.has-findings');
    expect(indexed).not.toBeNull();
    // The row states how many, rather than repeating the rule's verdict word.
    expect(indexed?.textContent).toMatch(/finding/u);

    const jump = indexed?.querySelector('.audit-rule-jump');
    const target = container.querySelector('.audit-finding');
    const scrollIntoView = vi.fn();
    // jsdom implements no layout, so the method does not exist to spy on.
    Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView, writable: true });
    vi.spyOn(document, 'getElementById').mockReturnValue(target as HTMLElement);

    fireEvent.click(jump!);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('opens every row, including the ones that found nothing', () => {
    // A list where only the rows that found something respond teaches the
    // reader that the quiet ones hold nothing — exactly backwards for the ones
    // that say "not checked", which is where the reason lives.
    const { container } = renderScreen();
    const rows = [...container.querySelectorAll('.audit-rule')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.querySelector('summary') !== null)).toBe(true);
  });

  it('says what was missing on a check it could not run', () => {
    // `evaluate()` records the missing capability per rule; the report used to
    // compute it and throw it away, so a row said "not checked" and stopped.
    const { container } = renderScreen();
    const uncollected = [...container.querySelectorAll('.audit-rule.is-not-collected')];
    expect(uncollected.length).toBeGreaterThan(0);
    for (const row of uncollected) {
      const why = row.querySelector('.audit-rule-because')?.textContent ?? '';
      expect(why).not.toBe('');
      // Named in the reader's words, not as a `Capability` identifier.
      expect(why).not.toMatch(/multi-vantage|traversal/u);
    }
    // The capability wording is the catalogue's, so a rename cannot silently
    // leave the sentence naming nothing.
    const named = Object.values(messagesEn.audit.capabilities);
    const everyWhy = uncollected
      .map((row) => row.querySelector('.audit-rule-because')?.textContent ?? '')
      .join(' ');
    expect(named.some((phrase) => everyWhy.includes(phrase))).toBe(true);
  });

  it('quotes the kernel for a check that did not apply, and says so for a pass', () => {
    const { container, report } = renderScreen();
    const reasons = report.results
      .filter((r) => r.notApplicableReason !== undefined)
      .map((r) => r.notApplicableReason ?? '');
    expect(reasons.length).toBeGreaterThan(0);
    // Verbatim, like a finding's summary: the wording a published report quotes
    // is not localized, or two people re-running the same evidence would get
    // different documents.
    for (const reason of reasons) expect(container.textContent).toContain(reason);
    expect(container.textContent).toContain(messagesEn.audit.whyPassed);
  });

  it('offers the jump as an action inside the row, not as the row itself', () => {
    const { container } = renderScreen();
    const indexed = container.querySelector('.audit-rule.has-findings');
    expect(indexed?.querySelector('.audit-rule-jump')?.textContent).toContain(
      messagesEn.audit.goToFindings,
    );
    // A row that found nothing has nowhere to go, so it offers no jump.
    const plain = [...container.querySelectorAll('.audit-rule')].filter(
      (row) => !row.className.includes('has-findings'),
    );
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((row) => row.querySelector('.audit-rule-jump') === null)).toBe(true);
  });

  it('states a rule once, with the pages under it, not once per page', () => {
    const { container, report } = renderScreen();
    const cards = [...container.querySelectorAll('.audit-finding')];
    // One card per rule: a rule reports once per page, and a five-page site
    // otherwise turns twelve problems into forty near-identical cards that
    // differ only by a URL.
    const ids = cards.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(report.findings.length + 1);
    // Nothing is lost by grouping: every finding's own sentence is still in the
    // card's disclosure.
    for (const finding of report.findings) {
      expect(container.textContent).toContain(finding.summary);
    }
  });

  it('names the verdict in words on every card, never in colour alone', () => {
    // The palette carries one accent and one danger hue, so severity cannot be
    // spelled in colour — and a rail a reader cannot see is a rail that is not
    // there, on screen or in a printed export.
    const { container } = renderScreen();
    for (const card of container.querySelectorAll('.audit-finding')) {
      expect(card.querySelector('.audit-chip')?.textContent).toBeTruthy();
    }
  });

  it('counts distinct pages, never the same page twice', () => {
    // A rule can report the same page more than once — once per inventory
    // source, say. "on 3 pages" over two URLs is a false statement about a
    // named site, which is the one claim this report may never make.
    const { container } = renderScreen({ report: repeatedPageReport() });
    const card = container.querySelector('.audit-finding');
    const subjects = [...container.querySelectorAll('.audit-subject')].map(
      (node) => node.textContent,
    );
    expect(subjects).toEqual(['https://example.com/', 'https://example.com/ru/']);
    expect(card?.querySelector('.audit-finding-scale')?.textContent).toBe(
      messagesEn.audit.pageCount(2),
    );
    // Grouping hides nothing: all three sentences are still in the disclosure.
    expect(container.textContent).toContain('Once from hreflang.');
    expect(container.textContent).toContain('Again from the picker.');
    expect(container.textContent).toContain('And on the Russian page.');
  });

  it('shows what each request asked for and what came back', () => {
    // The collector recorded every leg and the report rendered none of it. For
    // a language audit this IS the behaviour under examination, and without it
    // the findings read as assertions with nothing behind them. It is also the
    // closest thing to "how the site looked" that an audit which never renders
    // a page can honestly offer.
    const { container } = renderScreen();
    const legs = [...container.querySelectorAll('.audit-leg')];
    expect(legs.length).toBeGreaterThan(0);
    // The leg sent with no header at all is named, not left blank.
    expect(container.textContent).toContain(messagesEn.audit.matrix.noPreference);
    // The language is named, not printed as a raw tag.
    expect(legs[0]?.querySelector('.audit-leg-got')?.textContent).toBe('Ukrainian');
  });

  it('shows the redirect chain a leg walked, and offers the live site as NOW', () => {
    const { container } = renderScreen({ evidence: bouncingEvidence() });
    const hops = [...container.querySelectorAll('.audit-leg-hop')].map((n) => n.textContent);
    expect(hops).toHaveLength(2);
    // Same-host hops shorten to their path — three absolute URLs wrap into a
    // paragraph and hide the one thing worth seeing, that the path changed.
    expect(hops[0]).toContain('/uk/');
    expect(hops[0]).toContain('302');
    expect(hops[1]).toContain('/ru/');

    // No screenshot exists and none can, so the substitute is labelled honestly.
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.matrix.openSite }));
    expect(vi.mocked(openAuditedSite)).toHaveBeenCalledWith('https://example.com/');
    expect(screen.getByText(messagesEn.audit.matrix.openSiteNote)).toBeDefined();
  });

  it('leads an unscored card with the measurement, not the rule question', () => {
    // `core/serving-default-language` is titled "What language loads with no
    // stated preference" — a question. Its answer is the kernel's measurement,
    // and behind a disclosure it left the card reading as a shrug.
    const { container, report } = renderScreen();
    const measured = [...container.querySelectorAll('.audit-measurement')].map(
      (node) => node.textContent,
    );
    expect(measured.length).toBeGreaterThan(0);
    // No repeats: two pages measuring identically are one fact, not two.
    expect(new Set(measured).size).toBe(measured.length);

    const unscored = new Set(
      report.findings
        .filter((f) => f.verdict === 'observation' || f.verdict === 'info')
        .map((f) => f.summary),
    );
    for (const shown of measured) expect(unscored).toContain(shown);
    // A SCORED card keeps its title as the headline — its measurement is
    // supporting detail, and promoting it would double the card for no gain.
    const scored = [...container.querySelectorAll('.audit-finding')].filter(
      (card) => card.className.includes('is-fail') || card.className.includes('is-warn'),
    );
    expect(scored.length).toBeGreaterThan(0);
    expect(scored.every((card) => card.querySelector('.audit-measurement') === null)).toBe(true);
  });

  it('sections the findings by catalogue family, in catalogue order', () => {
    // The composer promises three questions — what the site declares, what it
    // serves, whether its switcher works — and a flat list answers none of them.
    const { container } = renderScreen();
    const headings = [...container.querySelectorAll('.audit-family-title')].map(
      (node) => node.textContent,
    );
    expect(headings.length).toBeGreaterThan(1);
    // Catalogue order, so two runs of the same site produce the same document.
    const catalogue = CORE_RULESET.families.map((family) => familyTitleFor('en', family.id));
    const seen = headings.map((heading) => catalogue.indexOf(heading));
    expect(seen).not.toContain(-1);
    expect(seen).toEqual([...seen].toSorted((a, b) => a - b));
  });

  it('renders rule titles in Ukrainian without touching the kernel', () => {
    const { container } = renderScreen({ messages: messagesUk, locale: 'uk' });
    // The kernel still emits English; only the display layer is localized, and
    // each finding keeps the kernel's exact sentence in its Details.
    expect(container.textContent).toContain('Яка мова завантажується');
    expect(container.textContent).toContain(messagesUk.audit.detailFinding);
  });
});

/**
 * One rule that reported the same page twice, plus a second page.
 *
 * Hand-built: the collector this tab drives digests one page per distinct body,
 * so a rule reporting twice on the same URL is not reachable from a real run
 * here — but it is exactly what a site-scoped rule with two inventory sources
 * produces, and what the CLI's multi-page bundles will bring in.
 */
function repeatedFinding(url: string, summary: string) {
  return {
    rule: 'core/inventory-sources-disagree',
    verdict: 'fail',
    grounding: 'declared',
    scope: 'page',
    subject: { url },
    evidence: [],
    summary,
  } as const;
}

function repeatedPageReport() {
  const findings = [
    repeatedFinding('https://example.com/', 'Once from hreflang.'),
    repeatedFinding('https://example.com/', 'Again from the picker.'),
    repeatedFinding('https://example.com/ru/', 'And on the Russian page.'),
  ];
  return {
    schemaVersion: 1,
    ruleset: { id: 'core', version: '0.0.0', ruleIds: ['core/inventory-sources-disagree'] },
    evidence: {
      schemaVersion: 1,
      sourceKind: 'network',
      collectedAt: '2026-08-14T14:05:09.000Z',
      collector: { id: 'swift-urlsession', version: '1' },
      capabilities: ['static'],
    },
    results: [
      {
        rule: 'core/inventory-sources-disagree',
        title: 'Sources disagree',
        grounding: 'declared',
        scope: 'page',
        capabilities: ['static'],
        verdict: 'fail',
        findings,
      },
    ],
    findings,
    coverage: {
      rules: 1,
      ran: 1,
      notApplicable: 0,
      notCollected: 0,
      passed: 0,
      failed: 1,
      warned: 0,
    },
    brokenPromises: 3,
  } as unknown as ReturnType<typeof evaluate>;
}

describe('subjectOf', () => {
  const base = {
    rule: 'core/x',
    verdict: 'fail',
    grounding: 'declared',
    scope: 'page',
    evidence: [],
    summary: 's',
  } as const;

  it('prefers the page URL, then the build path, then the element', () => {
    expect(subjectOf({ ...base, subject: { url: 'https://a/', path: '/p', node: 'html' } })).toBe(
      'https://a/',
    );
    expect(subjectOf({ ...base, subject: { path: '/uk/index.html' } })).toBe('/uk/index.html');
    expect(subjectOf({ ...base, subject: { node: 'html > body' } })).toBe('html > body');
    expect(subjectOf({ ...base, scope: 'site', subject: {} })).toBeUndefined();
  });
});

/**
 * A report with nothing missing and nothing observed.
 *
 * Hand-built rather than produced by a real run: this tier always leaves some
 * of the catalogue uncollected, so the "everything ran" rendering is otherwise
 * unreachable — and it is exactly the shape a richer collector will produce.
 */
function completeReport() {
  return {
    schemaVersion: 1,
    ruleset: { id: 'core', version: '0.0.0', ruleIds: ['core/a'] },
    evidence: {
      schemaVersion: 1,
      sourceKind: 'network',
      collectedAt: '2026-08-14T14:05:09.000Z',
      collector: { id: 'swift-urlsession', version: '1' },
      capabilities: ['static'],
    },
    results: [
      {
        rule: 'core/a',
        title: 'Everything ran',
        grounding: 'declared',
        scope: 'site',
        capabilities: ['static'],
        verdict: 'fail',
        findings: [],
      },
    ],
    findings: [
      {
        rule: 'core/a',
        verdict: 'fail',
        grounding: 'declared',
        scope: 'site',
        // Whole-site finding: nothing to point at.
        subject: {},
        evidence: [],
        summary: 'A site-wide failure.',
      },
    ],
    coverage: {
      rules: 1,
      ran: 1,
      notApplicable: 0,
      notCollected: 0,
      passed: 0,
      failed: 1,
      warned: 0,
    },
    brokenPromises: 1,
  } as unknown as ReturnType<typeof evaluate>;
}

describe('AuditReportScreen — a report with nothing left uncollected', () => {
  it('drops the coverage caveat, the observations group and an absent subject', () => {
    const { container } = renderScreen({ report: completeReport() });
    // No checks went uncollected, so the caveat that exists to stop "0 broken
    // promises" reading as "all clear" has nothing to warn about.
    expect(screen.queryByText(messagesEn.audit.notCollectedNote)).toBeNull();
    expect(screen.queryByText(messagesEn.audit.observations)).toBeNull();
    // A site-scoped finding names no page, path or element.
    expect(container.querySelector('.audit-subject')).toBeNull();
    expect(container.querySelector('.audit-finding')).not.toBeNull();
  });
});

describe('AuditReportScreen — a successful export', () => {
  it('reports nothing when the file was handed off', async () => {
    vi.mocked(exportReport).mockResolvedValue({ saved: true });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.export }));
    await waitFor(() => {
      expect(exportReport).toHaveBeenCalled();
    });
    // Success is silent: the share sheet already told the person what happened.
    expect(screen.queryByText(messagesEn.audit.exportUnavailable)).toBeNull();

    const [filename, html] = vi.mocked(exportReport).mock.calls[0]!;
    expect(filename).toMatch(/^movar-audit-example-com-.*\.html$/u);
    // The artifact carries its own evidence — report and proof stay together.
    expect(html).toContain('movar-audit-bundle');
  });

  it('says exporting needs the app when the bridge answers nothing', async () => {
    vi.mocked(exportReport).mockResolvedValue(void 0);
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.export }));
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.exportUnavailable)).toBeDefined();
    });
  });
});

describe('AuditReportScreen — filtering the coverage list', () => {
  it('offers a pill per verdict the report actually produced, with counts', () => {
    const { container } = renderScreen();
    const pills = [...container.querySelectorAll('.audit-filter')].map((p) => p.textContent);

    expect(pills[0]).toContain(messagesEn.audit.filterAll);
    // No dead controls: a verdict this report never produced gets no pill,
    // because an empty filter is a button that does nothing.
    const total = container.querySelectorAll('.audit-rule').length;
    expect(pills[0]).toContain(String(total));
    expect(pills.length).toBeGreaterThan(1);
    expect(pills.some((p) => p.includes(messagesEn.audit.verdicts['not-collected']))).toBe(true);
  });

  it('narrows the list to one verdict, and back', () => {
    const { container } = renderScreen();
    const all = container.querySelectorAll('.audit-rule').length;

    const unchecked = [...container.querySelectorAll('.audit-filter')].find((p) =>
      p.textContent.includes(messagesEn.audit.verdicts['not-collected']),
    );
    fireEvent.click(unchecked!);

    const rows = [...container.querySelectorAll('.audit-rule')];
    expect(rows.length).toBeLessThan(all);
    expect(rows.every((row) => row.className.includes('is-not-collected'))).toBe(true);
    expect(unchecked?.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(container.querySelector('.audit-filter')!);
    expect(container.querySelectorAll('.audit-rule').length).toBe(all);
  });

  it('orders the pills worst-first, with "not checked" ahead of passed', () => {
    // A filter bar that ranked "could not check" below "passed" would present
    // the audit's own blind spots as the least interesting outcome.
    const { container } = renderScreen();
    const labels = [...container.querySelectorAll('.audit-filter')].map((p) => p.textContent);
    const at = (word: string): number => labels.findIndex((l) => l.includes(word));
    expect(at(messagesEn.audit.verdicts['not-collected'])).toBeLessThan(
      at(messagesEn.audit.verdicts.pass),
    );
    expect(at(messagesEn.audit.verdicts.pass)).toBeLessThan(
      at(messagesEn.audit.verdicts['not-applicable']),
    );
  });
});
