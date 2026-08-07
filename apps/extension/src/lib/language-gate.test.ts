import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import type { Picker } from '@movar/lang-pickers/types';
import { trySatisfyLanguageGate } from './language-gate';
import type { LanguageGateDeps } from './language-gate';

/** `LanguageGateDeps` with its callable members re-typed as Vitest mocks — same
 *  reason as `language-switch.test.ts`'s `MockedDeps`: method-signature syntax
 *  makes `expect(deps.record)` trip `unbound-method`. */
type MockedDeps = {
  [K in keyof LanguageGateDeps]: Mock<LanguageGateDeps[K]>;
};

function makeDeps(over: Partial<MockedDeps> = {}): MockedDeps {
  return {
    hasUserInteracted: vi.fn(() => false),
    isSatisfied: vi.fn(() => false),
    markSatisfied: vi.fn(() => true),
    sessionChoice: vi.fn(() => null),
    setSimulatedClick: vi.fn(),
    record: vi.fn(async () => {}),
    ...over,
  };
}

const settings: MovarSettings = { ...defaultSettings, priority: ['uk', 'en'], blocked: ['ru'] };

/** jsdom has no layout, so the gate's geometry test needs a stubbed rect. */
function stubFullViewport(el: Element): void {
  const { innerWidth: width, innerHeight: height } = globalThis;
  el.getBoundingClientRect = (): DOMRect =>
    ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }) as DOMRect;
}

/**
 * The tradeport.ua gate: a fixed full-viewport backdrop over an already-Ukrainian
 * page, offering «Українська» (whose href is the current URL — it is a pure
 * cookie-setter) and «Русский».
 */
function setupGate(): { pickers: Picker[]; uk: HTMLAnchorElement; ru: HTMLAnchorElement } {
  document.body.innerHTML = `
    <div id="backdrop" style="position:fixed;inset:0;z-index:99999;">
      <div>
        <p>Оберіть мову / Выберите язык</p>
        <p>
          <a id="uk" href="${location.href}" class="btn">Українська</a>
          <a id="ru" href="https://shop.example/thing" class="btn">Русский</a>
        </p>
      </div>
    </div>
  `;
  const backdrop = document.querySelector('#backdrop');
  if (backdrop) stubFullViewport(backdrop);
  const uk = document.querySelector<HTMLAnchorElement>('#uk');
  const ru = document.querySelector<HTMLAnchorElement>('#ru');
  if (!uk || !ru) throw new Error('fixture did not render');
  // Anchors navigate on click in a real browser; jsdom logs a "not implemented"
  // error instead. Neutralise the default so the tests assert the dispatch.
  for (const a of [uk, ru])
    a.addEventListener('click', (e) => {
      e.preventDefault();
    });
  return { pickers: findLanguagePickers(), uk, ru };
}

/** An ordinary in-flow footer switcher — same languages, no overlay. */
function setupPlainPicker(): Picker[] {
  document.body.innerHTML = `
    <footer>
      <a href="/ua/x" hreflang="uk">Українська</a>
      <a href="/x" hreflang="ru">Русский</a>
    </footer>
  `;
  return findLanguagePickers();
}

