import { useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Check, Info, Languages } from 'lucide-react';
import { classifyBySnippet, PROFILES } from '@movar/lang-detect';
import type { LanguageCode, LanguageProfile, SnippetVerdict } from '@movar/lang-detect';
import { francResidualVerdict, francRung3Resolver } from '@movar/lang-detect/franc';
import { makeLanguageDisplay, resolveLocale } from '@movar/i18n';
import { cn } from '@movar/ui';
import type { HostMessages, RungKey } from '../i18n';

/**
 * Detector tab — the on-device Cyrillic-language checker + evidence report,
 * re-platformed 1:1 from the native screen's `Script.js` `initTool()` + the
 * detector markup in `Main.html` (the version on `gracious-bassi`) into React.
 *
 * Everything runs locally and the tab works with the extension off: a paste box
 * over a Detect button, then a verdict card and an **evidence report**. The
 * verdict comes from the SAME classifier the extension uses —
 * `classifyBySnippet` (rung 1 distinctive letters → 2a function words → 2b
 * frequent words → 3 franc letter-patterns) over the Cyrillic candidate set
 * (`PROFILES.uk` / `.ru` / `.be`) with the franc rung-3 resolver injected — so
 * the app can't drift from the extension. The evidence report runs every rung
 * for every candidate independently of where the verdict short-circuited, so it
 * surfaces the clues the verdict *didn't* need too.
 *
 * Nothing about the detection is re-implemented here; only the imperative
 * `Script.js` DOM wiring becomes React state + components. The class names mirror
 * the native `Style.css` 1:1 so the ported CSS styles it identically.
 */
export interface DetectorTabProps {
  /** Host-shell catalogue for the resolved locale — the detector card copy,
   *  verdict + evidence labels, and the How-it-works / Limitations explainers.
   *  The detected-language *name* comes from `makeLanguageDisplay`. */
  messages: HostMessages;
}

/** Debounce on the textarea, matching the native `setTimeout(render, 150)`. */
const DEBOUNCE_MS = 150;

/** Cap on the word chips shown per tier in a clue row, as the native
 *  `wordsFound(..., 6)` did — enough to be convincing without flooding. */
const WORD_CLUE_LIMIT = 6;

/** The Cyrillic candidates the host detector tells apart, in the canonical
 *  uk → ru → be order. `classifyBySnippet` scores relative to this set; the
 *  evidence gathering and the render walk it in the same order. */
const SIGNAL_ORDER = ['uk', 'ru', 'be'] as const;
type SignalCode = (typeof SIGNAL_ORDER)[number];

/** The candidate profiles, in `SIGNAL_ORDER`. Filtered so a future roster change
 *  that drops one of these codes degrades gracefully rather than passing
 *  `undefined` into the classifier. */
const CANDIDATES: readonly LanguageProfile[] = [
  PROFILES['uk'],
  PROFILES['ru'],
  PROFILES['be'],
].filter((profile) => profile !== undefined);

/** Distinctive rung-1 letters per language — the exact sets langtell/cyrillic's
 *  rung 1 keys off, hard-coded here as the native `Script.js` did (not read from
 *  `profile.alphabet`, which is the full alphabet, not the distinctive subset).
 *  Global + case-insensitive; `String.match` ignores `lastIndex`, so reusing one
 *  RegExp across calls is safe. */
const SIGNAL_SETS: Record<SignalCode, RegExp> = {
  uk: /[іїєґ]/gi,
  ru: /[ыё]/gi,
  be: /ў/gi,
};

/** Per-language clues found at each rung. A language appears in the evidence
 *  report only when at least one of these is non-empty/true. */
interface Clue {
  code: SignalCode;
  /** Rung 1 — distinctive letters present (mono chips). */
  letters: string[];
  /** Rung 2a — exclusive function words present (chips). */
  functionWords: string[];
  /** Rung 2b — exclusive frequent words present (chips). */
  frequentWords: string[];
  /** Rung 3 — franc's letter-patterns name this language as the closest match. */
  franc: boolean;
}

/**
 * For a word tier, the set of words **unique to each candidate** within the set
 * — words in that candidate's list that appear in NO other candidate's list at
 * the same tier. Shared words point to no single language, so they're dropped:
 * only the discriminating ones are real clues. Mirrors the native
 * `discriminatingSets`. Computed once (the profiles are static).
 */
function discriminatingSets(tier: 'function' | 'frequent'): Set<string>[] {
  const lists = SIGNAL_ORDER.map((_code, index) => CANDIDATES[index]?.words?.[tier] ?? []);
  const sets = lists.map((list) => new Set(list));
  return lists.map(
    (own, index) =>
      new Set(own.filter((word) => !sets.some((set, other) => other !== index && set.has(word)))),
  );
}

