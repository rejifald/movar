# @movar/lang-pickers

## 0.0.3

### Patch Changes

- 5cdab46: Stop reading a language switcher's first entry as the current one, and stop a wrong reading from taking your URL with it.

  On hotline.ua every page — Ukrainian ones included — came back Russian. Its switcher renders both entries as bare, href-less `<div>`s (the framework owns the click), so the rule "this entry can't switch anywhere, therefore it must be the one we're on" fired on **both**, and the first in DOM order won. The entry that really is current is marked `--disabled`, an inverted convention no `active`/`current`/`selected` pattern sees.

  The damage wasn't the wrong label. Russian is a blocked language, so the switch ladder engaged, and hotline publishes a canonical, query-less `uk-UA` alternate — following it replaced the URL and dropped the query. Product, tab and sort links that carried one silently stopped working, which is why it was reported as "some links don't open".

  Every active-entry pass now has to single one language out or abstain, so an ambiguous switcher falls through to `<html lang>` instead of reading DOM order as evidence — the same rule that already applies when two pickers disagree. Doing that revealed `<option selected>` was never read at all, so `<select>` switchers now get their own marker rather than relying on the selected option happening to be listed first.

  Separately, and independent of detection being right: on a site with no hand-written rule, Movar no longer redirects when the page's own `<html lang>` already declares the language you asked for. There's nothing to gain — you're on the best version on offer — and a redirect there costs you whatever query or anchor you were looking at. yato.com.ua lost live search results to the same shape in July.

## 0.0.2

### Patch Changes

- a52de05: lang-pickers: never hand back a collapsed switcher's dropdown toggle as a redirect target, and stop reading an off-canvas drawer as a blocking language gate.

  A collapsed switcher labels its toggle with the language the page is **already** in, so on a page already serving the preferred language that toggle was the picker's only matching entry — `pickRedirectTarget` returned it and `trySatisfyLanguageGate` (#355, the one pass that acts on an already-correct page) clicked it, popping the site's language menu open unprompted. Disclosure controls (`aria-haspopup`, `aria-expanded`, `data-toggle`/`data-bs-toggle="dropdown"`, `role="combobox"`) are now refused, and a priority language that is present but inert ends the search instead of falling through — switching an already-Ukrainian page to English would have been a downgrade.

  `findGateOverlay` also measured only a box's width and height, so a parked off-canvas nav drawer (full-viewport-sized, `translateX(-100%)`) read as page-blocking. It now measures the overlay's actual overlap with the viewport.

## 0.0.1

### Patch Changes

- Updated dependencies [c4689b0]
- Updated dependencies [3a5ca20]
  - @movar/lang-detect@0.0.1