describe('trySatisfyLanguageGate', () => {
  it('clicks the preferred option in a blocking gate', async () => {
    const { pickers, uk } = setupGate();
    const clicked = vi.fn();
    uk.addEventListener('click', clicked);
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, pickers, settings)).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('logs the correction as blocked → preferred', async () => {
    const { pickers } = setupGate();
    const deps = makeDeps();

    await trySatisfyLanguageGate(deps, pickers, settings);
    expect(deps.record).toHaveBeenCalledWith('ru', 'uk');
  });

  it('flags the click as Movar-driven so it is not logged as a user choice', async () => {
    const { pickers, uk } = setupGate();
    const deps = makeDeps();
    const flagDuringClick: boolean[] = [];
    deps.setSimulatedClick.mockImplementation((active: boolean) => {
      flagDuringClick.push(active);
    });
    uk.addEventListener('click', () => {
      // The flag must be up at dispatch time, not merely toggled around it.
      expect(flagDuringClick.at(-1)).toBe(true);
    });

    await trySatisfyLanguageGate(deps, pickers, settings);
    expect(flagDuringClick).toEqual([true, false]);
  });

  it('leaves an ordinary in-flow picker alone', async () => {
    const pickers = setupPlainPicker();
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, pickers, settings)).toBe(false);
    expect(deps.markSatisfied).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('does not activate a collapsed dropdown toggle — that would just open the menu', async () => {
    // The regression this pass introduced: a `.btn-group` switcher (tradeport,
    // yato) inside a full-viewport fixed box, on a page ALREADY serving the
    // preferred language. The toggle wears the current language, so it is the
    // picker's only `uk` entry — and clicking it pops the menu open in the
    // visitor's face instead of switching anything. `pickRedirectTarget` now
    // refuses disclosure controls, so the gate finds nothing to satisfy.
    document.body.innerHTML = `
      <div id="backdrop" style="position:fixed;inset:0;">
        <div class="btn-group">
          <button id="toggle" class="dropdown-toggle" data-toggle="dropdown" data-lang="uk">УКР</button>
          <ul class="dropdown-menu">
            <li><a id="ru" href="https://shop.example/thing" data-lang="ru">Русский</a></li>
          </ul>
        </div>
      </div>
    `;
    const backdrop = document.querySelector('#backdrop');
    if (backdrop) stubFullViewport(backdrop);
    const clicked = vi.fn();
    document.querySelector('#toggle')?.addEventListener('click', clicked);
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, findLanguagePickers(), settings)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
    expect(deps.markSatisfied).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('does nothing for a full-size overlay parked off-canvas (a closed drawer)', async () => {
    // Same shape as the gate, but the box sits outside the viewport — a mobile
    // nav drawer at rest. It blocks nothing, so it is not a gate.
    const { innerWidth: width, innerHeight: height } = globalThis;
    document.body.innerHTML = `
      <div id="drawer" style="position:fixed;top:0;left:0;">
        <a id="uk" href="https://shop.example/ua/thing">Українська</a>
        <a id="ru" href="https://shop.example/thing">Русский</a>
      </div>
    `;
    const drawer = document.querySelector('#drawer');
    if (drawer)
      drawer.getBoundingClientRect = (): DOMRect =>
        ({
          x: -width,
          y: 0,
          top: 0,
          left: -width,
          right: 0,
          bottom: height,
          width,
          height,
        }) as DOMRect;
    const clicked = vi.fn();
    document.querySelector('#uk')?.addEventListener('click', clicked);
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, findLanguagePickers(), settings)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
    expect(deps.markSatisfied).not.toHaveBeenCalled();
  });

  it('does nothing once the visitor has interacted with the page', async () => {
    const { pickers, uk } = setupGate();
    const clicked = vi.fn();
    uk.addEventListener('click', clicked);
    const deps = makeDeps({ hasUserInteracted: vi.fn(() => true) });

    expect(await trySatisfyLanguageGate(deps, pickers, settings)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('does nothing when a gate on this host was already satisfied', async () => {
    const { pickers } = setupGate();
    const deps = makeDeps({ isSatisfied: vi.fn(() => true) });

    expect(await trySatisfyLanguageGate(deps, pickers, settings)).toBe(false);
    expect(deps.markSatisfied).not.toHaveBeenCalled();
  });

  it('does nothing when the visitor already picked a language on this host', async () => {
    const { pickers } = setupGate();
    const deps = makeDeps({ sessionChoice: vi.fn(() => 'ru') });

    expect(await trySatisfyLanguageGate(deps, pickers, settings)).toBe(false);
    expect(deps.markSatisfied).not.toHaveBeenCalled();
  });

  it('refuses to click when the latch could not be persisted', async () => {
    const { pickers, uk } = setupGate();
    const clicked = vi.fn();
    uk.addEventListener('click', clicked);
    const deps = makeDeps({ markSatisfied: vi.fn(() => false) });

    expect(await trySatisfyLanguageGate(deps, pickers, settings)).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('latches before dispatching, since the click can navigate synchronously', async () => {
    const { pickers, uk } = setupGate();
    const order: string[] = [];
    const deps = makeDeps({
      markSatisfied: vi.fn(() => {
        order.push('latch');
        return true;
      }),
    });
    uk.addEventListener('click', () => order.push('click'));

    await trySatisfyLanguageGate(deps, pickers, settings);
    expect(order).toEqual(['latch', 'click']);
  });

  it('ignores a gate that offers no blocked language', async () => {
    document.body.innerHTML = `
      <div id="backdrop" style="position:fixed;inset:0;">
        <a href="/uk/x" hreflang="uk">Українська</a>
        <a href="/en/x" hreflang="en">English</a>
      </div>
    `;
    const backdrop = document.querySelector('#backdrop');
    if (backdrop) stubFullViewport(backdrop);
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, findLanguagePickers(), settings)).toBe(false);
    expect(deps.markSatisfied).not.toHaveBeenCalled();
  });

  it('ignores a gate that offers no preferred language', async () => {
    document.body.innerHTML = `
      <div id="backdrop" style="position:fixed;inset:0;">
        <a href="/ru/x" hreflang="ru">Русский</a>
        <a href="/kk/x" hreflang="kk">Қазақша</a>
      </div>
    `;
    const backdrop = document.querySelector('#backdrop');
    if (backdrop) stubFullViewport(backdrop);
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, findLanguagePickers(), settings)).toBe(false);
    expect(deps.markSatisfied).not.toHaveBeenCalled();
  });

  it('is a no-op when the page has no pickers at all', async () => {
    const deps = makeDeps();
    expect(await trySatisfyLanguageGate(deps, [], settings)).toBe(false);
    expect(deps.hasUserInteracted).not.toHaveBeenCalled();
  });
});

describe('trySatisfyLanguageGate — tradeport.ua capture (movar#354)', () => {
  const FIXTURE = path.resolve(
    __dirname,
    '../../../../packages/page-content/fixtures/pickers/tradeport-lang-gate.fixture.html',
  );

  /** Mount the real capture: an already-Ukrainian page carrying BOTH a
   *  full-viewport gate modal and an ordinary header switcher. Only the modal's
   *  backdrop gets a real rect — the header dropdown is in flow. */
  function mountCapture(): { pickers: Picker[]; clicks: string[] } {
    document.documentElement.innerHTML = readFileSync(FIXTURE, 'utf8')
      .replace(/<!doctype[^>]*>/i, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?html[^>]*>/gi, '');
    const backdrop = document.querySelector('#tp-lang-modal');
    if (backdrop) stubFullViewport(backdrop);

    const clicks: string[] = [];
    for (const a of document.querySelectorAll('a[href]')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        clicks.push(a.textContent.trim());
      });
    }
    return { pickers: findLanguagePickers(), clicks };
  }

  it('finds both pickers but activates only the gate', async () => {
    const { pickers, clicks } = mountCapture();
    // The header switcher and the modal both classify — the gate check is what
    // has to tell them apart.
    expect(pickers).toHaveLength(2);

    expect(await trySatisfyLanguageGate(makeDeps(), pickers, settings)).toBe(true);
    expect(clicks).toEqual(['Українська']);
  });

  it('leaves the page alone when only the header switcher is present', async () => {
    const { clicks } = mountCapture();
    document.querySelector('#tp-lang-modal')?.remove();
    const deps = makeDeps();

    expect(await trySatisfyLanguageGate(deps, findLanguagePickers(), settings)).toBe(false);
    expect(clicks).toEqual([]);
    expect(deps.markSatisfied).not.toHaveBeenCalled();
  });
});
