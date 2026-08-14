import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CORE_RULESET, evaluate } from '@movar/audit';
import type { Evidence } from '@movar/audit';
import { messagesEn } from '../i18n/messages-en';
import { messagesUk } from '../i18n/messages-uk';
import { exportReport } from '../bridge';
import { AuditReportScreen, artifactFilename, subjectOf } from './AuditReport';

vi.mock('../bridge', () => ({ exportReport: vi.fn() }));

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

    const jump = indexed?.querySelector('button');
    const target = container.querySelector('.audit-finding');
    const scrollIntoView = vi.fn();
    // jsdom implements no layout, so the method does not exist to spy on.
    Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView, writable: true });
    vi.spyOn(document, 'getElementById').mockReturnValue(target as HTMLElement);

    fireEvent.click(jump!);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('leaves rows with no findings inert — nothing to navigate to', () => {
    const { container } = renderScreen();
    const plain = [...container.querySelectorAll('.audit-rule')].filter(
      (row) => !row.className.includes('has-findings'),
    );
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.every((row) => row.querySelector('button') === null)).toBe(true);
  });

  it('renders rule titles in Ukrainian without touching the kernel', () => {
    const { container } = renderScreen({ messages: messagesUk, locale: 'uk' });
    // The kernel still emits English; only the display layer is localized, and
    // each finding keeps the kernel's exact sentence in its Details.
    expect(container.textContent).toContain('Яка мова завантажується');
    expect(container.textContent).toContain(messagesUk.audit.detailFinding);
  });
});

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
