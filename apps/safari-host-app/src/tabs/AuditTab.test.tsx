import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { messagesEn } from '../i18n/messages-en';
import type { ProbeReply, ProbeRequest } from '../bridge';
import { AuditTab, normalizeAuditUrl, subjectOf } from './AuditTab';

afterEach(() => {
  cleanup();
});

describe('normalizeAuditUrl', () => {
  it('assumes https for a bare host, because that is what people paste', () => {
    expect(normalizeAuditUrl('example.com')).toBe('https://example.com/');
    expect(normalizeAuditUrl('  example.com/uk/  ')).toBe('https://example.com/uk/');
  });

  it('keeps an explicit scheme, including plain http', () => {
    // An http → https upgrade is itself part of a redirect chain a finding may
    // rest on, so it is not silently rewritten.
    expect(normalizeAuditUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeAuditUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
  });

  it('refuses anything that is not a web address', () => {
    // `file:` and custom app schemes must never reach the native prober, and
    // empty input must not become a probe of "https://".
    expect(normalizeAuditUrl('')).toBeNull();
    expect(normalizeAuditUrl('   ')).toBeNull();
    expect(normalizeAuditUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeAuditUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAuditUrl('mailto:someone@example.com')).toBeNull();
  });
});

describe('AuditTab', () => {
  it('renders the composer and the network-posture promises', () => {
    render(<AuditTab messages={messagesEn} />);

    expect(screen.getByRole('button', { name: messagesEn.audit.run })).toBeDefined();
    // The jurisdiction pack is a CHOICE, and starts unmade: applying one
    // country's statute to another country's site would be a false accusation.
    const pack = screen.getByRole('checkbox', { name: new RegExp(messagesEn.audit.uaPack, 'u') });
    expect((pack as HTMLInputElement).checked).toBe(false);

    for (const promise of messagesEn.audit.privacy.items) {
      expect(screen.getByText(promise)).toBeDefined();
    }
  });

  it('starts with no result showing', () => {
    const { container } = render(<AuditTab messages={messagesEn} />);
    expect(container.querySelector('.audit-result')?.hasAttribute('hidden')).toBe(true);
  });
});

/**
 * A page that breaks several promises at once: it declares Ukrainian, serves
 * Russian body text, publishes a relative `hreflang` with no self-reference or
 * `x-default`, and offers a switcher whose entries navigate nowhere. Chosen so
 * the report renders every shape it can render — failures, warnings, citations,
 * a downgraded finding, and subjects with and without a node path.
 */
const MIXED = `<!doctype html><html lang="uk"><head>
    <link rel="alternate" hreflang="ru" href="/ru/">
    <link rel="alternate" hreflang="de" href="https://de.example.com/">
  </head><body>
    <nav class="lang"><a href="#">UKR</a><a href="#">RU</a></nav>
    <main><p>Добро пожаловать на наш сайт, здесь очень много интересного текста для классификатора.</p></main>
  </body></html>`;

/** A probe port that always answers the same way. */
function probeReturning(reply: ProbeReply | undefined) {
  return vi
    .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
    .mockResolvedValue(reply);
}

/** A plain single-language page: nothing declared that it fails to honour. */
const CLEAN = `<!doctype html><html lang="uk"><body>
    <main><p>Вітаємо на нашому сайті, тут багато цікавого українського тексту.</p></main>
  </body></html>`;

function replyWith(body: string): ProbeReply {
  return {
    status: 200,
    outcome: 'ok',
    responseHeaders: { 'content-type': 'text/html' },
    redirectChain: [],
    finalUrl: 'https://example.com/',
    bodyHash: 'stable-hash',
    body,
    cookieState: 'cold',
  };
}

describe('AuditTab — running an audit', () => {
  it('renders a report: the headline count and what could not be checked', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    // The headline is a COUNT of broken promises, never a score or a grade.
    await waitFor(() => {
      expect(container.querySelector('.result-verdict')?.textContent).toMatch(
        /broken promise|No broken promises/u,
      );
    });
    // Coverage sits beside it, so "0 broken promises" can never be read without
    // "…and N checks could not run" — `not-collected` is never a pass.
    expect(screen.getByText(/checks ran/u)).toBeDefined();
    expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
  });

  it('says the bridge is missing rather than blaming the site', async () => {
    // Outside the app there is no native prober. That is a fact about the app,
    // and reporting it as a site failure would publish a false observation.
    render(<AuditTab messages={messagesEn} probe={probeReturning(void 0)} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.noBridge)).toBeDefined();
    });
  });

  it('rejects an unusable address without probing anything', async () => {
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} probe={probe} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'file:///etc/passwd' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.invalidUrl)).toBeDefined();
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('shows observations separately, and never counts them as broken promises', async () => {
    // `core/content-language-mixed` — Russian body text under a `uk`
    // declaration — is exactly what a reader came to see, and it is an
    // observation precisely BECAUSE a classifier answered. Hiding it would be
    // worse than not running the rule; scoring it would be a false accusation.
    const { container } = render(
      <AuditTab messages={messagesEn} probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.observations)).toBeDefined();
    });
    expect(screen.getByText(messagesEn.audit.observationsNote)).toBeDefined();

    const ids = [...container.querySelectorAll('.audit-finding .result-code')].map(
      (n) => n.textContent,
    );
    expect(ids).toContain('core/content-language-mixed');
    // Scored failures are the headline; the observation is not among them.
    expect(container.querySelector('.audit-finding.is-fail')).not.toBeNull();
    expect(container.querySelector('.result-verdict')?.textContent).toMatch(/broken promises/u);
  });

  it('marks a downgraded finding as not counting, rather than softening it', async () => {
    // `core/lang-part-unmarked` is graded `fail` in the catalogue but can only
    // ever answer via the classifier, so the kernel strips its failing power.
    // The report says so on its face.
    const { container } = render(
      <AuditTab messages={messagesEn} probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.observations)).toBeDefined();
    });
    expect(container.textContent).toContain(messagesEn.audit.downgraded);
    // Findings carry the element they are about, so a reader can go look.
    expect(container.querySelector('.audit-subject')?.textContent).toContain('https://');
  });

  it('shows a statute citation on a jurisdiction-pack finding', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(container.querySelector('.audit-citation')).not.toBeNull();
    });
    // A legal claim must name the law it rests on.
    expect(container.querySelector('.audit-citation')?.textContent).toMatch(/2704/u);
  });

  it('applies the Ukrainian pack only when the operator asks for it', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} probe={probeReturning(replyWith(MIXED))} />,
    );
    const rules = (): string[] =>
      [...container.querySelectorAll('.audit-rule .result-code')].map((n) => n.textContent);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    // Off by default: no statute rule may appear.
    expect(rules().some((id) => id.startsWith('ua/'))).toBe(false);
    const coreCount = rules().length;

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    await waitFor(() => {
      expect(rules().length).toBeGreaterThan(coreCount);
    });
    expect(rules().some((id) => id.startsWith('ua/'))).toBe(true);
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
    // Filesystem evidence carries a build path and no URL.
    expect(subjectOf({ ...base, subject: { path: '/uk/index.html', node: 'html' } })).toBe(
      '/uk/index.html',
    );
    expect(subjectOf({ ...base, subject: { node: 'html > body > nav' } })).toBe(
      'html > body > nav',
    );
  });

  it('has nothing to point at for a whole-site finding', () => {
    expect(subjectOf({ ...base, scope: 'site', subject: {} })).toBeUndefined();
  });
});

