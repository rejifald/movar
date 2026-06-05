import type { LanguageCode } from '@movar/shared';
import { normalizeBCP47, normalizeLanguageCode } from '@movar/lang-detect';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { buildPickerModel } from '@movar/lang-pickers/build-model';
import { detectPickerActiveLanguage } from '@movar/lang-pickers/detect-page-language';
import type { PickerModel } from '@movar/lang-pickers/types';

// ─── Markup / URL tier helpers ────────────────────────────────────────────────

// fallow-ignore-next-line unused-export
export function languageFromHtmlLang(doc: Document): LanguageCode | null {
  const htmlLang = doc.documentElement.getAttribute('lang');
  return htmlLang ? normalizeBCP47(htmlLang) : null;
}

/** Apex domains like `example.com` are skipped — the first label is the
 *  registrable name, not a language. Only 3+ label hostnames qualify. */
// fallow-ignore-next-line unused-export
export function languageFromSubdomain(hostname: string | undefined): LanguageCode | null {
  if (!hostname) return null;
  const labels = hostname.split('.');
  if (labels.length < 3) return null;
  const first = labels[0];
  return first ? normalizeLanguageCode(first) : null;
}

// fallow-ignore-next-line unused-export
export function languageFromPathSegments(pathname: string | undefined): LanguageCode | null {
  if (!pathname) return null;
  for (const seg of pathname.split('/').filter(Boolean)) {
    const norm = normalizeLanguageCode(seg);
    if (norm) return norm;
  }
  return null;
}

/** Self-targeted hreflang: `<link rel="alternate" hreflang="X" href="THIS URL">`
 *  declares the current page's language explicitly. */
// fallow-ignore-next-line unused-export
export function languageFromSelfHreflang(
  doc: Document,
  href: string | undefined,
): LanguageCode | null {
  if (!href) return null;
  const links = doc.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]');
  for (const link of links) {
    if (link.href !== href) continue;
    const norm = normalizeBCP47(link.hreflang);
    if (norm) return norm;
  }
  return null;
}

// ─── Detection functions ───────────────────────────────────────────────────────

/**
 * Model-driven variant. Used by `applyOnce` to avoid calling
 * `findLanguagePickers` twice per tick — build the model once and pass it
 * through the chain.
 *
 * Signals, most to least reliable:
 *   1. Active language picker entry (pre-computed in model.activeLanguage).
 *   2. `<html lang>` — declared by the author, BCP47.
 *   3. Subdomain — `ru.example.com`, `ua.example.com`. Only if multi-label.
 *   4. Path segments — strict alias match; `/ru-return-warranty` does not fire.
 *   5. Self-targeted hreflang — `<link rel="alternate" hreflang="X" href="THIS URL">`.
 *
 * Body-text detection (the former tier 6) moved out of detectPageLanguage —
 * see `applyOnce` in content.ts which runs `detectLanguageFromText` against
 * the visible-text sample when this chain returns null. The async-engine
 * boundary lives at the content-script level so detectPageLanguage stays sync.
 */
export function detectPageLanguageFromModel(
  model: PickerModel,
  doc: Document = document,
  loc: Partial<Pick<Location, 'pathname' | 'hostname' | 'href'>> = location,
): LanguageCode | null {
  return (
    detectPickerActiveLanguage(model) ??
    languageFromHtmlLang(doc) ??
    languageFromSubdomain(loc.hostname) ??
    languageFromPathSegments(loc.pathname) ??
    languageFromSelfHreflang(doc, loc.href)
  );
}

/**
 * Detect what language the current page is in.
 *
 * Public, backwards-compatible signature. Existing call sites and tests use
 * this — internally builds a fresh PickerModel each call (today's behaviour).
 *
 * Signals, most to least reliable:
 *   1. Active language picker entry — the same client code that renders the
 *      page also marks one picker entry as active (aria-current, non-anchor
 *      "you are here", `.active` class, or a bare-text token like
 *      `<div>UA | <a>RU</a> | <a>EN</a></div>`). Wins over `<html lang>`
 *      because picker state and rendered content can't drift (they're
 *      written together), whereas `<html lang>` is metadata that often
 *      goes stale — spizhenko.clinic serves `lang="ru"` on every locale.
 *   2. `<html lang>` — declared by the author, BCP47.
 *   3. Subdomain — `ru.example.com`, `ua.example.com`. Only if multi-label
 *      (apex domains like `example.com` are skipped — the first label is
 *      the registrable name, not a language).
 *   4. Path segments — any segment that strict-matches a language alias.
 *      Strict, not BCP47, so `/ru-return-warranty` doesn't false-positive.
 *   5. Self-targeted hreflang — `<link rel="alternate" hreflang="X"
 *      href="THIS URL">` declares the current page's language explicitly.
 *
 * Body-text detection (the former tier 6) is async and lives at the
 * applyOnce level — see content.ts.
 */
export function detectPageLanguage(
  doc: Document = document,
  loc: Partial<Pick<Location, 'pathname' | 'hostname' | 'href'>> = location,
): LanguageCode | null {
  const model = buildPickerModel(findLanguagePickers(doc), loc.href);
  return detectPageLanguageFromModel(model, doc, loc);
}
