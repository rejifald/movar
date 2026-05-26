import type { LanguageCode } from '@movar/shared';
import { encodedValue, type LangStrategy } from '@movar/rules';
import { normalizeBCP47, normalizeLanguageCode } from './lang-codes';

export interface HreflangLink {
  hreflang: string;
  href: string;
}

/** Pluggable side-effect surface — overridable in tests. */
export interface StrategyContext {
  /** Read the current URL. Tests pass an arbitrary URL. */
  getUrl: () => URL;
  /** Replace the current URL (no history entry). */
  navigate: (url: string) => void;
  /** Reload the current page. */
  reload: () => void;
  /** Read/write document.cookie. */
  getCookie: () => string;
  setCookie: (value: string) => void;
  /** Read/write localStorage. */
  getStorage: (key: string) => string | null;
  setStorage: (key: string, value: string) => void;
  /** Click a DOM element matched by a CSS selector. */
  clickSelector: (selector: string) => boolean;
  /** Collect <link rel="alternate" hreflang="..."> entries from the page. */
  getHreflangLinks: () => HreflangLink[];
}

export const defaultContext: StrategyContext = {
  getUrl: () => new URL(location.href),
  navigate: (url) => {
    location.replace(url);
  },
  reload: () => {
    location.reload();
  },
  getCookie: () => document.cookie,
  setCookie: (value) => {
    document.cookie = value;
  },
  getStorage: (key) => localStorage.getItem(key),
  setStorage: (key, value) => {
    localStorage.setItem(key, value);
  },
  clickSelector: (selector) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    el.click();
    return true;
  },
  getHreflangLinks: () =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')).map(
      (l) => ({ hreflang: l.hreflang, href: l.href }),
    ),
};

export interface StrategyOutcome {
  /** A navigation was triggered (page about to unload). */
  navigated: boolean;
  /** State was written that requires a reload to take effect. */
  needsReload: boolean;
  /** How many concrete steps applied successfully. */
  appliedSteps: number;
}

const EMPTY: StrategyOutcome = { navigated: false, needsReload: false, appliedSteps: 0 };

function buildCookie(
  name: string,
  value: string,
  domain: string | undefined,
  path: string,
): string {
  const oneYear = 365 * 24 * 60 * 60;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `path=${path}`,
    `max-age=${oneYear}`,
    'SameSite=Lax',
  ];
  if (domain) parts.push(`domain=${domain}`);
  return parts.join('; ');
}

function withPathSegment(url: URL, index: number, value: string): URL {
  const next = new URL(url.toString());
  // Split keeps a leading '' from the leading slash, so real-index = index + 1.
  const segs = next.pathname.split('/');
  const realIdx = index + 1;

  const existing = segs[realIdx];
  if (existing !== undefined && existing !== '' && normalizeLanguageCode(existing) !== null) {
    // The slot is already a language code — replace it in place.
    segs[realIdx] = value;
  } else if (realIdx < segs.length) {
    // Slot exists but isn't a language (e.g. a filename) — insert before it.
    segs.splice(realIdx, 0, value);
  } else {
    // Path is shorter than the requested index — pad with empties then append.
    while (segs.length < realIdx) segs.push('');
    segs.push(value);
  }

  next.pathname = segs.join('/');
  return next;
}

function withSubdomain(url: URL, value: string): URL {
  const next = new URL(url.toString());
  const labels = next.hostname.split('.');
  if (labels.length === 0) return next;
  labels[0] = value;
  next.hostname = labels.join('.');
  return next;
}

function withQuery(url: URL, param: string, value: string): URL {
  const next = new URL(url.toString());
  next.searchParams.set(param, value);
  return next;
}

function withSearchParams(url: URL, params: ReadonlyArray<{ name: string; value: string }>): URL {
  const next = new URL(url.toString());
  for (const { name, value } of params) next.searchParams.set(name, value);
  return next;
}

/** Categorize a leaf strategy by its side effect. Compound is flattened. */
function partition(steps: LangStrategy[]): { writes: LangStrategy[]; navigates: LangStrategy[] } {
  const writes: LangStrategy[] = [];
  const navigates: LangStrategy[] = [];
  for (const step of steps) {
    if (step.type === 'compound') {
      const inner = partition(step.steps);
      writes.push(...inner.writes);
      navigates.push(...inner.navigates);
    } else if (step.type === 'cookie' || step.type === 'localStorage') {
      writes.push(step);
    } else {
      navigates.push(step);
    }
  }
  return { writes, navigates };
}

