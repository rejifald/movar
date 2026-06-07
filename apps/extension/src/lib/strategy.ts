import { encodedValue, type LangStrategy } from '@movar/rules';
import { normalizeBCP47, normalizeLanguageCode, type LanguageCode } from '@movar/lang-detect';
import { DAY_SECONDS } from './time';

/** Internal alias: a target list narrowed at the boundary so leaf
 *  functions can read `targets[0]` without a runtime guard or non-null
 *  assertion. The empty case is rejected by `applyStrategy` before any
 *  leaf is reached. */
type NonEmptyTargets = readonly [LanguageCode, ...LanguageCode[]];

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
  /** Optional loop-guard predicate. When set, `hreflang` skips any
   *  candidate URL the caller has already redirected from — used to break
   *  oscillation on sites whose hreflang alternates all share the same
   *  misconfigured `<html lang>`. Defaults to never-skip. */
  isAttemptedUrl?: (href: string) => boolean;
}

const defaultContext: StrategyContext = {
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
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((l) => ({
      hreflang: l.hreflang,
      href: l.href,
    })),
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
  const COOKIE_MAX_AGE_DAYS = 365;
  const oneYear = COOKIE_MAX_AGE_DAYS * DAY_SECONDS;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `path=${path}`,
    `max-age=${oneYear}`,
    'SameSite=Lax',
  ];
  if (domain != null) parts.push(`domain=${domain}`);
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

/** Two-part TLD suffixes where the registrable name is one label deeper
 *  (e.g. `example.co.uk`, `example.com.au`). Not exhaustive — the canonical
 *  source is the Public Suffix List — but covers the popular cases without
 *  pulling in a 100KB+ dependency. Extend as users report bad rewrites. */
const TWO_PART_TLDS = new Set([
  'co.uk',
  'co.jp',
  'co.kr',
  'co.in',
  'co.za',
  'co.nz',
  'co.il',
  'com.au',
  'com.br',
  'com.cn',
  'com.tr',
  'com.mx',
  'com.ua',
  'com.ar',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.my',
  'com.ph',
  'com.eg',
  'org.uk',
  'org.au',
  'org.nz',
  'gov.uk',
  'gov.au',
  'ac.uk',
  'ac.jp',
  'net.au',
]);

/** Number of trailing hostname labels that form the registrable name for a
 *  two-part TLD (e.g. `co.uk` = 2 labels). Used as the `slice` argument. */
const REGISTRABLE_LABELS = 2;

/** A three-label hostname (e.g. `example.co.uk`) is the minimum depth at
 *  which a two-part TLD can make the first label the registrable name. */
const THREE_LABEL_HOSTNAME = 3;

/** True when the hostname's first label is the registrable name itself —
 *  rewriting it would produce a different domain, not a different subdomain. */
function isApexHostname(hostname: string): boolean {
  const labels = hostname.split('.');
  if (labels.length <= 2) return true;
  if (labels.length === THREE_LABEL_HOSTNAME) {
    const lastTwo = labels.slice(-REGISTRABLE_LABELS).join('.');
    if (TWO_PART_TLDS.has(lastTwo)) return true;
  }
  return false;
}

function withSubdomain(url: URL, value: string): URL | null {
  if (isApexHostname(url.hostname)) return null;
  const next = new URL(url.toString());
  const labels = next.hostname.split('.');
  labels[0] = value;
  next.hostname = labels.join('.');
  return next;
}

function withQuery(url: URL, param: string, value: string): URL {
  const next = new URL(url.toString());
  next.searchParams.set(param, value);
  return next;
}

