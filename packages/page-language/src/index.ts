/**
 * Page-language detection: the redirect-layer's answer to "what language is the
 * site claiming to serve?" — the active picker marker, then markup/URL tiers
 * (`<html lang>`, subdomain, path segment, self-referential hreflang). Consumes
 * the pure picker model from `@movar/lang-pickers`; never feeds content-language
 * signals into the redirect chain.
 */

export {
  languageFromHtmlLang,
  languageFromSubdomain,
  languageFromPathSegments,
  languageFromSelfHreflang,
  detectPageLanguageFromModel,
  detectPageLanguage,
} from './page-language';