const FUNCTION_SETS = discriminatingSets('function');
const FREQUENT_SETS = discriminatingSets('frequent');

/** Lowercase Unicode word tokens — letters plus the combining acute accent
 *  (U+0301) that langtell keeps as part of a token. Matches the native
 *  `tokenize`. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}́]+/gu) ?? [];
}

/** The first `limit` distinct tokens that are in `set`, in document order. */
function wordsFound(tokens: string[], set: Set<string>, limit: number): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (set.has(token) && !seen.has(token)) {
      seen.add(token);
      found.push(token);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/** The distinct distinctive letters of `code` present in `text`, lowercased, in
 *  first-seen order. */
function lettersFound(text: string, code: SignalCode): string[] {
  const hits = text.match(SIGNAL_SETS[code]);
  if (!hits) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const char of hits) {
    const lower = char.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(lower);
    }
  }
  return out;
}

/**
 * Run every rung for every candidate and collect each language's clues —
 * distinctive letters, exclusive function/frequent words, and (the franc layer)
 * whether its letter-patterns are the closest match. Independent of where
 * `classifyBySnippet` stopped, so the report can show evidence the verdict
 * didn't rely on. Languages with no clue are dropped. Mirrors `gatherClues`.
 */
export function gatherClues(text: string): Clue[] {
  const tokens = tokenize(text);

  // The franc (letter-patterns) layer, run on its own so the report can show it
  // independently of which rung the short-circuiting classifier stopped at.
  let francPick: string | null = null;
  try {
    const verdict = francResidualVerdict(text, CANDIDATES);
    if (verdict !== null && verdict.language !== '' && verdict.language !== 'unknown') {
      francPick = verdict.language;
    }
  } catch {
    // franc unavailable — skip the letter-patterns clue, as the native code did.
  }

  return SIGNAL_ORDER.map((code, index) => ({
    code,
    letters: lettersFound(text, code),
    functionWords: wordsFound(tokens, FUNCTION_SETS[index] ?? new Set(), WORD_CLUE_LIMIT),
    frequentWords: wordsFound(tokens, FREQUENT_SETS[index] ?? new Set(), WORD_CLUE_LIMIT),
    franc: francPick === code,
  })).filter(
    (clue) =>
      clue.letters.length > 0 ||
      clue.functionWords.length > 0 ||
      clue.frequentWords.length > 0 ||
      clue.franc,
  );
}

/** Capitalise the first character of a language endonym, as `Script.js` did —
 *  `Intl.DisplayNames` returns lower-case names in some locales. */
function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** A language's name in its OWN language (the verdict's "Native name" row).
 *  Built directly from `Intl.DisplayNames([code])` rather than via
 *  `makeLanguageDisplay`, whose locale parameter is the host's UI locale, not an
 *  arbitrary language code. Degrades to the bare code, never throws. */