function navigateOrNoop(
  currentUrl: string,
  nextUrl: string,
  ctx: StrategyContext,
): StrategyOutcome {
  if (nextUrl === currentUrl) {
    // Target equals current — navigating would just reload, risking a loop.
    return { navigated: false, needsReload: false, appliedSteps: 0 };
  }
  ctx.navigate(nextUrl);
  return { navigated: true, needsReload: false, appliedSteps: 1 };
}

function applyLeaf(
  strategy: Exclude<LangStrategy, { type: 'compound' }>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  switch (strategy.type) {
    case 'cookie': {
      const value = encodedValue(strategy.values, target);
      ctx.setCookie(buildCookie(strategy.name, value, strategy.domain, strategy.path ?? '/'));
      return { navigated: false, needsReload: true, appliedSteps: 1 };
    }
    case 'localStorage': {
      ctx.setStorage(strategy.key, encodedValue(strategy.values, target));
      return { navigated: false, needsReload: true, appliedSteps: 1 };
    }
    case 'pathSegment': {
      const current = ctx.getUrl().toString();
      const next = withPathSegment(
        ctx.getUrl(),
        strategy.index ?? 0,
        encodedValue(strategy.values, target),
      );
      return navigateOrNoop(current, next.toString(), ctx);
    }
    case 'subdomain': {
      const current = ctx.getUrl().toString();
      const next = withSubdomain(ctx.getUrl(), encodedValue(strategy.values, target));
      return navigateOrNoop(current, next.toString(), ctx);
    }
    case 'query': {
      const current = ctx.getUrl().toString();
      const next = withQuery(ctx.getUrl(), strategy.param, encodedValue(strategy.values, target));
      return navigateOrNoop(current, next.toString(), ctx);
    }
    case 'searchParams': {
      const url = ctx.getUrl();
      // Gate: only rewrite pages that look like the intended target (e.g. a SERP
      // with `q=…`). Homepages and settings pages stay untouched.
      if (strategy.onlyWhenParam && !url.searchParams.has(strategy.onlyWhenParam)) {
        return { ...EMPTY };
      }
      const current = url.toString();
      const next = withSearchParams(
        url,
        strategy.params.map((p) => ({ name: p.name, value: encodedValue(p.values, target) })),
      );
      return navigateOrNoop(current, next.toString(), ctx);
    }
    case 'click': {
      const clicked = ctx.clickSelector(strategy.selector);
      // We don't know whether the click navigates — assume it does, since most
      // language pickers are anchors. The caller can detect a stalled state via
      // its own redirect-loop guard.
      return {
        navigated: clicked,
        needsReload: false,
        appliedSteps: clicked ? 1 : 0,
      };
    }
    case 'hreflang': {
      const current = ctx.getUrl().toString();
      for (const link of ctx.getHreflangLinks()) {
        // hreflang is BCP47 — strip region (en-US → en) before comparing.
        if (normalizeBCP47(link.hreflang) === target && link.href && link.href !== current) {
          ctx.navigate(link.href);
          return { navigated: true, needsReload: false, appliedSteps: 1 };
        }
      }
      return { navigated: false, needsReload: false, appliedSteps: 0 };
    }
  }
}

export function applyStrategy(
  strategy: LangStrategy,
  target: LanguageCode,
  ctx: StrategyContext = defaultContext,
): StrategyOutcome {
  // Flatten compound and run all writes before the (single) navigation, so the
  // navigation reload picks up the new cookie/localStorage state.
  const steps = strategy.type === 'compound' ? strategy.steps : [strategy];
  const { writes, navigates } = partition(steps);

  let outcome: StrategyOutcome = { ...EMPTY };
  for (const step of writes) {
    if (step.type === 'compound') continue; // already flattened
    const r = applyLeaf(step, target, ctx);
    outcome = {
      navigated: outcome.navigated || r.navigated,
      needsReload: outcome.needsReload || r.needsReload,
      appliedSteps: outcome.appliedSteps + r.appliedSteps,
    };
  }
  for (const step of navigates) {
    if (step.type === 'compound') continue;
    const r = applyLeaf(step, target, ctx);
    outcome = {
      navigated: outcome.navigated || r.navigated,
      needsReload: outcome.needsReload || r.needsReload,
      appliedSteps: outcome.appliedSteps + r.appliedSteps,
    };
    if (outcome.navigated) break; // can't navigate twice
  }
  return outcome;
}
