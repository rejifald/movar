import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { messagesEn } from '../i18n/messages-en';
import type { ProbeReply, ProbeRequest } from '../bridge';
import { AuditTab, normalizeAuditUrl } from './AuditTab';

// jsdom implements no layout, so `scrollIntoView` does not exist on elements.
// The composer calls it to bring the outbound-request acknowledgement into
// view; stubbed here rather than guarded in the component, which would be
// defensive code against a method every real browser has.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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
    render(<AuditTab messages={messagesEn} locale="en" />);

    expect(screen.getByRole('button', { name: messagesEn.audit.run })).toBeDefined();
    // The jurisdiction pack is a CHOICE, and starts unmade: applying one
    // country's statute to another country's site would be a false accusation.
    const pack = screen.getByRole('checkbox', { name: new RegExp(messagesEn.audit.uaPack, 'u') });
    expect((pack as HTMLInputElement).checked).toBe(false);

    for (const promise of messagesEn.audit.privacy.items) {
      expect(screen.getByText(promise)).toBeDefined();
    }
  });

  it('says what Movar Audit is, before anyone points it at a company', () => {
    // The tab used to open on a URL box alone, which asked someone to aim a
    // tool at a site without ever saying what it would then assert about it.
    render(<AuditTab messages={messagesEn} locale="en" />);

    expect(screen.getByRole('heading', { name: messagesEn.audit.about.title })).toBeDefined();
    expect(screen.getByText(messagesEn.audit.about.body)).toBeDefined();
    for (const point of messagesEn.audit.about.points) {
      expect(screen.getByText(point)).toBeDefined();
    }
  });

  it('starts on the composer, with no report and nothing to go back to', () => {
    const { container } = render(<AuditTab messages={messagesEn} locale="en" />);
    // The report is a separate screen now — none exists until an audit has run.
    expect(container.querySelector('.audit-result')).toBeNull();
    expect(screen.queryByRole('button', { name: messagesEn.audit.back })).toBeNull();
    expect(screen.queryByText(messagesEn.audit.previous)).toBeNull();
  });

  it("starts on Movar's own site, so there is nothing to type to try it", () => {
    render(<AuditTab messages={messagesEn} locale="en" />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('https://movar.fyi');
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

/**
 * Press the composer's button and then press through the outbound-request
 * acknowledgement, which the tab asks for once per session.
 *
 * Every test below is about what happens AFTER a run starts, so each would
 * otherwise restate the same two clicks. The gate has its own tests further
 * down — those press the pieces individually on purpose.
 */
function startAudit(): void {
  fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
  pressThrough();
}

/** Accept the acknowledgement if this session has not already. */
function pressThrough(): void {
  const proceed = screen.queryByRole('button', { name: messagesEn.audit.confirm.proceed });
  if (proceed !== null) fireEvent.click(proceed);
}

/**
 * The control that OPENS one previous audit, told apart from the one that
 * removes it.
 *
 * Both name the same target — the remove control has to, or every row's would
 * read "Remove" — so a bare `/example\.com/` matches two buttons. The open
 * control's accessible name is its own text, which STARTS with the target as
 * DISPLAYED (no scheme, no trailing slash); the remove control's starts with
 * "Remove".
 */
function openControlFor(target: string): HTMLElement {
  return screen.getByRole('button', {
    name: new RegExp(`^${target.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}`, 'u'),
  });
}

describe('AuditTab — the outbound-request acknowledgement', () => {
  it('probes nothing until the person has pressed through it', () => {
    // Movar's promise everywhere else is that nothing leaves the browser. This
    // one feature is the exception, so the first request of a session may not
    // go out on a button press alone.
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    expect(probe).not.toHaveBeenCalled();
    expect(screen.getByText(messagesEn.audit.confirm.title)).toBeDefined();
    // It names the host actually about to be contacted — as the screen's own
    // title, so what is about to be requested is the biggest thing on it.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('movar.fyi');
    for (const point of messagesEn.audit.confirm.points) {
      expect(screen.getByText(point)).toBeDefined();
    }
  });

  it('sends nothing when it is declined', () => {
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.confirm.cancel }));

    expect(probe).not.toHaveBeenCalled();
    expect(screen.queryByText(messagesEn.audit.confirm.title)).toBeNull();
    // Back to a composer that can be used, not a dead end.
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: messagesEn.audit.run }).disabled,
    ).toBe(false);
  });

  it('asks once a session, not once an audit', async () => {
    // A confirmation on every run is a reflex, not consent — and this is a tool
    // for producing reports across many sites in one sitting.
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    startAudit();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: messagesEn.audit.back })).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'other.example' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    expect(screen.queryByText(messagesEn.audit.confirm.title)).toBeNull();
    await waitFor(() => {
      expect(probe.mock.calls.some(([request]) => request.url.includes('other.example'))).toBe(
        true,
      );
    });
  });

  it('names a target it cannot parse, rather than blanking the screen', () => {
    // `normalizeAuditUrl` has already accepted it, so this is belt-and-braces —
    // but the acknowledgement's whole job is naming what is about to be
    // contacted, and it may never render an empty heading.
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'http://[::1]:8080/x' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe('');
  });

  it('asks about the address it is actually going to request', async () => {
    // The acknowledgement carries the normalized target rather than re-reading
    // the box, so what it named is what goes out.
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'shop.example.ua/uk/' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.run }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('shop.example.ua');

    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.confirm.proceed }));
    await waitFor(() => {
      expect(probe).toHaveBeenCalled();
    });
    expect(probe.mock.calls[0]?.[0].url).toBe('https://shop.example.ua/uk/');
  });
});

