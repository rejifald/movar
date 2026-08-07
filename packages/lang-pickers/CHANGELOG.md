# @movar/lang-pickers

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
