import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { detectCyrillicLanguage } from '@movar/lang-detect';
import { makeLanguageDisplay, resolveLocale } from '@movar/i18n';
import type { HostMessages } from '../i18n';

/**
 * Detector tab — the on-device Cyrillic-language checker, ported from
 * magical-snyder's `Script.js` `initTool()` + the `.tool` card in `Main.html`.
 *
 * A paste-text area over Detect / Clear actions and a verdict box. Everything
 * runs locally via `detectCyrillicLanguage` from `@movar/lang-detect` — the
 * tool works with the extension off and nothing leaves the device. The DOM
 * structure + class names mirror the static `.tool` card 1:1 so the ported
 * `styles.css` (`.tool-input`, `.tool-actions`, `.btn-primary`/`.btn-ghost`,
 * `.tool-result` + its `is-uk`/`is-ru`/… dot variants, `.tool-note`) styles it
 * identically — only the imperative `Script.js` wiring is now React state.
 *
 * Verdict mapping (verbatim from `initTool().render()`):
 *   - empty / whitespace-only input → the result is hidden;
 *   - the detector unavailable → the "unavailable" string with an `is-unknown`
 *     dot. The legacy code guarded against `window.Movar` failing to load; here
 *     `detectCyrillicLanguage` is statically bundled so it's always present, but
 *     we keep the honest fallback for the (never-expected) case it throws, so a
 *     broken detector still degrades to a clear message instead of a crash;
 *   - `language === 'unknown'` → the "no Cyrillic language" string, `is-unknown`;
 *   - otherwise → the language endonym (capitalised) via
 *     `makeLanguageDisplay(locale)`, with the dot class keyed off the language
 *     (`is-uk` / `is-ru` / `is-other` for be/bg).
 *
 * The detected-language *name* is resolved in the host's UI locale (the same
 * device-following locale the Settings tab's `@movar/i18n` provider resolves),
 * so a Ukrainian device reads "українська" / "російська"; the verdict copy
 * around it comes from the host `messages.detector` catalogue.
 */
export interface DetectorTabProps {
  /** Host-shell catalogue for the resolved locale — the detector card copy +
   *  verdict strings. The language *name* comes from `makeLanguageDisplay`. */
  messages: HostMessages;
}

/** Debounce on the textarea, matching the legacy `setTimeout(render, 150)`. */
const DEBOUNCE_MS = 150;

/** Capitalise the first character of a language endonym, as `Script.js` did
 *  (`name.charAt(0).toUpperCase() + name.slice(1)`) — `Intl.DisplayNames`
 *  returns lower-case names in some locales (e.g. `ukrainian`). */
function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** The verdict the result box renders, or `null` when nothing should show
 *  (empty / whitespace input). `dotClass` is the `.tool-result` modifier that
 *  recolours the leading dot. */
interface Verdict {
  /** `.tool-result` state modifier: `is-uk` / `is-ru` / `is-other` / `is-unknown`. */
  dotClass: 'is-uk' | 'is-ru' | 'is-other' | 'is-unknown';
  /** The verdict label (a capitalised endonym, or a host catalogue string). */
  label: string;
}

/**
 * Pure verdict computation — the heart of the legacy `render()`, lifted out so
 * it's unit-testable without the DOM. Returns `null` for empty/whitespace input
 * (the result box is then hidden), otherwise the `{ dotClass, label }` to show.
 *
 * `display` is a `makeLanguageDisplay`-style endonym resolver (injected so the
 * mapping is testable and the locale lookup happens once in the component).
 */
export function computeVerdict(
  text: string,
  messages: HostMessages,
  display: (code: 'uk' | 'ru' | 'be' | 'bg') => string,
): Verdict | null {
  if (!text.trim()) return null;

  let language: 'uk' | 'ru' | 'be' | 'bg' | 'unknown';
  try {
    ({ language } = detectCyrillicLanguage(text));
  } catch {
    // The bundled detector should never throw; if it ever does, fail honestly
    // with the "unavailable" message rather than crashing the tab — the legacy
    // `Script.js` equivalent of `window.Movar` missing.
    return { dotClass: 'is-unknown', label: messages.detector.unavailable };
  }

  if (language === 'unknown') {
    return { dotClass: 'is-unknown', label: messages.detector.notDetected };
  }

  return { dotClass: dotClassFor(language), label: capitalize(display(language)) };
}

/** Map a detected language to its `.tool-result` dot modifier: `is-uk` for
 *  Ukrainian, `is-ru` for Russian, `is-other` for the remaining Cyrillic
 *  languages (Belarusian, Bulgarian) — verbatim from the legacy `cls` ternary. */
function dotClassFor(language: 'uk' | 'ru' | 'be' | 'bg'): 'is-uk' | 'is-ru' | 'is-other' {
  if (language === 'uk') return 'is-uk';
  if (language === 'ru') return 'is-ru';
  return 'is-other';
}

export function DetectorTab({ messages }: Readonly<DetectorTabProps>): JSX.Element {
  const [text, setText] = useState('');
  // The verdict actually shown — updated on the debounced input and on Detect /
  // Clear. `null` means the result box is hidden (empty/whitespace input).
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The host UI locale follows the device (no in-app language switch), so the
  // endonym resolver is bound once to the `navigator.language`-resolved locale —
  // the same locale the Settings tab's I18nProvider resolves, keeping the two in
  // lock-step. `makeLanguageDisplay` constructs one Intl.DisplayNames and caches
  // it in the returned closure; memoised so that construction happens once.
  const display = useMemo(() => makeLanguageDisplay(resolveLocale('auto', navigator.language)), []);

  // Debounced recompute: each keystroke schedules a render 150ms out, replacing
  // any pending one — mirrors the legacy `clearTimeout` + `setTimeout`.
  useEffect(() => {
    const id = setTimeout(() => {
      setVerdict(computeVerdict(text, messages, display));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [text, messages, display]);

  const detect = (): void => {
    setVerdict(computeVerdict(text, messages, display));
  };

  const clear = (): void => {
    setText('');
    setVerdict(null);
    inputRef.current?.focus();
  };

  return (
    <div className="card tool" aria-labelledby="tool-title">
      <h2 id="tool-title" className="card-title">
        {messages.detector.title}
      </h2>
      <p className="card-sub">{messages.detector.intro}</p>
      <textarea
        ref={inputRef}
        id="tool-input"
        className="tool-input"
        rows={4}
        placeholder={messages.detector.placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <div className="tool-actions">
        <button type="button" className="btn-primary" onClick={detect}>
          {messages.detector.detect}
        </button>
        <button type="button" className="btn-ghost" onClick={clear}>
          {messages.detector.clear}
        </button>
      </div>
      {/* `<output aria-live="polite">` so the verdict is announced when it
          changes; `hidden` (which styles.css forces to win) removes the box
          entirely for empty input, matching the legacy `result.hidden`. */}
      <output
        id="tool-result"
        className={verdict ? `tool-result ${verdict.dotClass}` : 'tool-result'}
        aria-live="polite"
        hidden={verdict === null}
      >
        {verdict ? (
          <span className="result-verdict">
            <span className="result-dot" />
            <span>{verdict.label}</span>
          </span>
        ) : null}
      </output>
      <p className="tool-note">{messages.detector.note}</p>
    </div>
  );
}