describe('AuditTab — running an audit', () => {
  it('renders a report: the headline count and what could not be checked', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    // The headline is a COUNT of broken promises, never a score or a grade.
    await waitFor(() => {
      expect(container.querySelector('.audit-verdict-count')?.textContent).toMatch(
        /broken promise|No broken promises/u,
      );
    });
    // Coverage sits beside it, so "0 broken promises" can never be read without
    // "…and N rules could not run" — `not-collected` is never a pass.
    expect(screen.getByText(/rules ran/u)).toBeDefined();
    expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
  });

  it('says the bridge is missing rather than blaming the site', async () => {
    // Outside the app there is no native prober. That is a fact about the app,
    // and reporting it as a site failure would publish a false observation.
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(void 0)} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.noBridge)).toBeDefined();
    });
  });

  it('rejects an unusable address without probing anything', async () => {
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'file:///etc/passwd' } });
    startAudit();

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
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

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
    expect(container.querySelector('.audit-verdict-count')?.textContent).toMatch(
      /broken promises/u,
    );
  });

  it('counts the matrix legs off while they are in flight', async () => {
    // A matrix is several real requests, each of which may walk a redirect
    // chain — a run can legitimately take minutes. A button label that only
    // swapped to "Auditing…" left no way to tell a slow site from a wedged app.
    const gates: (() => void)[] = [];
    const probe = vi.fn(
      async () =>
        new Promise<ProbeReply>((resolve) => {
          gates.push(() => {
            resolve(replyWith(MIXED));
          });
        }),
    );
    const { container } = render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);
    startAudit();

    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    const total = Number(bar.getAttribute('aria-valuemax'));
    expect(total).toBeGreaterThan(1);

    // Settle one leg: the count moves, and it says so in words as well as in a
    // bar — the label is the part a screen reader and a glance both get.
    gates[0]?.();
    await waitFor(() => {
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    });
    expect(container.querySelector('.audit-progress-label')?.textContent).toBe(
      messagesEn.audit.progress(1, total),
    );

    // The legs are sequential, so each one settling is what starts the next —
    // its gate does not exist until then.
    for (let leg = 1; leg < total; leg += 1) {
      await waitFor(() => {
        expect(gates.length).toBeGreaterThan(leg);
      });
      gates[leg]?.();
    }
    // The bar belongs to the run, not to the screen: it goes when the report
    // arrives rather than sitting at 100%.
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });
  });

  it('marks a downgraded finding as not counting, rather than softening it', async () => {
    // `core/lang-part-unmarked` drafts `fail` but can only ever answer via the
    // classifier, so the kernel strips its failing power — which is why the
    // catalogue grades it `warn` / `observation`. The report says so on its face.
    const { container } = render(
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.observations)).toBeDefined();
    });
    expect(container.textContent).toContain(messagesEn.audit.downgraded);
    // Findings carry the element they are about, so a reader can go look.
    expect(container.querySelector('.audit-subject')?.textContent).toContain('https://');
  });

  it('shows a statute citation on a jurisdiction-pack finding', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    await waitFor(() => {
      expect(container.querySelector('.audit-citation')).not.toBeNull();
    });
    // A legal claim must name the law it rests on.
    expect(container.querySelector('.audit-citation')?.textContent).toMatch(/2704/u);
  });

  it('applies the Ukrainian pack only when the operator asks for it', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />,
    );
    // The coverage list no longer repeats each rule's ID — that moved into the
    // finding's own Details — so the pack is detected by the statute rule's
    // title appearing, and by the catalogue growing.
    const rows = (): number => container.querySelectorAll('.audit-rule').length;
    const hasStatuteRule = (): boolean => container.textContent.includes('Ukrainian market');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    // Off by default: no statute rule may appear.
    expect(hasStatuteRule()).toBe(false);
    const coreCount = rows();

    // Running opens the report, so the pack toggle is a screen away now.
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));
    fireEvent.click(screen.getByRole('checkbox'));
    startAudit();
    await waitFor(() => {
      expect(rows()).toBeGreaterThan(coreCount);
    });
    expect(hasStatuteRule()).toBe(true);
  });
});