describe('AuditTab — the paths that are not the happy one', () => {
  it('runs on Enter, so the keyboard alone is enough', async () => {
    const probe = probeReturning(replyWith(CLEAN));
    render(<AuditTab messages={messagesEn} probe={probe} />);

    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'example.com' } });
    fireEvent.keyDown(box, { key: 'a' });
    expect(probe).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => {
      expect(probe).toHaveBeenCalled();
    });
  });

  it('reports a clean site as no broken promises, without claiming full coverage', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} probe={probeReturning(replyWith(CLEAN))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(container.querySelector('.result-verdict')?.textContent).toBe(
        messagesEn.audit.noBrokenPromises,
      );
    });
    // "No broken promises" must never be readable as "everything checks out":
    // the checks that could not run are stated right beside it.
    expect(container.querySelector('.badge')?.className).toContain('is-accent');
    expect(screen.getByText(messagesEn.audit.notCollectedNote)).toBeDefined();
    expect(screen.getByText(messagesEn.audit.nothingToReport)).toBeDefined();
  });

  it('falls back to the native bridge when no port is injected', async () => {
    // No `probe` prop and no WebView: the production default path.
    render(<AuditTab messages={messagesEn} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.noBridge)).toBeDefined();
    });
  });

  it('says the audit failed — not that the site did — when the probe throws', async () => {
    const probe = vi
      .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
      .mockRejectedValue(new Error('boom'));
    render(<AuditTab messages={messagesEn} probe={probe} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.failed)).toBeDefined();
    });
  });
});