function endonymOf(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The `.badge` tone for a detected language: `is-accent` for Ukrainian,
 *  `is-danger` for Russian, neutral (`''`) for the rest — verbatim from the
 *  native `tone` ternary. */
function toneFor(code: SignalCode): string {
  if (code === 'uk') return 'is-accent';
  if (code === 'ru') return 'is-danger';
  return '';
}

/** Coerce `SnippetVerdict.rung` (a `1 | '2a' | '2b' | 3 | null`) to the string
 *  key the `matched` / `clueLabels` catalogues use, or `null` when unknown. */
function rungKey(rung: SnippetVerdict['rung']): RungKey | null {
  if (rung === null) return null;
  const key = String(rung);
  return key === '1' || key === '2a' || key === '2b' || key === '3' ? key : null;
}

/** Which badge icon the verdict head shows. */
type VerdictIcon = 'check' | 'languages' | 'info';

/** The fully-resolved detector result, or `null` when the result box is hidden
 *  (empty / whitespace input). Pure data so it's unit-testable without the DOM. */
export interface DetectorResult {
  /** `.tool-result` state modifier: `is-uk` / `is-ru` / `is-be` / `is-unknown`. */
  rootClass: string;
  /** `.badge` tone: `is-accent` (uk) / `is-danger` (ru) / `''` (other / none). */
  tone: string;
  /** The badge glyph. */
  icon: VerdictIcon;
  /** Verdict label — a capitalised endonym when detected, else a host string. */
  verdict: string;
  /** The detected ISO code (drives the `[code]` chip + the native-name row), or
   *  `null` when not detected / unavailable. */
  code: SignalCode | null;
  /** The language's own-language name, shown only when it differs from `verdict`
   *  (so it's hidden when the UI is already in that language). */
  nativeName: string | null;
  /** The rung that decided — only when detected; drives the "Matched by" line. */
  rung: RungKey | null;
  /** Per-language evidence, already filtered to languages with a clue. */
  clues: Clue[];
}

/**
 * Pure verdict + evidence computation — the heart of the native `render()`,
 * lifted out so it's testable without the DOM. Returns `null` for
 * empty/whitespace input (the result box is then hidden).
 *
 * `display` is the UI-locale endonym resolver (injected so the locale lookup
 * happens once in the component and the mapping is testable).
 */
export function computeResult(
  text: string,
  messages: HostMessages,
  display: (code: LanguageCode) => string,
): DetectorResult | null {
  if (!text.trim()) return null;

  let verdict: SnippetVerdict;
  try {
    verdict = classifyBySnippet(text, CANDIDATES, francRung3Resolver);
  } catch {
    // The classifier is statically bundled, so this should never happen; fail
    // honestly with the "unavailable" message rather than crashing the tab —
    // the native `Script.js` equivalent of `window.Movar` missing.
    return {
      rootClass: 'is-unknown',
      tone: '',
      icon: 'info',
      verdict: messages.detector.unavailable,
      code: null,
      nativeName: null,
      rung: null,
      clues: [],
    };
  }

  const clues = gatherClues(text);

  if (verdict.language === 'unknown') {
    // No clear winner: "mixed signals" when there was *some* evidence, otherwise
    // "no Cyrillic language" — verbatim from the native `render()`.
    return {
      rootClass: 'is-unknown',
      tone: '',
      icon: 'languages',
      verdict: clues.length > 0 ? messages.detector.ambiguous : messages.detector.notDetected,
      code: null,
      nativeName: null,
      rung: null,
      clues,
    };
  }

  const code = verdict.language as SignalCode;
  const name = capitalize(display(code));
  const endonym = endonymOf(code);
  return {
    rootClass: `is-${code}`,
    tone: toneFor(code),
    icon: 'check',
    verdict: name,
    code,
    nativeName: endonym.toLowerCase() === name.toLowerCase() ? null : endonym,
    rung: rungKey(verdict.rung),
    clues,
  };
}

export function DetectorTab({ messages }: Readonly<DetectorTabProps>): JSX.Element {
  const [text, setText] = useState('');
  // The result actually shown — recomputed on the debounced input and on Detect.
  // `null` hides the result box (empty/whitespace input).
  const [result, setResult] = useState<DetectorResult | null>(null);
  const detector = messages.detector;

  // The host UI locale follows the device (no in-app switch), so the endonym
  // resolver is bound once to the resolved locale — the same locale the Settings
  // tab resolves, keeping the two in lock-step. `makeLanguageDisplay` caches one
  // `Intl.DisplayNames` in the returned closure; memoised so it's built once.
  const display = useMemo(() => makeLanguageDisplay(resolveLocale('auto', navigator.language)), []);

  // Debounced recompute: each keystroke schedules a render 150ms out, replacing
  // any pending one — mirrors the native `clearTimeout` + `setTimeout`.
  useEffect(() => {
    const id = setTimeout(() => {
      setResult(computeResult(text, messages, display));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [text, messages, display]);

  return (
    <div className="tool">
      <div>
        <h2 className="sec-title">{detector.title}</h2>
        <p className="sec-intro">{detector.intro}</p>
      </div>

      <div className="composer">
        <textarea
          id="tool-input"
          className="tool-input"
          rows={4}
          placeholder={detector.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            setResult(computeResult(text, messages, display));
          }}
        >
          <Languages className="ico" aria-hidden="true" />
          {detector.detect}
        </button>
      </div>

      {/* `<output aria-live="polite">` so the verdict is announced when it
          changes; `hidden` (which styles.css forces to win) removes the box for
          empty input, matching the native `result.hidden`. */}
      <output
        id="tool-result"
        className={cn('tool-result', result?.rootClass)}
        aria-live="polite"
        hidden={result === null}
      >
        {result ? <ResultBody result={result} messages={messages} display={display} /> : null}
      </output>

      <section className="sec">
        <h2 className="sec-title">{detector.howItWorks.title}</h2>
        <div className="sec-body howto">
          <p>{detector.howItWorks.intro}</p>
          <ol className="layers">
            <li className="layer">
              <span className="layer-num">1</span>
              <span className="layer-text">
                <span className="layer-title">{detector.howItWorks.layer1Title}</span>
                <span className="layer-detail">
                  {detector.howItWorks.layer1Lead} <span className="mono">і ї є ґ</span> (uk),{' '}
                  <span className="mono">ы ё</span> (ru), <span className="mono">ў</span> (be).
                </span>
              </span>
            </li>
            <li className="layer">
              <span className="layer-num">2</span>
              <span className="layer-text">
                <span className="layer-title">{detector.howItWorks.layer2Title}</span>
                <span className="layer-detail">{detector.howItWorks.layer2Detail}</span>
              </span>
            </li>
            <li className="layer">
              <span className="layer-num">3</span>
              <span className="layer-text">
                <span className="layer-title">{detector.howItWorks.layer3Title}</span>
                <span className="layer-detail">{detector.howItWorks.layer3Detail}</span>
              </span>
            </li>
          </ol>
          <p className="howto-foot">{detector.howItWorks.foot}</p>
        </div>
      </section>

      <section className="sec">
        <h2 className="sec-title">{detector.limitations.title}</h2>
        <ul className="limits sec-body">
          {detector.limitations.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The verdict head + "Matched by" line + evidence report — the appended nodes
 *  of the native `render()` (`buildHead` / `buildMethod` / `buildClues`). */
function ResultBody({
  result,
  messages,
  display,
}: Readonly<{
  result: DetectorResult;
  messages: HostMessages;
  display: (code: LanguageCode) => string;
}>): JSX.Element {
  const detector = messages.detector;
  return (
    <>
      <div className="result-head">
        <div className={cn('badge', result.tone)}>
          <VerdictGlyph icon={result.icon} />
        </div>
        <div className="result-text">
          {result.code ? (
            <>
              <div className="result-name-row">
                <span className="result-verdict">{result.verdict}</span>
                <span className="result-code">{result.code}</span>
              </div>
              {result.nativeName !== null && (
                <div className="result-native">
                  <span className="result-native-label">{detector.nativeName}</span>
                  <span className="result-native-value" lang={result.code}>
                    {result.nativeName}
                  </span>
                </div>
              )}
            </>
          ) : (
            <span className="result-verdict">{result.verdict}</span>
          )}
        </div>
      </div>

      {result.rung ? (
        <p className="result-method">
          <span className="result-method-by">{detector.matchedBy} </span>
          <span className="result-method-layer">{detector.matched[result.rung]}</span>
        </p>
      ) : null}

      {result.clues.length > 0 ? (
        <div className="clues">
          <span className="eyebrow">{detector.evidence}</span>
          {result.clues.map((clue) => (
            <ClueBlock
              key={clue.code}
              clue={clue}
              detected={clue.code === result.code}
              messages={messages}
              display={display}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function VerdictGlyph({ icon }: Readonly<{ icon: VerdictIcon }>): JSX.Element {
  if (icon === 'check') return <Check className="ico" aria-hidden="true" />;
  if (icon === 'info') return <Info className="ico" aria-hidden="true" />;
  return <Languages className="ico" aria-hidden="true" />;
}

/** One language's clue block in the evidence report. The verdict's own language
 *  is highlighted (`is-detected`); the per-language tint (`is-uk` / `is-ru`)
 *  recolours it. */
function ClueBlock({
  clue,
  detected,
  messages,
  display,
}: Readonly<{
  clue: Clue;
  detected: boolean;
  messages: HostMessages;
  display: (code: LanguageCode) => string;
}>): JSX.Element {
  const { clueLabels, closestMatch } = messages.detector;
  return (
    <div className={cn(`clue-lang is-${clue.code}`, detected && 'is-detected')}>
      <div className="clue-head">
        <span className="clue-name">{capitalize(display(clue.code))}</span>
        <span className="result-code">{clue.code}</span>
      </div>
      {clue.letters.length > 0 ? (
        <ClueRow label={clueLabels['1']}>
          <span className="clue-tokens">
            {clue.letters.map((letter) => (
              <span key={letter} className="clue-token mono">
                {letter}
              </span>
            ))}
          </span>
        </ClueRow>
      ) : null}
      {clue.functionWords.length > 0 ? (
        <ClueRow label={clueLabels['2a']}>
          <span className="clue-tokens">
            {clue.functionWords.map((word) => (
              <span key={word} className="clue-token">
                {word}
              </span>
            ))}
          </span>
        </ClueRow>
      ) : null}
      {clue.frequentWords.length > 0 ? (
        <ClueRow label={clueLabels['2b']}>
          <span className="clue-tokens">
            {clue.frequentWords.map((word) => (
              <span key={word} className="clue-token">
                {word}
              </span>
            ))}
          </span>
        </ClueRow>
      ) : null}
      {clue.franc ? (
        <ClueRow label={clueLabels['3']}>
          <span className="clue-verdict">
            <Check className="ico" aria-hidden="true" />
            <span>{closestMatch}</span>
          </span>
        </ClueRow>
      ) : null}
    </div>
  );
}

function ClueRow({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>): JSX.Element {
  return (
    <div className="clue-row">
      <span className="clue-label">{label}</span>
      {children}
    </div>
  );
}