describe('AuditTab — the paths that are not the happy one', () => {
  it('runs on Enter, so the keyboard alone is enough', async () => {
    const probe = probeReturning(replyWith(CLEAN));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'example.com' } });
    fireEvent.keyDown(box, { key: 'a' });
    expect(probe).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter' });
    pressThrough();
    await waitFor(() => {
      expect(probe).toHaveBeenCalled();
    });
  });

  it('reports a clean site as no broken promises, without claiming full coverage', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(CLEAN))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    await waitFor(() => {
      expect(container.querySelector('.audit-verdict-count')?.textContent).toBe(
        messagesEn.audit.noBrokenPromises,
      );
    });
    // "No broken promises" must never be readable as "everything checks out":
    // the rules that could not run are stated right beside it, inside the same
    // panel — which is why the panel, not a loose badge, carries the state.
    expect(container.querySelector('.result-head')?.className).toContain('is-clear');
    expect(container.querySelector('.audit-coverage')?.textContent).toContain('not checked');
    expect(screen.getByText(messagesEn.audit.notCollectedNote)).toBeDefined();
    // And it says it ONCE. A second "nothing was found" line under the matrix
    // restated the panel above it — and contradicted the observations section
    // below whenever a clean report still had something to observe. With no
    // failures the whole section is simply absent, which is what an absence
    // looks like.
    expect(screen.queryByText(messagesEn.audit.findings)).toBeNull();
  });

  it('falls back to the native bridge when no port is injected', async () => {
    // No `probe` prop and no WebView: the production default path.
    render(<AuditTab messages={messagesEn} locale="en" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.noBridge)).toBeDefined();
    });
  });

  it('says the audit failed — not that the site did — when the probe throws', async () => {
    const probe = vi
      .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
      .mockRejectedValue(new Error('boom'));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.failed)).toBeDefined();
    });
  });
});

