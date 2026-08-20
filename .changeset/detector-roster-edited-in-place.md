---
'@movar/extension': minor
---

Fold the Detector's roster editor into the tab it describes, and stop the list reordering under the reader's finger.

The roster shipped as a summary row that opened a sheet: a title bar, a Done button and a two-section editor — "In the comparison" over "Not compared" — with a ⊖ button on every row of the first and a ⊕ on every row of the second. That is a faithful copy of what apps do for a LONG catalogue; Airbnb's "Languages you speak" opens a searchable modal over a hundred entries. This catalogue is five codes. A modal over five rows puts a presentation, a title bar and a Done button between a reader and a claim the screen made two lines earlier, and the closed set is exactly the claim this screen exists to make checkable.

It is now a `DisclosureGroup` — the widget the two explainers at the foot of the same tab already use. Collapsed it is the identical one-line statement it always was; open, it is the editor, with the verdict still on screen beneath it. `RosterView` and the `movarSheetChrome` seam are deleted outright, which also removes one of the places iOS and macOS had to diverge: `NavigationView` is a split view on macOS, so the sheet needed a hand-laid title row there and a navigation bar on iOS to say the same thing.

**One list, not two, and the checkmark carries membership.** Wispr Flow, Airbnb and Apple's own language list all do this; nothing in the surveyed corpus uses a ⊖-over-⊕ split. The whole row is the control, which is what lets a checkmark be a checkmark rather than a button with its own hit target and its own accessible name sitting beside a label that already said the language. It is trailing, where iOS puts selection in a list — a leading mark would rhyme with the evidence section's leading `checkmark.circle.fill` two sections down, which means "won", not "in the set".

**The order is fixed and alphabetical, which the first draft got wrong.** Listing the roster first and the rest after reads well until someone taps: the row they just touched jumps out from under their finger to the far end of the list, and a second tap to undo lands on whatever slid up to take its place. A picker whose order is a function of its own state cannot be tapped twice in a row. Sorted by displayed name, a tap changes exactly one thing — the checkmark — and the roster's own meaningful order (preferred first, then the ones Movar hides) is still stated in full on the line above. The comparison is locale-aware against the locale the BUNDLE settled on, not `Locale.current`, for the reason `LanguageNames` already documents.

Two colour facts had to be written down rather than inherited, because a build cannot catch either. A `Button` label in a `List` inherits the accent tint on iOS, so an unstated colour paints the language names green and the roster reads as five links; and an explicit colour in turn outranks the dimming `.disabled` applies, so the last candidate standing has to name its own grey. Both went wrong on the simulator before they went right.

Copy: "Follow my Movar languages" becomes "Reset to my settings" in both locales. `detector.rosterTitle`, `detector.rosterIn` and `detector.rosterOut` die with the sheet. `detector.rosterFooter` — the one piece of real explanation on the screen, which used to be read in a footer by someone who had asked the question by opening the sheet — moves into the "How it works" disclosure, unchanged; with no sheet there is no such moment, and "why is the list closed, and what does changing it change" is a how-it-works question.

The forced-verdict caution stays where it was, on the result. Moving it to a precondition was considered and rejected: `detector.forcedBody` is written in the past tense ("%@ _was_ the only candidate"), and the only at-rest case is a roster of one, which `detector.rosterLast` already occupies.

Both schemes build clean, and the editor was exercised end to end on an iPhone 17 Pro simulator: collapse and expand, adding a language, removing down to the locked last candidate and its explanation, toggling one row twice without it moving, and reset restoring the derived set and disabling itself again.
