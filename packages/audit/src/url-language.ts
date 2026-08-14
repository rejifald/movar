/**
 * The URL's own language marker — a locale path prefix (`/uk/…`) or a language
 * subdomain (`uk.example.com`).
 *
 * **Strict alias matching only.** `normalizeLanguageCode` never hyphen-splits,
 * which is the whole point here: a path segment `ru-return-warranty` must not
 * read as Russian. That regression is the reason `core/lang-contradicts-url`
 * exists in the catalogue with the rule spelled out, and it is guarded by a
 * test. `normalizeBCP47` is banned in this module — it hyphen-splits, and a URL
 * slug is not a documented BCP-47 attribute.
 *
 * A marker is a *hint the site published about itself*, so a mismatch against
 * `<html lang>` is the site contradicting its own declarations — `declared`
 * grounding, and safe to fail on.
 */

import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

/** Below this, a leading label is the site's own name, not a language. */
const MIN_LABELS_FOR_SUBDOMAIN = 3;

/** A language marker the URL itself carries. */
export interface UrlLanguageMarker {
  readonly language: LanguageCode;
  readonly source: 'path' | 'subdomain';
  /** The literal token that matched, for the finding's summary. */
  readonly token: string;
}

function parseUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** The first non-empty path segment, when it is a language code. */
function pathMarker(pathname: string): UrlLanguageMarker | null {
  const segment = pathname.split('/').find((part) => part !== '');
  if (segment === undefined) return null;
  const language = normalizeLanguageCode(decodeSegment(segment));
  if (language === null) return null;
  return { language, source: 'path', token: segment };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The leading host label, when it is a language code. */
function subdomainMarker(hostname: string): UrlLanguageMarker | null {
  const labels = hostname.toLowerCase().split('.');
  const meaningful = labels[0] === 'www' ? labels.slice(1) : labels;
  if (meaningful.length < MIN_LABELS_FOR_SUBDOMAIN) return null;
  const label = meaningful[0];
  if (label === undefined) return null;
  const language = normalizeLanguageCode(label);
  if (language === null) return null;
  return { language, source: 'subdomain', token: label };
}

/**
 * The language marker a URL or build path declares about itself, or `null`.
 *
 * Accepts an absolute URL (network evidence) or a bare path (a filesystem
 * build). The path prefix wins over the subdomain — it is both the more common
 * convention and the more specific claim.
 */
export function urlLanguageMarker(locator: string): UrlLanguageMarker | null {
  const url = parseUrl(locator);
  const fromPath = pathMarker(url?.pathname ?? locator);
  if (fromPath !== null) return fromPath;
  if (url === null) return null;
  return subdomainMarker(url.hostname);
}
