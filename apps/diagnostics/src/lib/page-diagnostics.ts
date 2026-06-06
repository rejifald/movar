/**
 * Build the page diagnostics snapshot by running the **product's own models**
 * (reused as library code) over the live DOM:
 *
 *   • `buildModelForHost` (page-content extractor; Google/YouTube today) →
 *     content cards. Each card's pre-serialized text is classified with
 *     `@movar/lang-detect` and marked blocked (detected language ∈ blocked set).
 *   • `findLanguagePickers` + `buildPickerModel` (language-picker model) → the
 *     on-site switcher's languages, with active + blocked flags.
 *
 * Confident rung-1/2 card verdicts also get a franc cross-check (the original
 * shadow-oracle calibration signal), surfaced as a per-card ✓/✗.
 *
 * Local-only: holds a `WeakRef<Element>` highlight map and a current-snapshot
 * store with a subscriber. Nothing is persisted or networked.
 */
import {
  classifyBySnippet,
  classifyDivergence,
  francOracle,
  type LanguageProfile,
  type SnippetVerdict,
} from '@movar/lang-detect';
import { buildModelForHost } from '@movar/page-content/registry';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { buildPickerModel } from '@movar/lang-pickers/build-model';
import { detectPickerActiveLanguage } from '@movar/lang-pickers/detect-page-language';
import {
  detectPageMode,
  modeFromColorSchemeAttr,
  modeFromColorSchemeMeta,
  modeFromComputedBackground,
  modeFromPrefersColorScheme,
} from '@movar/page-mode/detect';
import {
  detectPageLanguageFromModel,
  languageFromHtmlLang,
  languageFromPathSegments,
  languageFromSelfHreflang,
  languageFromSubdomain,
} from '@movar/page-language';
import {
  EMPTY_DIAGNOSTICS,
  type DiagCard,
  type DiagPicker,
  type DiagPickerLang,
  type DiagSignal,
  type LanguageCode,
  type PageDiagnostics,
  type PageLanguageDiag,
  type PageModeDiag,
} from '../types';

const SAMPLE_MAX = 160;

/** id → source element, weakly held (never keeps a detached node alive). Rebuilt
 *  per snapshot; ids are monotonic so a stale id never resolves to the wrong node. */
let elements = new Map<string, WeakRef<Element>>();
let seq = 0;

let current: PageDiagnostics = EMPTY_DIAGNOSTICS;
let lastOpts: BuildOptions | null = null;
let subscriber: (() => void) | null = null;

export function subscribe(cb: (() => void) | null): void {
  subscriber = cb;
}

export function getCurrent(): PageDiagnostics {
  return current;
}

export interface BuildOptions {
  /** Languages to tell apart (the user's priority ∪ blocked). */
  candidates: readonly LanguageProfile[];
  /** Languages the product would conceal. */
  blocked: ReadonlySet<LanguageCode>;
  host: string;
  href: string | undefined;
  root?: ParentNode;
  /** Defaults to `document`/`window`/`location` (the live page); overridable for tests. */
  doc?: Document;
  win?: Window;
  loc?: { pathname?: string; hostname?: string; href?: string };
}

/** Re-run the last build (the panel's manual refresh button). No-op before the
 *  first {@link refresh}. */
export function refreshNow(): void {
  if (lastOpts) refresh(lastOpts);
}

/** Build the snapshot, store it as current, and notify the panel. */
export function refresh(opts: BuildOptions): PageDiagnostics {
  lastOpts = opts;
  current = buildPageDiagnostics(opts);
  console.groupCollapsed(
    `[movar:diag] ${current.extractor ?? 'no page model'} — ${current.cards.length} cards, ${current.pickers.length} pickers, ${current.blockedCount} would-block`,
  );
  console.log('snapshot:', current);
  console.groupEnd();
  subscriber?.();
  return current;
}

/** Pure build: run the product models + classifier over `root` and return the
 *  snapshot (also (re)populating the highlight map). Exported for tests. */