function withSearchParams(
  url: URL,
  params: readonly { name: string; value: string }[],
  stripParams: readonly string[] = [],
): URL {
  const next = new URL(url.toString());
  for (const name of stripParams) next.searchParams.delete(name);
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

type LeafStrategy = Exclude<LangStrategy, { type: 'compound' }>;
type LeafOf<T extends LeafStrategy['type']> = Extract<LeafStrategy, { type: T }>;

function applyCookie(
  strategy: LeafOf<'cookie'>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  const value = encodedValue(strategy.values, target);
  try {
    ctx.setCookie(buildCookie(strategy.name, value, strategy.domain, strategy.path ?? '/'));
  } catch {
    // Sandboxed iframes, third-party cookie blocking, and a few other
    // browser modes cause `document.cookie = …` to throw. Treat as a
    // silent no-op — we'd rather not redirect than crash applyOnce.
    return { ...EMPTY };
  }
  return { navigated: false, needsReload: true, appliedSteps: 1 };
}

function applyLocalStorage(
  strategy: LeafOf<'localStorage'>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  try {
    ctx.setStorage(strategy.key, encodedValue(strategy.values, target));
  } catch {
    // QuotaExceededError, SecurityError (private mode), or a SDK that's
    // disabled storage all surface here. Same treatment as cookie writes.
    return { ...EMPTY };
  }
  return { navigated: false, needsReload: true, appliedSteps: 1 };
}

function applyPathSegment(
  strategy: LeafOf<'pathSegment'>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  const current = ctx.getUrl().toString();
  const next = withPathSegment(
    ctx.getUrl(),
    strategy.index ?? 0,
    encodedValue(strategy.values, target),
  );
  return navigateOrNoop(current, next.toString(), ctx);
}

function applySubdomain(
  strategy: LeafOf<'subdomain'>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  const current = ctx.getUrl().toString();
  const next = withSubdomain(ctx.getUrl(), encodedValue(strategy.values, target));
  if (!next) return { ...EMPTY };
  return navigateOrNoop(current, next.toString(), ctx);
}

function applyQuery(
  strategy: LeafOf<'query'>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  const current = ctx.getUrl().toString();
  const next = withQuery(ctx.getUrl(), strategy.param, encodedValue(strategy.values, target));
  return navigateOrNoop(current, next.toString(), ctx);
}

function applySearchParams(
  strategy: LeafOf<'searchParams'>,
  targets: NonEmptyTargets,
  ctx: StrategyContext,
): StrategyOutcome {
  const url = ctx.getUrl();
  // Gate by path first (e.g. only /search, not /maps on the same host).
  if (strategy.onlyOnPath != null && !url.pathname.startsWith(strategy.onlyOnPath)) {
    return { ...EMPTY };
  }
  // Gate by required param (e.g. `q=…` for a SERP). Keeps the homepage
  // and other non-SERP surfaces alone.
  if (strategy.onlyWhenParam != null && !url.searchParams.has(strategy.onlyWhenParam)) {
    return { ...EMPTY };
  }
  const current = url.toString();
  // `joinPreferences: true` joins every preference with `|` (Google's `lr`
  // accepts `lang_uk|lang_en`). Single-preference callers get the same
  // single value either way; the join is only visible with ≥2 preferences.
  // `top` is guaranteed by the NonEmptyTargets type at the boundary.
  const [top] = targets;
  const next = withSearchParams(
    url,
    strategy.params.map((p) => ({
      name: p.name,
      value:
        p.joinPreferences === true
          ? targets.map((t) => encodedValue(p.values, t)).join('|')
          : encodedValue(p.values, top),
    })),
    strategy.stripParams,
  );
  return navigateOrNoop(current, next.toString(), ctx);
}

function applyClick(strategy: LeafOf<'click'>, ctx: StrategyContext): StrategyOutcome {
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

/** Hreflang rank tiers (lower wins; 0 = no match). */
const EXACT_REGION_RANK = 1; // e.g. `en-GB` — exact language+region
const LANGUAGE_RANK = 2; // e.g. `en` — bare language match
const X_DEFAULT_RANK = 3; // `x-default` fallback

/** Rank an hreflang link for `target`: lower wins, 0 means no match.
 *  1 = exact region (`en-GB`), 2 = bare language (`en`), 3 = `x-default`. */
function hreflangRank(tag: string, target: LanguageCode, region: string | undefined): number {
  const lower = tag.toLowerCase();
  if (region && lower === `${target}-${region}`.toLowerCase()) return EXACT_REGION_RANK;
  if (normalizeBCP47(tag) === target) return LANGUAGE_RANK;
  if (lower === 'x-default') return X_DEFAULT_RANK;
  return 0;
}

/** Pick the best <link rel=alternate hreflang> match for `target`, skipping
 *  the current URL so we don't bounce in place — and any URL the caller has
 *  flagged as already-attempted so we don't oscillate between sibling
 *  locale URLs that all share the same misconfigured `<html lang>`. */
function findHreflangMatch(
  links: readonly HreflangLink[],
  target: LanguageCode,
  region: string | undefined,
  currentUrl: string,
  isAttempted: (href: string) => boolean,
): string | null {
  let bestHref: string | null = null;
  let bestRank = Infinity;
  for (const link of links) {
    if (!link.href || link.href === currentUrl || isAttempted(link.href)) continue;
    const rank = hreflangRank(link.hreflang, target, region);
    if (rank !== 0 && rank < bestRank) {
      bestRank = rank;
      bestHref = link.href;
    }
  }
  return bestHref;
}

function applyHreflang(
  strategy: LeafOf<'hreflang'>,
  target: LanguageCode,
  ctx: StrategyContext,
): StrategyOutcome {
  const current = ctx.getUrl().toString();
  const isAttempted = ctx.isAttemptedUrl ?? (() => false);
  const href = findHreflangMatch(
    ctx.getHreflangLinks(),
    target,
    strategy.region,
    current,
    isAttempted,
  );
  if (href == null) return { ...EMPTY };
  ctx.navigate(href);
  return { navigated: true, needsReload: false, appliedSteps: 1 };
}

function applyLeaf(
  strategy: LeafStrategy,
  targets: NonEmptyTargets,
  ctx: StrategyContext,
): StrategyOutcome {
  // All leaves except `searchParams` operate on the top preference only —
  // a cookie or URL path can hold one value, not a list. `top` is
  // guaranteed by the NonEmptyTargets type at the boundary.
  const [top] = targets;
  switch (strategy.type) {
    case 'cookie': {
      return applyCookie(strategy, top, ctx);
    }
    case 'localStorage': {
      return applyLocalStorage(strategy, top, ctx);
    }
    case 'pathSegment': {
      return applyPathSegment(strategy, top, ctx);
    }
    case 'subdomain': {
      return applySubdomain(strategy, top, ctx);
    }
    case 'query': {
      return applyQuery(strategy, top, ctx);
    }
    case 'searchParams': {
      return applySearchParams(strategy, targets, ctx);
    }
    case 'click': {
      return applyClick(strategy, ctx);
    }
    case 'hreflang': {
      return applyHreflang(strategy, top, ctx);
    }
  }
}

function mergeOutcome(a: StrategyOutcome, b: StrategyOutcome): StrategyOutcome {
  return {
    navigated: a.navigated || b.navigated,
    needsReload: a.needsReload || b.needsReload,
    appliedSteps: a.appliedSteps + b.appliedSteps,
  };
}

function runSteps(
  steps: readonly LangStrategy[],
  targets: NonEmptyTargets,
  ctx: StrategyContext,
  stopOnNavigate: boolean,
): StrategyOutcome {
  let outcome: StrategyOutcome = { ...EMPTY };
  for (const step of steps) {
    if (step.type === 'compound') continue; // already flattened by partition
    outcome = mergeOutcome(outcome, applyLeaf(step, targets, ctx));
    if (stopOnNavigate && outcome.navigated) break; // can't navigate twice
  }
  return outcome;
}

export function applyStrategy(
  strategy: LangStrategy,
  target: LanguageCode | readonly LanguageCode[],
  ctx: Partial<StrategyContext> = {},
): StrategyOutcome {
  // Merge with defaults so callers that only want to override one method
  // (e.g. content.ts passing just `isAttemptedUrl`) don't have to restate
  // every side-effect surface. Test callers that pass a full mock ctx
  // still get exactly their mock — every default is overwritten.
  const merged: StrategyContext = { ...defaultContext, ...ctx };

  // Single-value callers (hreflang fallback, every leaf except searchParams,
  // and the existing test suite) lift into a 1-tuple so the rest of the
  // pipeline can treat targets uniformly. searchParams uses the full list
  // when a param sets `joinPreferences: true`. The empty case is rejected
  // here so leaf functions can take `NonEmptyTargets` and read `[0]`
  // without a runtime guard or non-null assertion.
  const list: readonly LanguageCode[] = Array.isArray(target) ? target : [target];
  if (list.length === 0) return { ...EMPTY };
  const targets = list as NonEmptyTargets;

  // Flatten compound and run all writes before the (single) navigation, so the
  // navigation reload picks up the new cookie/localStorage state.
  const steps = strategy.type === 'compound' ? strategy.steps : [strategy];
  const { writes, navigates } = partition(steps);

  const writeOutcome = runSteps(writes, targets, merged, false);
  const navOutcome = runSteps(navigates, targets, merged, true);
  return mergeOutcome(writeOutcome, navOutcome);
}
