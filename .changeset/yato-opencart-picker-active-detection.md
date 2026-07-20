---
'@movar/extension': patch
---

Fix broken on-site search on Ukrainian OpenCart shops (reported on yato.com.ua). Their language switcher renders each option as a `<li>` wrapping a dead-href (`href="#"`) JavaScript switcher anchor, and the extractor keeps the `<li>` wrappers as the picker's classified links. The active-language detector treated the first non-anchor entry as the "you are here" marker, so a Ukrainian page (`<html lang="uk">`) was read as Russian — its first option is `Русский`. The extension then tried to "correct" the page: the site's own `uk` hreflang is self-referential (a no-op), so it followed the Ukrainian switcher anchor, which — with `<base href>` plus `href="#"` — resolves to the homepage, discarding the user's search results. Active-language detection now judges a wrapper element by the lone switcher it contains instead of assuming any non-anchor entry is the active one, so these pickers correctly abstain and detection falls through to `<html lang>`.