describe('AuditTab — the report is its own screen', () => {
  it('opens the report on completion and comes back to the composer', async () => {
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();

    // The report replaces the composer rather than appearing under it.
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));
    expect(screen.getByRole('textbox')).toBeDefined();
    expect(screen.queryByText(messagesEn.audit.allRules)).toBeNull();
  });

  it('lists a finished audit and reopens it without probing again', async () => {
    const probe = probeReturning(replyWith(MIXED));
    render(<AuditTab messages={messagesEn} locale="en" probe={probe} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));

    // The row leads with the headline, so the list is readable without opening
    // every entry, and carries the target it was run against.
    expect(screen.getByText(messagesEn.audit.previous)).toBeDefined();
    const row = openControlFor('example.com');
    expect(row.textContent).toMatch(/broken promise/u);

    const before = probe.mock.calls.length;
    fireEvent.click(row);
    // Reopening reads the stored report — it must not re-probe the site.
    expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    expect(probe.mock.calls.length).toBe(before);
  });

  it('shows a clean run in the list without a failure mark', async () => {
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(CLEAN))} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));

    const row = openControlFor('example.com');
    expect(row.textContent).toContain(messagesEn.audit.noBrokenPromises);
    // The mark lives on the `<li>` frame, which is what the remove control sits
    // inside — asserting on the open button alone would pass vacuously.
    expect(row.closest('.audit-run-row')?.className).not.toContain('is-fail');
  });

  it('keeps each run, newest first, so a re-audit does not erase the last one', async () => {
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />);

    for (const host of ['one.example', 'two.example']) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: host } });
      startAudit();
      await waitFor(() => {
        expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));
    }

    // Shown the way a person would type it: no scheme, no trailing slash. The
    // exact normalized URL is still what gets probed and exported.
    const targets = [...document.querySelectorAll('.audit-run-target')].map((n) => n.textContent);
    expect(targets).toEqual(['two.example', 'one.example']);
  });

  it('keeps a path on a prettified target, dropping only scheme and trailing slash', async () => {
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'shop.example.ua/uk/' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));

    expect(document.querySelector('.audit-run-target')?.textContent).toBe('shop.example.ua/uk');
  });

  it('asks before dropping an audit, and drops only that one on confirm', async () => {
    // Confirmed, not immediate: nothing is on disk, which also means there is
    // no copy to restore from — getting the row back costs another full matrix
    // against somebody else's server.
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />);

    for (const host of ['one.example', 'two.example']) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: host } });
      startAudit();
      await waitFor(() => {
        expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));
    }

    fireEvent.click(
      screen.getByRole('button', { name: messagesEn.audit.removeRun('two.example') }),
    );
    // Nothing is gone yet — the row is asking.
    expect(screen.getByText(messagesEn.audit.removeConfirm.question)).toBeDefined();
    expect(document.querySelectorAll('.audit-run-row')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.removeConfirm.confirm }));
    const targets = [...document.querySelectorAll('.audit-run-target')].map((n) => n.textContent);
    expect(targets).toEqual(['one.example']);
  });

  it('keeps the audit when the removal is cancelled', async () => {
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'only.example' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));

    fireEvent.click(
      screen.getByRole('button', { name: messagesEn.audit.removeRun('only.example') }),
    );
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.removeConfirm.cancel }));

    expect(screen.queryByText(messagesEn.audit.removeConfirm.question)).toBeNull();
    expect(document.querySelector('.audit-run-target')?.textContent).toBe('only.example');
  });

  it('drops the heading with the last audit, rather than leaving an empty list', async () => {
    render(<AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'only.example' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.back }));

    fireEvent.click(
      screen.getByRole('button', { name: messagesEn.audit.removeRun('only.example') }),
    );
    fireEvent.click(screen.getByRole('button', { name: messagesEn.audit.removeConfirm.confirm }));

    // Including the "this session only" note, which has nothing left to be
    // about once the list it annotates is gone.
    expect(screen.queryByText(messagesEn.audit.previous)).toBeNull();
    expect(screen.queryByText(messagesEn.audit.notStored)).toBeNull();
  });
});

describe('AuditTab — the coverage list', () => {
  it('is always visible, and never buries what could not be checked below a pass', async () => {
    const { container } = render(
      <AuditTab messages={messagesEn} locale="en" probe={probeReturning(replyWith(MIXED))} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    startAudit();
    await waitFor(() => {
      expect(screen.getByText(messagesEn.audit.allRules)).toBeDefined();
    });

    // No disclosure to open: the half of the report that says what was NOT
    // established has to be readable without a deliberate act.
    const rows = [...container.querySelectorAll('.audit-rule')];
    expect(rows.length).toBeGreaterThan(0);
    expect(container.querySelector('.audit-rules')?.closest('details')).toBeNull();

    const order = rows.map((row) => row.className);
    const firstPass = order.findIndex((name) => name.includes('is-pass'));
    const lastUnchecked = order.findLastIndex((name) => name.includes('is-not-collected'));
    // `not-collected` outranks `pass`: an audit admitting it could not establish
    // something must be read before anything it did establish.
    expect(firstPass).toBeGreaterThan(lastUnchecked);

    // And failures lead.
    const lastFail = order.findLastIndex((name) => name.includes('is-fail'));
    expect(lastFail).toBeLessThan(firstPass);
  });
});