export function buildPageDiagnostics(opts: BuildOptions): PageDiagnostics {
  const { candidates, blocked, host, href } = opts;
  const root = opts.root ?? document;
  const doc = opts.doc ?? document;
  // `globalThis` over `window` (lint), cast to Window — the product's page-mode
  // chain only reads `matchMedia`/`getComputedStyle`, which globalThis provides.
  const win: Window = opts.win ?? (globalThis as unknown as Window);
  const loc = opts.loc ?? {
    pathname: location.pathname,
    hostname: host,
    ...(href === undefined ? {} : { href }),
  };
  const map = new Map<string, WeakRef<Element>>();
  const assignId = (el: Element): string => {
    const key = `n${(seq += 1)}`;
    map.set(key, new WeakRef(el));
    return key;
  };

  // Each model is guarded: a site-specific extractor throwing on some real-world
  // DOM must not blank the whole panel — log and carry on with the rest.
  const model = guard('page-content model', () => buildModelForHost(host, root)) ?? null;
  const found = guard('language-picker model', () => findLanguagePickers(root)) ?? [];
  const pickerModel = buildPickerModel(found, href);

  const content = buildCards(model, candidates, blocked, assignId);
  const pickers = buildPickers(found, pickerModel, blocked, assignId);

  elements = map;
  return {
    extractor: model?.extractor ?? null,
    cards: content.cards,
    cardLangCounts: content.cardLangCounts,
    pickers: pickers.rows,
    pageMode: buildPageModeDiag(doc, win),
    pageLanguage: buildPageLanguageDiag(pickerModel, doc, loc, blocked),
    blockedCount: content.blockedCount + pickers.blockedCount,
  };
}

type AssignId = (el: Element) => string;

/** Run a model that may throw on real-world DOM; log + return undefined on a
 *  failure so one bad extractor never blanks the whole snapshot. */
function guard<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.warn(`[movar:diag] ${label} failed:`, error);
    return undefined;
  }
}

/** Franc cross-check for a confident rung-1/2 verdict (null = not checked, or
 *  franc abstained). */
function francCheck(
  text: string,
  v: SnippetVerdict,
  candidates: readonly LanguageProfile[],
): { agree: boolean | null; language: LanguageCode | null } {
  if (v.language === 'unknown' || v.rung === null || v.rung === 3) {
    return { agree: null, language: null };
  }
  const oracle = francOracle(text, candidates);
  if (!oracle) return { agree: null, language: null };
  return { agree: classifyDivergence(v, oracle) !== 'contradict', language: oracle.language };
}

/** Classify the page-content model's cards; tally languages + the blocked count. */
function buildCards(
  model: ReturnType<typeof buildModelForHost>,
  candidates: readonly LanguageProfile[],
  blocked: ReadonlySet<LanguageCode>,
  assignId: AssignId,
): { cards: DiagCard[]; cardLangCounts: Record<string, number>; blockedCount: number } {
  const cards: DiagCard[] = [];
  const cardLangCounts: Record<string, number> = {};
  let blockedCount = 0;
  for (const node of model?.nodes ?? []) {
    const v = classifyBySnippet(node.text, candidates);
    const isBlocked = v.language !== 'unknown' && blocked.has(v.language);
    if (isBlocked) blockedCount += 1;
    const franc = francCheck(node.text, v, candidates);
    cards.push({
      id: assignId(node.el),
      kind: node.kind,
      language: v.language,
      rung: v.rung,
      margin: v.margin,
      blocked: isBlocked,
      francAgree: franc.agree,
      francLanguage: franc.language,
      sample: node.text.slice(0, SAMPLE_MAX),
    });
    cardLangCounts[v.language] = (cardLangCounts[v.language] ?? 0) + 1;
  }
  return { cards, cardLangCounts, blockedCount };
}

/** Map the picker model to view rows; dedupe languages, flag active/blocked. */
function buildPickers(
  found: ReturnType<typeof findLanguagePickers>,
  pickerModel: ReturnType<typeof buildPickerModel>,
  blocked: ReadonlySet<LanguageCode>,
  assignId: AssignId,
): { rows: DiagPicker[]; blockedCount: number } {
  let blockedCount = 0;
  const rows = found.map((p) => {
    const seen = new Set<LanguageCode>();
    const languages: DiagPickerLang[] = [];
    for (const link of p.links) {
      if (seen.has(link.language)) continue;
      seen.add(link.language);
      const isBlocked = blocked.has(link.language);
      if (isBlocked) blockedCount += 1;
      languages.push({
        id: assignId(link.el),
        code: link.language,
        blocked: isBlocked,
        active: link.language === pickerModel.activeLanguage,
      });
    }
    return { id: assignId(p.container), languages, activeLanguage: pickerModel.activeLanguage };
  });
  return { rows, blockedCount };
}

/** Page-mode (light/dark) via the product's detect chain + the signal breakdown. */
function buildPageModeDiag(doc: Document, win: Window): PageModeDiag | null {
  return (
    guard('page-mode', (): PageModeDiag => {
      const signals: DiagSignal[] = [
        { label: 'color-scheme attribute', value: modeFromColorSchemeAttr(doc) },
        { label: 'theme-color meta', value: modeFromColorSchemeMeta(doc, win) },
        { label: 'computed background', value: modeFromComputedBackground(doc, win) },
        { label: 'prefers-color-scheme', value: modeFromPrefersColorScheme(win) },
      ];
      return {
        verdict: detectPageMode(doc, win),
        decidedBy: signals.find((s) => s.value)?.label ?? 'prefers-color-scheme',
        signals,
      };
    }) ?? null
  );
}

/** Page-language via the product's sync redirect-signal chain + the breakdown. */
function buildPageLanguageDiag(
  pickerModel: ReturnType<typeof buildPickerModel>,
  doc: Document,
  loc: { pathname?: string; hostname?: string; href?: string },
  blocked: ReadonlySet<LanguageCode>,
): PageLanguageDiag {
  const empty: PageLanguageDiag = { verdict: null, blocked: false, signals: [] };
  return (
    guard('page-language', (): PageLanguageDiag => {
      const verdict = detectPageLanguageFromModel(pickerModel, doc, loc);
      return {
        verdict,
        blocked: verdict !== null && blocked.has(verdict),
        signals: [
          { label: 'active picker', value: detectPickerActiveLanguage(pickerModel) },
          { label: '<html lang>', value: languageFromHtmlLang(doc) },
          { label: 'subdomain', value: languageFromSubdomain(loc.hostname) },
          { label: 'path segment', value: languageFromPathSegments(loc.pathname) },
          { label: 'self hreflang', value: languageFromSelfHreflang(doc, loc.href) },
        ],
      };
    }) ?? empty
  );
}

// ── On-page highlight ──────────────────────────────────────────────────────

const HIGHLIGHT_MS = 1800;
const FADE_MS = 300;

/** Default gutter (in rem) between the highlighted element and the flash box.
 *  Configurable from the panel; 1rem keeps the target clear of its overlay. */
export const DEFAULT_HIGHLIGHT_GUTTER_REM = 1;

/** Resolve a rem length to px against the page's root font-size (the overlay
 *  lives in the light DOM, so rem there is the host page's, not the shadow's). */
function remToPx(rem: number): number {
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Math.max(0, rem) * (Number.isFinite(root) ? root : 16);
}

/** Scroll to + flash the element behind a snapshot id, with `gutterRem` of
 *  breathing room around it. False if the element is gone. */
export function highlightNode(
  id: string,
  gutterRem: number = DEFAULT_HIGHLIGHT_GUTTER_REM,
): boolean {
  const el = elements.get(id)?.deref();
  if (!el || !el.isConnected) return false;
  flashElement(el, gutterRem);
  return true;
}

function flashElement(el: Element, gutterRem: number): void {
  const reduce =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }
  const gutter = remToPx(gutterRem);
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.setAttribute('data-movar-highlight', 'true');
  overlay.style.cssText = [
    'position:absolute',
    'box-sizing:border-box',
    `left:${rect.left + globalThis.scrollX - gutter}px`,
    `top:${rect.top + globalThis.scrollY - gutter}px`,
    `width:${rect.width + gutter * 2}px`,
    `height:${rect.height + gutter * 2}px`,
    'border:2px solid #15803d',
    'border-radius:6px',
    'background:rgba(21,128,61,0.12)',
    'box-shadow:0 0 0 3px rgba(21,128,61,0.35)',
    'z-index:2147483647',
    'pointer-events:none',
    `transition:opacity ${reduce ? 0 : FADE_MS}ms ease`,
  ].join(';');
  document.body.append(overlay);
  globalThis.setTimeout(() => {
    overlay.style.opacity = '0';
  }, HIGHLIGHT_MS);
  globalThis.setTimeout(() => {
    overlay.remove();
  }, HIGHLIGHT_MS + FADE_MS);
}
